-- New facts only. No backfill/defaults in immutable revision JSON or event streams.
CREATE TABLE IF NOT EXISTS ouro_verification_runs (
 id text PRIMARY KEY,
 project_id text NOT NULL REFERENCES ouro_projects(id),
 event_id text NOT NULL UNIQUE REFERENCES ouro_domain_events(id),
 verification_revision_id text NOT NULL REFERENCES ouro_spec_revisions(id),
 target_revision_id text NOT NULL REFERENCES ouro_spec_revisions(id),
 content jsonb NOT NULL,
 content_hash text NOT NULL,
 CHECK (content->>'id'=id),
 CHECK (content->>'projectId'=project_id)
);
CREATE INDEX IF NOT EXISTS ouro_verification_revision_idx ON ouro_verification_runs(project_id,verification_revision_id);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='ouro_verification_runs_immutable_rows') THEN
  CREATE TRIGGER ouro_verification_runs_immutable_rows BEFORE UPDATE OR DELETE ON ouro_verification_runs FOR EACH ROW EXECUTE FUNCTION ouro_reject_fact_mutation();
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='ouro_verification_runs_immutable_truncate') THEN
  CREATE TRIGGER ouro_verification_runs_immutable_truncate BEFORE TRUNCATE ON ouro_verification_runs FOR EACH STATEMENT EXECUTE FUNCTION ouro_reject_fact_mutation();
 END IF;
END $$;
INSERT INTO ouro_schema_migrations(version) VALUES(10) ON CONFLICT DO NOTHING;
