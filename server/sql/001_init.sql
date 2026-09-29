CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  volume DOUBLE PRECISION NOT NULL DEFAULT 0.7 CHECK (volume >= 0 AND volume <= 1),
  announcement_interval_ms INTEGER NOT NULL DEFAULT 5000 CHECK (announcement_interval_ms BETWEEN 2000 AND 15000),
  spatial_mode TEXT NOT NULL DEFAULT 'hrtf' CHECK (spatial_mode IN ('stereo', 'hrtf'))
);
