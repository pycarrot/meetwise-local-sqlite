CREATE TYPE account_status AS ENUM ('active', 'disabled');
CREATE TYPE workspace_role AS ENUM ('owner', 'admin', 'member', 'viewer');
CREATE TYPE analysis_status AS ENUM ('pending', 'running', 'completed', 'failed');
CREATE TYPE job_status AS ENUM ('pending', 'running', 'completed', 'failed');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL, password_hash text NOT NULL,
  display_name text NOT NULL, status account_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(email));

CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, role workspace_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);
CREATE INDEX workspace_members_user_idx ON workspace_members(user_id);
CREATE INDEX workspace_members_workspace_idx ON workspace_members(workspace_id);

CREATE TABLE meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, title text NOT NULL, source text NOT NULL,
  started_at timestamptz NOT NULL, ended_at timestamptz NOT NULL, deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meetings_dates_check CHECK (ended_at >= started_at)
);
CREATE INDEX meetings_workspace_started_idx ON meetings(workspace_id, started_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX meetings_workspace_created_idx ON meetings(workspace_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX meetings_created_by_idx ON meetings(created_by);

CREATE TABLE transcript_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  client_id text, position integer NOT NULL, speaker text NOT NULL, text text NOT NULL,
  start_ms integer NOT NULL, end_ms integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(meeting_id, position), CONSTRAINT transcript_times_check CHECK (start_ms >= 0 AND end_ms >= start_ms)
);
CREATE INDEX transcript_segments_meeting_idx ON transcript_segments(meeting_id);
CREATE INDEX transcript_segments_speaker_idx ON transcript_segments(speaker);
CREATE INDEX transcript_segments_search_idx ON transcript_segments USING gin(to_tsvector('simple', text));

CREATE TABLE analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), meeting_id uuid NOT NULL UNIQUE REFERENCES meetings(id) ON DELETE CASCADE,
  status analysis_status NOT NULL DEFAULT 'pending', model text, result jsonb, failure_reason text,
  attempt_count integer NOT NULL DEFAULT 0, started_at timestamptz, completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analyses_status_idx ON analyses(status);

CREATE TABLE decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), analysis_id uuid NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  position integer NOT NULL, text text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX decisions_analysis_idx ON decisions(analysis_id);
CREATE TABLE action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), analysis_id uuid NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  position integer NOT NULL, owner text NOT NULL, task text NOT NULL, due text NOT NULL,
  completed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX action_items_analysis_idx ON action_items(analysis_id);

CREATE TABLE web_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE, csrf_hash text NOT NULL, expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX web_sessions_user_idx ON web_sessions(user_id);
CREATE INDEX web_sessions_expires_idx ON web_sessions(expires_at);

CREATE TABLE extension_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, refresh_token_hash text NOT NULL UNIQUE,
  refresh_expires_at timestamptz NOT NULL, access_version integer NOT NULL DEFAULT 1,
  last_used_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX extension_sessions_user_idx ON extension_sessions(user_id);
CREATE INDEX extension_sessions_workspace_idx ON extension_sessions(workspace_id);

CREATE TABLE ingestion_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), extension_session_id uuid NOT NULL REFERENCES extension_sessions(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, key text NOT NULL, request_hash text NOT NULL,
  meeting_id uuid REFERENCES meetings(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(extension_session_id, key)
);
CREATE INDEX ingestion_keys_created_idx ON ingestion_keys(created_at);

CREATE TABLE analysis_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), analysis_id uuid NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, status job_status NOT NULL DEFAULT 'pending',
  run_after timestamptz NOT NULL DEFAULT now(), locked_at timestamptz, locked_by text,
  attempt_count integer NOT NULL DEFAULT 0, last_error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analysis_jobs_claim_idx ON analysis_jobs(status, run_after);
CREATE INDEX analysis_jobs_analysis_idx ON analysis_jobs(analysis_id);
CREATE UNIQUE INDEX analysis_jobs_active_uq ON analysis_jobs(analysis_id) WHERE status IN ('pending', 'running');

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL, action text NOT NULL, target_type text,
  target_id uuid, success boolean NOT NULL, ip_hash text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_workspace_created_idx ON audit_logs(workspace_id, created_at DESC);
CREATE INDEX audit_logs_actor_created_idx ON audit_logs(actor_user_id, created_at DESC);
CREATE INDEX audit_logs_action_idx ON audit_logs(action);
