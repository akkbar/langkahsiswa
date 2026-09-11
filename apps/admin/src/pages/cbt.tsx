import React, { useState, useEffect } from "react";
import { api, send } from "../api";

interface Option {
  id: string;
  text: string;
}

interface Question {
  id: string;
  order: number;
  question_text: string;
  options: Option[];
  selected_option_id?: string;
  is_flagged?: boolean;
  correct_option_id?: string;
  explanation?: string;
  is_correct?: boolean;
}

interface CbtSession {
  id: string;
  grade_level: string;
  subject: string;
  total_questions: number;
  duration_minutes: number;
  started_at: string;
  expires_at: string;
  status: "IN_PROGRESS" | "COMPLETED";
  score?: number;
  correct_count?: number;
}

interface OptionsData {
  levels: { id: string; label: string }[];
  subjectMap: Record<string, string[]>;
}

export function CbtPage() {
  const [optionsData, setOptionsData] = useState<OptionsData | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);

  // Setup form states
  const [selectedLevel, setSelectedLevel] = useState("SMA");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [questionCount, setQuestionCount] = useState(5);
  const [errorMsg, setErrorMsg] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  // Session & test states
  const [session, setSession] = useState<CbtSession | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch setup options on load
  useEffect(() => {
    api<OptionsData>("cbt/options")
      .then((res) => {
        setOptionsData(res);
        if (res.levels.length > 0) {
          const firstLevel = res.levels[0].id;
          setSelectedLevel(firstLevel);
          if (res.subjectMap[firstLevel]?.length > 0) {
            setSelectedSubject(res.subjectMap[firstLevel][0]);
          }
        }
      })
      .catch((err) => setErrorMsg("Gagal memuat daftar soal: " + err.message))
      .finally(() => setLoadingOptions(false));
  }, []);

  // Update subject dropdown when level changes
  useEffect(() => {
    if (optionsData && selectedLevel && optionsData.subjectMap[selectedLevel]) {
      const subs = optionsData.subjectMap[selectedLevel];
      if (subs.length > 0 && !subs.includes(selectedSubject)) {
        setSelectedSubject(subs[0]);
      }
    }
  }, [selectedLevel, optionsData]);

  // Timer Countdown Effect
  useEffect(() => {
    if (!session || session.status === "COMPLETED" || remainingSeconds === null)
      return;

    if (remainingSeconds <= 0) {
      handleFinishTest();
      return;
    }

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [session, remainingSeconds]);

  // Start a new test session
  const handleStartTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLevel || !selectedSubject) {
      setErrorMsg("Pilih tingkatan dan mata pelajaran terlebih dahulu");
      return;
    }

    setErrorMsg("");
    setIsStarting(true);

    try {
      // Unique guest identifier stored in localStorage if unauthenticated
      let guestId = localStorage.getItem("cbt_guest_id");
      if (!guestId) {
        guestId = "guest_" + Math.random().toString(36).substring(2, 10);
        localStorage.setItem("cbt_guest_id", guestId);
      }

      const res = await send<{ session: CbtSession; questions: Question[] }>(
        "cbt/sessions",
        {
          grade_level: selectedLevel,
          subject: selectedSubject,
          question_count: questionCount,
          guest_session_id: guestId,
        },
      );

      setSession(res.session);
      setQuestions(res.questions);
      setCurrentIndex(0);

      // Compute remaining time from expires_at
      const expiry = new Date(res.session.expires_at).getTime();
      const now = new Date().getTime();
      const secs = Math.max(0, Math.floor((expiry - now) / 1000));
      setRemainingSeconds(secs);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal memulai latihan CBT");
    } finally {
      setIsStarting(false);
    }
  };

  // User selects an option answer
  const handleSelectOption = async (optionId: string) => {
    if (!session || session.status === "COMPLETED") return;

    const currentQ = questions[currentIndex];
    const updated = [...questions];
    updated[currentIndex] = { ...currentQ, selected_option_id: optionId };
    setQuestions(updated);

    // Save choice directly to database first!
    try {
      await send(`cbt/sessions/${session.id}/answer`, {
        question_id: currentQ.id,
        selected_option_id: optionId,
      });
    } catch (e) {
      console.error("Gagal menyimpan jawaban ke database", e);
    }
  };

  // User toggles Ragu-Ragu flag
  const handleToggleFlag = async () => {
    if (!session || session.status === "COMPLETED") return;

    const currentQ = questions[currentIndex];
    const nextFlagState = !currentQ.is_flagged;
    const updated = [...questions];
    updated[currentIndex] = { ...currentQ, is_flagged: nextFlagState };
    setQuestions(updated);

    // Save action directly to database first!
    try {
      await send(`cbt/sessions/${session.id}/answer`, {
        question_id: currentQ.id,
        is_flagged: nextFlagState,
      });
    } catch (e) {
      console.error("Gagal menyimpan status ragu-ragu ke database", e);
    }
  };

  // Finish test
  const handleFinishTest = async () => {
    if (!session || session.status === "COMPLETED" || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await send<{ session: CbtSession; questions: Question[] }>(
        `cbt/sessions/${session.id}/finish`,
        {},
      );
      setSession(res.session);
      setQuestions(res.questions);
    } catch (err: any) {
      setErrorMsg("Gagal menyelesaikan ujian: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper format time
  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return hours > 0
      ? `${pad(hours)}:${pad(mins)}:${pad(secs)}`
      : `${pad(mins)}:${pad(secs)}`;
  };

  // Stats calculation
  const totalQuestions = questions.length;
  const answeredCount = questions.filter((q) => q.selected_option_id).length;
  const flaggedCount = questions.filter((q) => q.is_flagged).length;
  const unansweredCount = totalQuestions - answeredCount;
  const currentQ = questions[currentIndex];

  // --- VIEW 1: SETUP FORM (if no active session) ---
  if (!session) {
    return (
      <div className="cbt-setup-container">
        <div className="cbt-card cbt-setup-card">
          <div className="cbt-setup-header">
            <span className="cbt-badge">Cimulasi CBT</span>
            <h2>Latihan Soal & Simulasi Ujian</h2>
            <p>
              Pilih tingkat pendidikan, mata pelajaran, dan jumlah soal untuk
              memulai simulasi ujian berbasis komputer.
            </p>
          </div>

          {errorMsg && (
            <div className="cbt-alert cbt-alert-error">{errorMsg}</div>
          )}

          {loadingOptions ? (
            <div className="cbt-loading">Memuat pilihan soal…</div>
          ) : (
            <form onSubmit={handleStartTest} className="cbt-setup-form">
              <div className="cbt-form-group">
                <label>Tingkatan Pendidikan</label>
                <select
                  value={selectedLevel}
                  onChange={(e) => setSelectedLevel(e.target.value)}
                  className="cbt-input"
                >
                  {optionsData?.levels.map((lvl) => (
                    <option key={lvl.id} value={lvl.id}>
                      {lvl.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="cbt-form-group">
                <label>Mata Pelajaran</label>
                <select
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="cbt-input"
                >
                  {(optionsData?.subjectMap[selectedLevel] || []).map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
                </select>
              </div>

              <div className="cbt-form-group">
                <label>Jumlah Soal</label>
                <select
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Number(e.target.value))}
                  className="cbt-input"
                >
                  <option value={5}>5 Soal (Singkat)</option>
                  <option value={10}>10 Soal (Sedang)</option>
                  <option value={15}>15 Soal (Lengkap)</option>
                  <option value={20}>20 Soal (Simulasi Penuh)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={isStarting}
                className="cbt-btn cbt-btn-primary cbt-btn-block"
              >
                {isStarting ? "Menyiapkan Ujian…" : "Mulai Simulasi CBT"}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // --- VIEW 2: COMPLETED RESULT SCREEN ---
  if (session.status === "COMPLETED") {
    return (
      <div className="cbt-result-container">
        <div className="cbt-card cbt-result-card">
          <div className="cbt-result-header">
            <h2>Hasil Simulasi CBT</h2>
            <p>
              {session.grade_level} - {session.subject}
            </p>
          </div>

          <div className="cbt-score-banner">
            <div className="cbt-score-circle">
              <span className="cbt-score-val">{session.score}</span>
              <span className="cbt-score-label">Nilai Akhir</span>
            </div>
            <div className="cbt-score-details">
              <div>
                <strong>Benar:</strong> {session.correct_count} /{" "}
                {session.total_questions} Soal
              </div>
              <div>
                <strong>Salah:</strong>{" "}
                {session.total_questions - (session.correct_count || 0)} Soal
              </div>
              <div>
                <strong>Status:</strong>{" "}
                {session.score && session.score >= 70
                  ? "LULUS / SANGAT BAIK"
                  : "PERLU LATIHAN LAGI"}
              </div>
            </div>
          </div>

          <h3>Pembahasan & Evaluasi Soal</h3>
          <div className="cbt-review-list">
            {questions.map((q, idx) => (
              <div
                key={q.id}
                className={`cbt-review-item ${q.is_correct ? "is-correct" : "is-wrong"}`}
              >
                <div className="cbt-review-header">
                  <span>Soal No. {idx + 1}</span>
                  <span
                    className={`cbt-status-tag ${q.is_correct ? "correct" : "wrong"}`}
                  >
                    {q.is_correct ? "✓ Benar" : "✕ Salah"}
                  </span>
                </div>
                <div className="cbt-review-text">{q.question_text}</div>
                <div className="cbt-review-options">
                  {q.options.map((opt) => {
                    const isUserPick = q.selected_option_id === opt.id;
                    const isKey = q.correct_option_id === opt.id;
                    let optClass = "";
                    if (isKey) optClass = "key-option";
                    else if (isUserPick && !isKey) optClass = "wrong-option";

                    return (
                      <div
                        key={opt.id}
                        className={`cbt-review-opt ${optClass}`}
                      >
                        <strong>{opt.id}.</strong> {opt.text}
                        {isUserPick && (
                          <span className="tag-user"> (Jawaban Anda)</span>
                        )}
                        {isKey && (
                          <span className="tag-key"> (Kunci Jawaban)</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {q.explanation && (
                  <div className="cbt-explanation">
                    <strong>Pembahasan:</strong> {q.explanation}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="cbt-result-actions">
            <button
              onClick={() => {
                setSession(null);
                setQuestions([]);
              }}
              className="cbt-btn cbt-btn-primary"
            >
              Coba Ujian Baru
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- VIEW 3: ACTIVE 4-SECTION CBT WORKSPACE ---
  return (
    <div className="cbt-layout">
      {/* 1. HEADER: Metadata soal, sesi, waktu sisa */}
      <header className="cbt-header">
        <div className="cbt-header-meta">
          <span className="cbt-subject-tag">
            {session.grade_level} · {session.subject}
          </span>
          <span className="cbt-session-info">
            Sesi: #{session.id.substring(0, 8)}
          </span>
        </div>
        <div className="cbt-header-timer">
          <span className="cbt-timer-label">WAKTU SISA</span>
          <span
            className={`cbt-timer-clock ${remainingSeconds && remainingSeconds < 300 ? "urgent" : ""}`}
          >
            ⏱️{" "}
            {remainingSeconds !== null ? formatTime(remainingSeconds) : "--:--"}
          </span>
        </div>
      </header>

      {/* BODY: Split Kiri (Navigasi) & Kanan (Soal + Jawaban) */}
      <div className="cbt-body">
        {/* 2. BODY LEFT (SMALLER): Navigasi Semua Soal */}
        <aside className="cbt-sidebar-nav">
          <div className="cbt-nav-title">Navigasi Soal</div>
          <div className="cbt-grid-nav">
            {questions.map((q, idx) => {
              const isCurrent = idx === currentIndex;
              const isAnswered = Boolean(q.selected_option_id);
              const isFlagged = q.is_flagged;

              let btnClass = "cbt-nav-btn";
              if (isCurrent) btnClass += " active";
              if (isFlagged) btnClass += " flagged";
              else if (isAnswered) btnClass += " answered";

              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentIndex(idx)}
                  className={btnClass}
                  title={`Soal ${idx + 1} ${isFlagged ? "(Ragu-ragu)" : isAnswered ? "(Sudah dijawab)" : "(Belum)"}`}
                >
                  {idx + 1}
                  {isFlagged && <span className="flag-dot">🚩</span>}
                </button>
              );
            })}
          </div>

          <div className="cbt-nav-legend">
            <div>
              <span className="dot dot-current"></span> Aktif
            </div>
            <div>
              <span className="dot dot-answered"></span> Dijawab
            </div>
            <div>
              <span className="dot dot-flagged"></span> Ragu-ragu
            </div>
            <div>
              <span className="dot dot-empty"></span> Belum
            </div>
          </div>
        </aside>

        {/* 3. BODY RIGHT (LEBAR): Soal, Pilihan Jawaban, & Flag Ragu-ragu */}
        <main className="cbt-main-content">
          {currentQ && (
            <div className="cbt-question-card">
              <div className="cbt-question-header">
                <h3>
                  Soal No. {currentIndex + 1} dari {totalQuestions}
                </h3>

                {/* FITUR FLAG RAGU-RAGU */}
                <button
                  type="button"
                  onClick={handleToggleFlag}
                  className={`cbt-flag-btn ${currentQ.is_flagged ? "is-flagged" : ""}`}
                >
                  {currentQ.is_flagged
                    ? "🚩 Ragu-Ragu (Aktif)"
                    : "🏳️ Tandai Ragu-Ragu"}
                </button>
              </div>

              <div className="cbt-question-stem">{currentQ.question_text}</div>

              <div className="cbt-options-list">
                {currentQ.options.map((opt) => {
                  const isSelected = currentQ.selected_option_id === opt.id;
                  return (
                    <div
                      key={opt.id}
                      onClick={() => handleSelectOption(opt.id)}
                      className={`cbt-option-item ${isSelected ? "selected" : ""}`}
                    >
                      <span className="cbt-option-badge">{opt.id}</span>
                      <span className="cbt-option-text">{opt.text}</span>
                    </div>
                  );
                })}
              </div>

              <div className="cbt-question-actions">
                <button
                  disabled={currentIndex === 0}
                  onClick={() =>
                    setCurrentIndex((prev) => Math.max(0, prev - 1))
                  }
                  className="cbt-btn cbt-btn-secondary"
                >
                  ← Soal Sebelumnya
                </button>

                {currentIndex < totalQuestions - 1 ? (
                  <button
                    onClick={() =>
                      setCurrentIndex((prev) =>
                        Math.min(totalQuestions - 1, prev + 1),
                      )
                    }
                    className="cbt-btn cbt-btn-primary"
                  >
                    Soal Selanjutnya →
                  </button>
                ) : (
                  <button
                    onClick={handleFinishTest}
                    disabled={isSubmitting}
                    className="cbt-btn cbt-btn-success"
                  >
                    {isSubmitting ? "Menyimpan..." : "Selesai Ujian ✔"}
                  </button>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* 4. FOOTER: Stat Progress Soal */}
      <footer className="cbt-footer">
        <div className="cbt-stat-item">
          <span>Progress Soal:</span>
          <div className="cbt-progress-bar">
            <div
              className="cbt-progress-fill"
              style={{ width: `${(answeredCount / totalQuestions) * 100}%` }}
            ></div>
          </div>
          <span>
            {answeredCount} / {totalQuestions} (
            {Math.round((answeredCount / totalQuestions) * 100)}%)
          </span>
        </div>

        <div className="cbt-stat-counts">
          <span className="stat-badge stat-answered">
            Sudah Dijawab: {answeredCount}
          </span>
          <span className="stat-badge stat-unanswered">
            Belum: {unansweredCount}
          </span>
          <span className="stat-badge stat-flagged">
            Ragu-ragu: {flaggedCount}
          </span>
        </div>

        <button
          onClick={handleFinishTest}
          disabled={isSubmitting}
          className="cbt-btn cbt-btn-finish"
        >
          {isSubmitting ? "Memproses..." : "Kumpulkan Jawaban"}
        </button>
      </footer>
    </div>
  );
}
