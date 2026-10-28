CREATE TABLE IF NOT EXISTS ouro_participant_registrations (
  id text PRIMARY KEY REFERENCES ouro_principals(id),
  project_id text NOT NULL REFERENCES ouro_projects(id),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL REFERENCES ouro_principals(id)
);
CREATE INDEX IF NOT EXISTS ouro_participant_registrations_project_idx ON ouro_participant_registrations(project_id,created_at);
CREATE TABLE IF NOT EXISTS ouro_participant_credentials (
  participant_id text PRIMARY KEY REFERENCES ouro_participant_registrations(id),
  credential_hash text NOT NULL UNIQUE CHECK (credential_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ouro_participant_revocations (
  participant_id text PRIMARY KEY REFERENCES ouro_participant_registrations(id),
  revoked_at timestamptz NOT NULL DEFAULT now(),
  revoked_by text NOT NULL REFERENCES ouro_principals(id)
);
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['ouro_participant_registrations','ouro_participant_credentials','ouro_participant_revocations'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname=table_name||'_immutable_rows') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION ouro_reject_fact_mutation()',table_name||'_immutable_rows',table_name);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname=table_name||'_immutable_truncate') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION ouro_reject_fact_mutation()',table_name||'_immutable_truncate',table_name);
    END IF;
  END LOOP;
END;
$$;
INSERT INTO ouro_schema_migrations(version) VALUES(4) ON CONFLICT DO NOTHING;
