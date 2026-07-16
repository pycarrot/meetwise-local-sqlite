PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  email TEXT NOT NULL, password_hash TEXT NOT NULL, display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000), updated_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
);
CREATE UNIQUE INDEX users_email_lower_uq ON users(lower(email));

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  name TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000), updated_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
);

CREATE TABLE workspace_members (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('owner','admin','member','viewer')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000), updated_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
);
CREATE UNIQUE INDEX workspace_members_workspace_user_uq ON workspace_members(workspace_id,user_id);
CREATE INDEX workspace_members_user_idx ON workspace_members(user_id);
CREATE INDEX workspace_members_workspace_idx ON workspace_members(workspace_id);

CREATE TABLE meetings (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title TEXT NOT NULL, source TEXT NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL,
  deleted_at INTEGER, created_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000), updated_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
);
CREATE INDEX meetings_workspace_started_idx ON meetings(workspace_id,started_at);
CREATE INDEX meetings_workspace_created_idx ON meetings(workspace_id,created_at);
CREATE INDEX meetings_created_by_idx ON meetings(created_by);

CREATE TABLE transcript_segments (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  client_id TEXT, position INTEGER NOT NULL, speaker TEXT NOT NULL, text TEXT NOT NULL,
  start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
);
CREATE UNIQUE INDEX transcript_segments_meeting_position_uq ON transcript_segments(meeting_id,position);
CREATE INDEX transcript_segments_meeting_idx ON transcript_segments(meeting_id);
CREATE INDEX transcript_segments_speaker_idx ON transcript_segments(speaker);
CREATE VIRTUAL TABLE transcript_segments_fts USING fts5(text, content='transcript_segments', content_rowid='rowid', tokenize='unicode61');
CREATE TRIGGER transcript_segments_ai AFTER INSERT ON transcript_segments BEGIN
  INSERT INTO transcript_segments_fts(rowid,text) VALUES (new.rowid,new.text);
END;
CREATE TRIGGER transcript_segments_ad AFTER DELETE ON transcript_segments BEGIN
  INSERT INTO transcript_segments_fts(transcript_segments_fts,rowid,text) VALUES('delete',old.rowid,old.text);
END;
CREATE TRIGGER transcript_segments_au AFTER UPDATE OF text ON transcript_segments BEGIN
  INSERT INTO transcript_segments_fts(transcript_segments_fts,rowid,text) VALUES('delete',old.rowid,old.text);
  INSERT INTO transcript_segments_fts(rowid,text) VALUES(new.rowid,new.text);
END;

CREATE TABLE analyses (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  meeting_id TEXT NOT NULL UNIQUE REFERENCES meetings(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed')),
  model TEXT, result TEXT CHECK(result IS NULL OR json_valid(result)), failure_reason TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0, started_at INTEGER, completed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000), updated_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
);
CREATE INDEX analyses_status_idx ON analyses(status);

CREATE TABLE decisions (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE, position INTEGER NOT NULL, text TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
);
CREATE INDEX decisions_analysis_idx ON decisions(analysis_id);

CREATE TABLE action_items (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE, position INTEGER NOT NULL,
  owner TEXT NOT NULL, task TEXT NOT NULL, due TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
);
CREATE INDEX action_items_analysis_idx ON action_items(analysis_id);

CREATE TABLE web_sessions (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, csrf_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000), revoked_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
);
CREATE INDEX web_sessions_user_idx ON web_sessions(user_id);
CREATE INDEX web_sessions_expires_idx ON web_sessions(expires_at);

CREATE TABLE extension_sessions (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL UNIQUE, refresh_expires_at INTEGER NOT NULL, access_version INTEGER NOT NULL DEFAULT 1,
  last_used_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000), revoked_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
);
CREATE INDEX extension_sessions_user_idx ON extension_sessions(user_id);
CREATE INDEX extension_sessions_workspace_idx ON extension_sessions(workspace_id);

CREATE TABLE ingestion_keys (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  extension_session_id TEXT NOT NULL REFERENCES extension_sessions(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, key TEXT NOT NULL, request_hash TEXT NOT NULL,
  meeting_id TEXT REFERENCES meetings(id) ON DELETE SET NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
);
CREATE UNIQUE INDEX ingestion_keys_session_key_uq ON ingestion_keys(extension_session_id,key);
CREATE INDEX ingestion_keys_created_idx ON ingestion_keys(created_at);

CREATE TABLE analysis_jobs (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed')),
  run_after INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000), locked_at INTEGER, locked_by TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0, last_error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000), updated_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
);
CREATE INDEX analysis_jobs_claim_idx ON analysis_jobs(status,run_after);
CREATE INDEX analysis_jobs_analysis_idx ON analysis_jobs(analysis_id);
CREATE UNIQUE INDEX analysis_jobs_active_uq ON analysis_jobs(analysis_id) WHERE status IN ('pending','running');

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  action TEXT NOT NULL, target_type TEXT, target_id TEXT, success INTEGER NOT NULL CHECK(success IN (0,1)), ip_hash TEXT,
  metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)), created_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
);
CREATE INDEX audit_logs_workspace_created_idx ON audit_logs(workspace_id,created_at);
CREATE INDEX audit_logs_actor_created_idx ON audit_logs(actor_user_id,created_at);
CREATE INDEX audit_logs_action_idx ON audit_logs(action);
