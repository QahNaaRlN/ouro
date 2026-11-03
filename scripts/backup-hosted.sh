#!/bin/sh
set -eu
# Run from the reviewed Ouro deployment directory. Never use a Grace compose file.
env_file=${OURO_HOSTING_ENV_FILE:?set protected Ouro environment file}
backup_dir=${OURO_BACKUP_DIR:?set private Ouro backup directory}
umask 077
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="$backup_dir/ouro-$stamp-$$.dump"
partial="$backup.partial"
trap 'rm -f "$partial"' 0 1 2 3 15
docker compose --env-file "$env_file" exec -T db pg_dump -U ouro_admin -d ouro --format=custom --no-owner --no-privileges >"$partial"
docker compose --env-file "$env_file" exec -T db pg_restore --list <"$partial" >/dev/null
mv "$partial" "$backup"
trap - 0 1 2 3 15
sha256sum "$backup" >"$backup.sha256"
printf 'Ouro backup and checksum created: %s\n' "$backup"
