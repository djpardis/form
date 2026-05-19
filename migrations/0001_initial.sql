CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  origin TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  payload TEXT NOT NULL,
  checks TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS submissions_form_submitted_at_idx
  ON submissions (form_id, submitted_at DESC);
