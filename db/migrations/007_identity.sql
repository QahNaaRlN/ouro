CREATE TABLE IF NOT EXISTS ouro_user_accounts (
  id text PRIMARY KEY REFERENCES ouro_principals(id),
  email text NOT NULL UNIQUE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL REFERENCES ouro_principals(id)
);

CREATE TABLE IF NOT EXISTS ouro_user_password_credentials (
  user_id text PRIMARY KEY REFERENCES ouro_user_accounts(id),
  password_hash text NOT NULL CHECK (password_hash LIKE '$argon2id$%'),
  algorithm_version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ouro_user_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES ouro_user_accounts(id),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revocation_reason text
);
CREATE INDEX IF NOT EXISTS ouro_user_sessions_user_idx ON ouro_user_sessions(user_id,expires_at);

CREATE TABLE IF NOT EXISTS ouro_user_account_revocations (
  user_id text PRIMARY KEY REFERENCES ouro_user_accounts(id),
  revoked_at timestamptz NOT NULL DEFAULT now(),
  revoked_by text NOT NULL REFERENCES ouro_principals(id)
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['ouro_user_accounts','ouro_user_account_revocations'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname=table_name||'_immutable_rows') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION ouro_reject_fact_mutation()',table_name||'_immutable_rows',table_name);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname=table_name||'_immutable_truncate') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION ouro_reject_fact_mutation()',table_name||'_immutable_truncate',table_name);
    END IF;
  END LOOP;
END;
$$;

INSERT INTO ouro_schema_migrations(version) VALUES(7) ON CONFLICT DO NOTHING;
