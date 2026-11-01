ALTER TABLE ouro_projects ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE ouro_projects ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE ouro_projects ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE ouro_projects ADD COLUMN IF NOT EXISTS created_by text REFERENCES ouro_principals(id);
UPDATE ouro_projects SET name=COALESCE(name,'Project '||left(id,8)),slug=COALESCE(slug,id),created_at=COALESCE(created_at,now());
CREATE UNIQUE INDEX IF NOT EXISTS ouro_projects_slug_idx ON ouro_projects(slug);

CREATE TABLE IF NOT EXISTS ouro_project_memberships (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES ouro_projects(id),
  user_id text NOT NULL REFERENCES ouro_user_accounts(id),
  role text NOT NULL CHECK (role IN ('Owner','Contributor','Viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL REFERENCES ouro_principals(id),
  UNIQUE(project_id,user_id)
);
CREATE INDEX IF NOT EXISTS ouro_project_memberships_user_idx ON ouro_project_memberships(user_id,project_id);

CREATE TABLE IF NOT EXISTS ouro_project_membership_revocations (
  membership_id text PRIMARY KEY REFERENCES ouro_project_memberships(id),
  revoked_at timestamptz NOT NULL DEFAULT now(),
  revoked_by text NOT NULL REFERENCES ouro_principals(id)
);

CREATE TABLE IF NOT EXISTS ouro_project_membership_role_changes (
  id text PRIMARY KEY,
  membership_id text NOT NULL REFERENCES ouro_project_memberships(id),
  role text NOT NULL CHECK (role IN ('Owner','Contributor','Viewer')),
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by text NOT NULL REFERENCES ouro_principals(id)
);
CREATE INDEX IF NOT EXISTS ouro_project_membership_role_idx ON ouro_project_membership_role_changes(membership_id,changed_at,id);

CREATE TABLE IF NOT EXISTS ouro_project_invitations (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES ouro_projects(id),
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('Owner','Contributor','Viewer')),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL REFERENCES ouro_principals(id),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS ouro_project_invitations_project_idx ON ouro_project_invitations(project_id,created_at);

CREATE TABLE IF NOT EXISTS ouro_project_invitation_acceptances (
  invitation_id text PRIMARY KEY REFERENCES ouro_project_invitations(id),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  accepted_by text NOT NULL REFERENCES ouro_user_accounts(id)
);

CREATE TABLE IF NOT EXISTS ouro_project_invitation_revocations (
  invitation_id text PRIMARY KEY REFERENCES ouro_project_invitations(id),
  revoked_at timestamptz NOT NULL DEFAULT now(),
  revoked_by text NOT NULL REFERENCES ouro_principals(id)
);

CREATE TABLE IF NOT EXISTS ouro_password_reset_tokens (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES ouro_user_accounts(id),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS ouro_password_reset_user_idx ON ouro_password_reset_tokens(user_id,created_at);

CREATE TABLE IF NOT EXISTS ouro_password_reset_confirmations (
  reset_id text PRIMARY KEY REFERENCES ouro_password_reset_tokens(id),
  confirmed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ouro_agent_assignments (
  agent_id text NOT NULL REFERENCES ouro_agent_registrations(id),
  project_id text NOT NULL REFERENCES ouro_projects(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by text NOT NULL REFERENCES ouro_principals(id),
  PRIMARY KEY(agent_id,project_id)
);

CREATE TABLE IF NOT EXISTS ouro_agent_assignment_revocations (
  agent_id text NOT NULL,
  project_id text NOT NULL,
  revoked_at timestamptz NOT NULL DEFAULT now(),
  revoked_by text NOT NULL REFERENCES ouro_principals(id),
  PRIMARY KEY(agent_id,project_id),
  FOREIGN KEY(agent_id,project_id) REFERENCES ouro_agent_assignments(agent_id,project_id)
);

INSERT INTO ouro_agent_assignments(agent_id,project_id,assigned_by)
SELECT id,project_id,created_by FROM ouro_agent_registrations ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS ouro_administrative_facts (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES ouro_projects(id),
  actor_id text NOT NULL REFERENCES ouro_principals(id),
  action text NOT NULL,
  target_id text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ouro_administrative_facts_project_idx ON ouro_administrative_facts(project_id,created_at,id);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'ouro_project_memberships','ouro_project_membership_revocations','ouro_project_membership_role_changes',
    'ouro_project_invitations','ouro_project_invitation_acceptances','ouro_project_invitation_revocations',
    'ouro_password_reset_tokens','ouro_password_reset_confirmations','ouro_agent_assignments',
    'ouro_agent_assignment_revocations','ouro_administrative_facts'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname=table_name||'_immutable_rows') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION ouro_reject_fact_mutation()',table_name||'_immutable_rows',table_name);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname=table_name||'_immutable_truncate') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION ouro_reject_fact_mutation()',table_name||'_immutable_truncate',table_name);
    END IF;
  END LOOP;
END;
$$;

INSERT INTO ouro_schema_migrations(version) VALUES(8) ON CONFLICT DO NOTHING;
