CREATE TABLE IF NOT EXISTS cbt_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_level text NOT NULL, -- 'SD', 'SMP', 'SMA', 'UTBK'
  subject text NOT NULL,     -- 'Matematika', 'Bahasa Indonesia', 'IPA', 'IPS', 'Bahasa Inggris', 'TPS/TPA'
  question_text text NOT NULL,
  options jsonb NOT NULL,    -- array of { id: string, text: string }
  correct_option_id text NOT NULL,
  explanation text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cbt_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  guest_session_id text,
  grade_level text NOT NULL,
  subject text NOT NULL,
  total_questions integer NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30,
  started_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'IN_PROGRESS', -- 'IN_PROGRESS', 'COMPLETED'
  score numeric(5,2) DEFAULT 0,
  correct_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cbt_session_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES cbt_sessions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES cbt_questions(id) ON DELETE CASCADE,
  question_order integer NOT NULL,
  selected_option_id text,
  is_flagged boolean DEFAULT false,
  answered_at timestamptz,
  CONSTRAINT unq_cbt_session_question UNIQUE (session_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_cbt_questions_grade_subject ON cbt_questions(grade_level, subject);
CREATE INDEX IF NOT EXISTS idx_cbt_sessions_user ON cbt_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_cbt_sessions_guest ON cbt_sessions(guest_session_id);
CREATE INDEX IF NOT EXISTS idx_cbt_session_answers_session ON cbt_session_answers(session_id);
