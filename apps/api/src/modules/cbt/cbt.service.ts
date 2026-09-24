import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Request } from "express";
import jwt from "jsonwebtoken";
import { jwtSecret } from "../../config";
import { Database } from "../../database/database.service";

@Injectable()
export class CbtService {
  constructor(
    @Inject(Database)
    private readonly db: Database,
  ) {}
  private async getUserId(req: Request): Promise<string | null> {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7)
        : (req as any).cookies?.access_token;
      if (!token) return null;
      const payload = jwt.verify(token, jwtSecret()) as {
        sub: string;
      };
      return payload.sub || null;
    } catch {
      return null;
    }
  }
  async getOptions() {
    const result = await this.db
      .query(`SELECT grade_level, subject, COUNT(*)::int as count 
       FROM cbt_questions 
       GROUP BY grade_level, subject 
       ORDER BY grade_level, subject`);
    const levels = [
      { id: "SD", label: "SD (Sekolah Dasar)" },
      { id: "SMP", label: "SMP (Sekolah Menengah Pertama)" },
      { id: "SMA", label: "SMA (Sekolah Menengah Atas)" },
      { id: "UTBK", label: "UTBK / SNBT (Persiapan Kuliah)" },
    ];
    const subjectMap: Record<string, string[]> = {};
    for (const row of result.rows) {
      if (!subjectMap[row.grade_level]) {
        subjectMap[row.grade_level] = [];
      }
      subjectMap[row.grade_level].push(row.subject);
    }
    return {
      levels,
      subjectMap,
      rawCounts: result.rows,
    };
  }
  async createSession(
    req: Request,
    body: {
      grade_level: string;
      subject: string;
      question_count: number;
      guest_session_id?: string;
    },
  ) {
    const { grade_level, subject, question_count = 5, guest_session_id } = body;
    if (!grade_level || !subject) {
      throw new BadRequestException(
        "Tingkatan dan mata pelajaran wajib dipilih",
      );
    }
    const userId = await this.getUserId(req);
    // Fetch random questions
    const qResult = await this.db.query(
      `SELECT id, grade_level, subject, question_text, options
       FROM cbt_questions
       WHERE grade_level = $1 AND subject = $2
       ORDER BY RANDOM()
       LIMIT $3`,
      [grade_level, subject, Math.max(1, Math.min(question_count, 50))],
    );
    if (qResult.rows.length === 0) {
      throw new NotFoundException(
        `Belum ada soal tersedia untuk ${grade_level} - ${subject}`,
      );
    }
    const questions = qResult.rows;
    const count = questions.length;
    // Calculate duration: ~2 minutes per question, min 10 mins
    const durationMinutes = Math.max(10, Math.ceil(count * 2));
    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
    // Insert session into DB
    const sessionRes = await this.db.query(
      `INSERT INTO cbt_sessions 
       (user_id, guest_session_id, grade_level, subject, total_questions, duration_minutes, expires_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'IN_PROGRESS')
       RETURNING id, grade_level, subject, total_questions, duration_minutes, started_at, expires_at, status`,
      [
        userId,
        guest_session_id || null,
        grade_level,
        subject,
        count,
        durationMinutes,
        expiresAt.toISOString(),
      ],
    );
    const session = sessionRes.rows[0];
    // Insert questions into session_answers
    for (let i = 0; i < questions.length; i++) {
      await this.db.query(
        `INSERT INTO cbt_session_answers (session_id, question_id, question_order)
         VALUES ($1, $2, $3)`,
        [session.id, questions[i].id, i + 1],
      );
    }
    return {
      session,
      questions: questions.map((q, index) => ({
        id: q.id,
        order: index + 1,
        question_text: q.question_text,
        options: q.options,
      })),
    };
  }
  async getSession(id: string) {
    const sessionRes = await this.db.query(
      `SELECT id, grade_level, subject, total_questions, duration_minutes, started_at, expires_at, status, score, correct_count
       FROM cbt_sessions
       WHERE id = $1`,
      [id],
    );
    if (!sessionRes.rowCount) {
      throw new NotFoundException("Sesi CBT tidak ditemukan");
    }
    const session = sessionRes.rows[0];
    const answersRes = await this.db.query(
      `SELECT sa.question_id, sa.question_order, sa.selected_option_id, sa.is_flagged,
              q.question_text, q.options, q.correct_option_id, q.explanation
       FROM cbt_session_answers sa
       JOIN cbt_questions q ON q.id = sa.question_id
       WHERE sa.session_id = $1
       ORDER BY sa.question_order ASC`,
      [id],
    );
    const isCompleted = session.status === "COMPLETED";
    const questions = answersRes.rows.map((row) => ({
      id: row.question_id,
      order: row.question_order,
      question_text: row.question_text,
      options: row.options,
      selected_option_id: row.selected_option_id,
      is_flagged: row.is_flagged,
      // Only include answer key & explanation if session is already COMPLETED
      ...(isCompleted
        ? {
            correct_option_id: row.correct_option_id,
            explanation: row.explanation,
          }
        : {}),
    }));
    return {
      session,
      questions,
    };
  }
  async saveAnswer(
    id: string,
    body: {
      question_id: string;
      selected_option_id?: string;
      is_flagged?: boolean;
    },
  ) {
    const { question_id, selected_option_id, is_flagged } = body;
    const sessionRes = await this.db.query(
      `SELECT status FROM cbt_sessions WHERE id = $1`,
      [id],
    );
    if (!sessionRes.rowCount) {
      throw new NotFoundException("Sesi CBT tidak ditemukan");
    }
    if (sessionRes.rows[0].status === "COMPLETED") {
      throw new BadRequestException("Sesi CBT sudah selesai");
    }
    let updateFields: string[] = [];
    let values: any[] = [id, question_id];
    let idx = 3;
    if (selected_option_id !== undefined) {
      updateFields.push(`selected_option_id = $${idx++}`);
      values.push(selected_option_id);
    }
    if (is_flagged !== undefined) {
      updateFields.push(`is_flagged = $${idx++}`);
      values.push(is_flagged);
    }
    updateFields.push(`answered_at = now()`);
    if (updateFields.length > 1) {
      await this.db.query(
        `UPDATE cbt_session_answers 
         SET ${updateFields.join(", ")} 
         WHERE session_id = $1 AND question_id = $2`,
        values,
      );
    }
    return { success: true };
  }
  async finishSession(id: string) {
    const sessionRes = await this.db.query(
      `SELECT id, total_questions, status FROM cbt_sessions WHERE id = $1`,
      [id],
    );
    if (!sessionRes.rowCount) {
      throw new NotFoundException("Sesi CBT tidak ditemukan");
    }
    const answersRes = await this.db.query(
      `SELECT sa.question_id, sa.question_order, sa.selected_option_id, sa.is_flagged,
              q.question_text, q.options, q.correct_option_id, q.explanation
       FROM cbt_session_answers sa
       JOIN cbt_questions q ON q.id = sa.question_id
       WHERE sa.session_id = $1
       ORDER BY sa.question_order ASC`,
      [id],
    );
    let correctCount = 0;
    for (const row of answersRes.rows) {
      if (
        row.selected_option_id &&
        row.selected_option_id === row.correct_option_id
      ) {
        correctCount++;
      }
    }
    const total =
      sessionRes.rows[0].total_questions || answersRes.rows.length || 1;
    const score = Number(((correctCount / total) * 100).toFixed(2));
    await this.db.query(
      `UPDATE cbt_sessions 
       SET status = 'COMPLETED', score = $1, correct_count = $2
       WHERE id = $3`,
      [score, correctCount, id],
    );
    const questions = answersRes.rows.map((row) => ({
      id: row.question_id,
      order: row.question_order,
      question_text: row.question_text,
      options: row.options,
      selected_option_id: row.selected_option_id,
      correct_option_id: row.correct_option_id,
      is_flagged: row.is_flagged,
      explanation: row.explanation,
      is_correct: row.selected_option_id === row.correct_option_id,
    }));
    return {
      session: {
        id,
        status: "COMPLETED",
        score,
        correct_count: correctCount,
        total_questions: total,
      },
      questions,
    };
  }

  async listSessions(req: Request) {
    const userId = await this.getUserId(req);
    const guestId = (req as any).cookies?.cbt_guest_id || null;

    let whereClause = "";
    const params: any[] = [];

    if (userId) {
      whereClause = "WHERE user_id = $1";
      params.push(userId);
    } else if (guestId) {
      whereClause = "WHERE guest_session_id = $1";
      params.push(guestId);
    } else {
      return { sessions: [] };
    }

    const result = await this.db.query(
      `SELECT id, grade_level, subject, total_questions, duration_minutes, 
              started_at, expires_at, status, score, correct_count
       FROM cbt_sessions
       ${whereClause}
       ORDER BY started_at DESC
       LIMIT 50`,
      params,
    );

    return { sessions: result.rows };
  }
}
