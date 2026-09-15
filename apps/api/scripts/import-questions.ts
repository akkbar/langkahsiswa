import "../src/config";
import { Database } from "../src/database/database.service";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface QuestionImportItem {
  grade_level: string;
  subject: string;
  question_text: string;
  options: { id: string; text: string }[];
  correct_option_id: string;
  explanation?: string;
}

export async function importQuestionsFromFile(db: Database, filePath: string) {
  const fullPath = resolve(process.cwd(), filePath);
  console.log(`Reading question dataset from ${fullPath}...`);

  const rawData = await readFile(fullPath, "utf8");
  const questions: QuestionImportItem[] = JSON.parse(rawData);

  if (!Array.isArray(questions)) {
    throw new Error("Format JSON harus berupa array berisi objek soal.");
  }

  console.log(`Importing ${questions.length} questions into cbt_questions...`);
  let inserted = 0;
  let skipped = 0;

  for (const q of questions) {
    if (
      !q.grade_level ||
      !q.subject ||
      !q.question_text ||
      !q.options ||
      !q.correct_option_id
    ) {
      skipped++;
      continue;
    }

    const existing = await db.query(
      "SELECT id FROM cbt_questions WHERE grade_level=$1 AND subject=$2 AND question_text=$3",
      [q.grade_level, q.subject, q.question_text],
    );

    if (existing.rowCount === 0) {
      await db.query(
        `INSERT INTO cbt_questions (grade_level, subject, question_text, options, correct_option_id, explanation)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          q.grade_level,
          q.subject,
          q.question_text,
          JSON.stringify(q.options),
          q.correct_option_id,
          q.explanation || "",
        ],
      );
      inserted++;
    } else {
      skipped++;
    }
  }

  console.log(
    `Import Selesai: ${inserted} soal berhasil ditambahkan, ${skipped} soal dilewati/duplikat.`,
  );
}

if (require.main === module) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error(
      "Gunakan perintah: npx tsx apps/api/scripts/import-questions.ts <path-to-json>",
    );
    process.exit(1);
  }

  const db = new Database();
  importQuestionsFromFile(db, filePath)
    .catch((err) => console.error(err))
    .finally(() => db.onModuleDestroy());
}
