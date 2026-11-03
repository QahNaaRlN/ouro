-- Membership grants and revocations remain append-only facts. This mutable
-- projection makes their currently active grant unique without forbidding rejoin.
CREATE TABLE IF NOT EXISTS ouro_active_project_memberships (
  project_id text NOT NULL REFERENCES ouro_projects(id),
  user_id text NOT NULL REFERENCES ouro_user_accounts(id),
  membership_id text NOT NULL UNIQUE REFERENCES ouro_project_memberships(id),
  PRIMARY KEY(project_id,user_id)
);

INSERT INTO ouro_active_project_memberships(project_id,user_id,membership_id)
SELECT m.project_id,m.user_id,m.id
FROM ouro_project_memberships m
LEFT JOIN ouro_project_membership_revocations r ON r.membership_id=m.id
WHERE r.membership_id IS NULL
ON CONFLICT(project_id,user_id) DO NOTHING;

-- On the first upgrade only, invalidate unused invitations predating an old
-- membership revocation. New revocations below invalidate them causally.
INSERT INTO ouro_project_invitation_revocations(invitation_id,revoked_by)
SELECT DISTINCT ON (i.id) i.id,r.revoked_by
FROM ouro_project_invitations i
JOIN ouro_user_accounts a ON a.email=i.email
JOIN ouro_project_memberships m ON m.user_id=a.id AND m.project_id=i.project_id
JOIN ouro_project_membership_revocations r ON r.membership_id=m.id
LEFT JOIN ouro_project_invitation_acceptances accepted ON accepted.invitation_id=i.id
LEFT JOIN ouro_project_invitation_revocations revoked ON revoked.invitation_id=i.id
WHERE accepted.invitation_id IS NULL AND revoked.invitation_id IS NULL
  AND i.created_at<=r.revoked_at
  AND NOT EXISTS (SELECT 1 FROM ouro_schema_migrations WHERE version=9)
ORDER BY i.id,r.revoked_at DESC,m.id;

CREATE OR REPLACE FUNCTION ouro_project_membership_active_grant() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE scope_project_id text;
BEGIN
  IF TG_TABLE_NAME = 'ouro_project_memberships' THEN
    PERFORM id FROM ouro_projects WHERE id=NEW.project_id FOR UPDATE;
    INSERT INTO ouro_active_project_memberships(project_id,user_id,membership_id)
    VALUES(NEW.project_id,NEW.user_id,NEW.id);
  ELSE
    SELECT project_id INTO scope_project_id
    FROM ouro_project_memberships WHERE id=NEW.membership_id;
    PERFORM id FROM ouro_projects WHERE id=scope_project_id FOR UPDATE;
    DELETE FROM ouro_active_project_memberships WHERE membership_id=NEW.membership_id;
    INSERT INTO ouro_project_invitation_revocations(invitation_id,revoked_by)
    SELECT i.id,NEW.revoked_by
    FROM ouro_project_invitations i
    JOIN ouro_user_accounts a ON a.email=i.email
    JOIN ouro_project_memberships m ON m.user_id=a.id AND m.project_id=i.project_id
    LEFT JOIN ouro_project_invitation_acceptances accepted ON accepted.invitation_id=i.id
    WHERE m.id=NEW.membership_id AND accepted.invitation_id IS NULL
    ON CONFLICT(invitation_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='ouro_project_memberships_active_grant') THEN
    CREATE TRIGGER ouro_project_memberships_active_grant
    AFTER INSERT ON ouro_project_memberships FOR EACH ROW
    EXECUTE FUNCTION ouro_project_membership_active_grant();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='ouro_project_membership_revocations_active_grant') THEN
    CREATE TRIGGER ouro_project_membership_revocations_active_grant
    AFTER INSERT ON ouro_project_membership_revocations FOR EACH ROW
    EXECUTE FUNCTION ouro_project_membership_active_grant();
  END IF;
END;
$$;

ALTER TABLE ouro_project_memberships
  DROP CONSTRAINT IF EXISTS ouro_project_memberships_project_id_user_id_key;

INSERT INTO ouro_schema_migrations(version) VALUES(9) ON CONFLICT DO NOTHING;
