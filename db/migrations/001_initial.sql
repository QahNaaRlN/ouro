-- PostgreSQL 17 / PGlite. Authoritative facts are append-only; project.version is a
-- mutable concurrency cursor, not a business fact. Run with a dedicated database.
CREATE TABLE IF NOT EXISTS ouro_schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ouro_projects (
  id text PRIMARY KEY,
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0)
);

CREATE TABLE IF NOT EXISTS ouro_principals (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('human', 'agent', 'service'))
);

CREATE TABLE IF NOT EXISTS ouro_specs (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES ouro_projects(id),
  human_id text NOT NULL,
  UNIQUE (project_id, human_id)
);

CREATE TABLE IF NOT EXISTS ouro_spec_revisions (
  id text PRIMARY KEY,
  spec_id text NOT NULL REFERENCES ouro_specs(id),
  revision integer NOT NULL CHECK (revision > 0),
  content jsonb NOT NULL,
  content_hash text NOT NULL,
  UNIQUE (spec_id, revision)
);

CREATE TABLE IF NOT EXISTS ouro_domain_events (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES ouro_projects(id),
  version bigint NOT NULL CHECK (version > 0),
  event_type text NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version = 1),
  actor_id text NOT NULL REFERENCES ouro_principals(id),
  occurred_at timestamptz NOT NULL,
  event jsonb NOT NULL,
  UNIQUE (project_id, version),
  CHECK (event->>'id' = id),
  CHECK ((event->>'version')::bigint = version),
  CHECK (event->>'projectId' = project_id)
);

CREATE INDEX IF NOT EXISTS ouro_events_spec_idx
  ON ouro_domain_events (project_id, (event->>'specId'), version);

CREATE TABLE IF NOT EXISTS ouro_command_receipts (
  actor_id text NOT NULL REFERENCES ouro_principals(id),
  project_id text NOT NULL REFERENCES ouro_projects(id),
  request_id text NOT NULL,
  payload_hash text NOT NULL,
  response jsonb NOT NULL,
  cursor bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, actor_id, request_id)
);

-- Outbox entries are created in the same transaction as their domain events.
-- This prototype serves committed events by cursor; it does not claim an
-- external broker delivery. A future publisher keeps mutable leases separately.
CREATE TABLE IF NOT EXISTS ouro_outbox (
  event_id text PRIMARY KEY REFERENCES ouro_domain_events(id),
  project_id text NOT NULL REFERENCES ouro_projects(id),
  cursor bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, cursor)
);

CREATE OR REPLACE FUNCTION ouro_reject_fact_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Ouro authoritative records are append-only: % on %', TG_OP, TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'ouro_domain_events', 'ouro_spec_revisions', 'ouro_command_receipts',
    'ouro_specs', 'ouro_principals', 'ouro_outbox'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = table_name || '_immutable_rows') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION ouro_reject_fact_mutation()', table_name || '_immutable_rows', table_name);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = table_name || '_immutable_truncate') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION ouro_reject_fact_mutation()', table_name || '_immutable_truncate', table_name);
    END IF;
  END LOOP;
END;
$$;

INSERT INTO ouro_schema_migrations (version) VALUES (1) ON CONFLICT DO NOTHING;
