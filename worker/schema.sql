-- ---------------------------------------------------------------------------
-- Titanium Army — Cloudflare D1 schema (SQLite dialect, UUID text ids so the
-- SAME rows work under the Node/better-sqlite3 runtime too).
-- Apply with:  npx wrangler d1 execute titanium-army --file=./worker/schema.sql
-- ---------------------------------------------------------------------------

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','editor','member')),
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS videos (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  category    TEXT NOT NULL DEFAULT 'EXTREME SCIENCE',
  description TEXT NOT NULL DEFAULT '',
  url         TEXT NOT NULL DEFAULT '',
  thumbnail   TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','draft')),
  views_label TEXT NOT NULL DEFAULT '—',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS content (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category);
