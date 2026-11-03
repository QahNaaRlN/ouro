-- Recovery overlays never rewrite the original immutable folder registration.
CREATE TABLE IF NOT EXISTS ouro_workspace_binding_recoveries (
  id text PRIMARY KEY,
  sequence bigserial UNIQUE NOT NULL,
  project_id text NOT NULL REFERENCES ouro_projects(id),
  old_binding_id text NOT NULL,
  new_binding_id text NOT NULL UNIQUE,
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id,old_binding_id)
);

CREATE TABLE IF NOT EXISTS ouro_workspace_binding_recovery_receipts (
  project_id text NOT NULL REFERENCES ouro_projects(id),
  actor_id text NOT NULL REFERENCES ouro_principals(id),
  request_id text NOT NULL,
  payload_hash text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id,actor_id,request_id)
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['ouro_workspace_binding_recoveries','ouro_workspace_binding_recovery_receipts'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname=table_name||'_immutable_rows') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION ouro_reject_fact_mutation()',table_name||'_immutable_rows',table_name);
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname=table_name||'_immutable_truncate') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION ouro_reject_fact_mutation()',table_name||'_immutable_truncate',table_name);
    END IF;
  END LOOP;
END; $$;
INSERT INTO ouro_schema_migrations(version) VALUES(10) ON CONFLICT DO NOTHING;
