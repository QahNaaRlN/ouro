-- Transport receipts are immutable. Mutable jobs are technical leases/checkpoints,
-- not authoritative facts about execution. Bindings and Actions remain domain events.
CREATE TABLE IF NOT EXISTS ouro_github_deliveries (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES ouro_projects(id),
  delivery_id text NOT NULL,
  payload_digest text NOT NULL CHECK (length(payload_digest)=64),
  payload jsonb NOT NULL,
  binding_ids jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id,delivery_id)
);
CREATE TABLE IF NOT EXISTS ouro_github_jobs (
  delivery_id text PRIMARY KEY REFERENCES ouro_github_deliveries(id),
  status text NOT NULL CHECK(status IN ('pending','processing','retryable','processed','needs_review')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  reason text,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token text,
  lease_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ouro_github_commit_receipts (
  project_id text NOT NULL REFERENCES ouro_projects(id),
  binding_id text NOT NULL,
  repository_id bigint NOT NULL,
  full_sha text NOT NULL CHECK(length(full_sha)=40),
  payload_hash text NOT NULL,
  event_id text NOT NULL REFERENCES ouro_domain_events(id),
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id,binding_id,repository_id,full_sha)
);
CREATE INDEX IF NOT EXISTS ouro_github_jobs_pending_idx ON ouro_github_jobs(status,next_attempt_at);
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['ouro_github_deliveries','ouro_github_commit_receipts'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname=table_name||'_immutable_rows') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION ouro_reject_fact_mutation()',table_name||'_immutable_rows',table_name);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname=table_name||'_immutable_truncate') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION ouro_reject_fact_mutation()',table_name||'_immutable_truncate',table_name);
    END IF;
  END LOOP;
END;
$$;
INSERT INTO ouro_schema_migrations(version) VALUES(3) ON CONFLICT DO NOTHING;
