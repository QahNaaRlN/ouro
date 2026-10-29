-- Local operator's immutable folder catalog. Domain history stays project-scoped.
CREATE TABLE IF NOT EXISTS ouro_workspace_projects (
  id text PRIMARY KEY REFERENCES ouro_projects(id),
  name text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('folder','demo')),
  root_path text UNIQUE,
  binding_id text UNIQUE,
  root_dev text,
  root_ino text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  CHECK ((kind='demo' AND root_path IS NULL AND binding_id IS NULL AND root_dev IS NULL AND root_ino IS NULL)
    OR (kind='folder' AND root_path IS NOT NULL AND binding_id IS NOT NULL AND root_dev IS NOT NULL AND root_ino IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS ouro_workspace_receipts (
  actor_id text NOT NULL REFERENCES ouro_principals(id),
  request_id text NOT NULL,
  payload_hash text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id,request_id)
);

-- One catalog lock serializes aliases and idempotency across PostgreSQL processes.
CREATE TABLE IF NOT EXISTS ouro_workspace_catalog_lock (
  id integer PRIMARY KEY CHECK(id=1)
);
INSERT INTO ouro_workspace_catalog_lock(id) VALUES(1) ON CONFLICT DO NOTHING;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['ouro_workspace_projects','ouro_workspace_receipts'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname=table_name||'_immutable_rows') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION ouro_reject_fact_mutation()',table_name||'_immutable_rows',table_name);
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname=table_name||'_immutable_truncate') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION ouro_reject_fact_mutation()',table_name||'_immutable_truncate',table_name);
    END IF;
  END LOOP;
END; $$;
INSERT INTO ouro_schema_migrations(version) VALUES(6) ON CONFLICT DO NOTHING;
