CREATE TABLE IF NOT EXISTS ouro_collaborative_drafts (
  id text PRIMARY KEY,project_id text NOT NULL REFERENCES ouro_projects(id),
  spec_id text NOT NULL REFERENCES ouro_specs(id),base_revision_id text NOT NULL REFERENCES ouro_spec_revisions(id),
  created_by text NOT NULL REFERENCES ouro_principals(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ouro_draft_heads (
  draft_id text PRIMARY KEY REFERENCES ouro_collaborative_drafts(id),version bigint NOT NULL CHECK(version>=0),
  state_update_base64 text NOT NULL,state_hash text NOT NULL,content_hash text NOT NULL,
  published_revision_id text REFERENCES ouro_spec_revisions(id),published_at timestamptz
);
CREATE TABLE IF NOT EXISTS ouro_draft_updates (
  draft_id text NOT NULL REFERENCES ouro_collaborative_drafts(id),update_id text NOT NULL,
  actor_id text NOT NULL REFERENCES ouro_principals(id),client_id text NOT NULL,payload_hash text NOT NULL,
  update_base64 text NOT NULL,result_version bigint NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(draft_id,update_id)
);
CREATE TABLE IF NOT EXISTS ouro_draft_receipts (
  project_id text NOT NULL REFERENCES ouro_projects(id),actor_id text NOT NULL REFERENCES ouro_principals(id),
  request_id text NOT NULL,operation text NOT NULL CHECK(operation IN ('create','publish')),
  payload_hash text NOT NULL,response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id,actor_id,request_id)
);
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['ouro_collaborative_drafts','ouro_draft_updates','ouro_draft_receipts'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname=table_name||'_immutable_rows') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION ouro_reject_fact_mutation()',table_name||'_immutable_rows',table_name);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname=table_name||'_immutable_truncate') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION ouro_reject_fact_mutation()',table_name||'_immutable_truncate',table_name);
    END IF;
  END LOOP;
END; $$;
INSERT INTO ouro_schema_migrations(version) VALUES(5) ON CONFLICT DO NOTHING;
