-- Operational exact-request receipts for a bounded external test process.
-- Business outcomes remain immutable domain events/runs; this table only tracks recovery.
CREATE TABLE IF NOT EXISTS ouro_verification_runner_requests (
 project_id text NOT NULL REFERENCES ouro_projects(id),
 actor_id text NOT NULL REFERENCES ouro_principals(id),
 request_id text NOT NULL,
 payload_hash text NOT NULL,
 request jsonb NOT NULL,
 status text NOT NULL CHECK(status IN ('pending','completed','failed')),
 response jsonb,
 failure jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 PRIMARY KEY(project_id,actor_id,request_id)
);
INSERT INTO ouro_schema_migrations(version) VALUES(11) ON CONFLICT DO NOTHING;
