#!/bin/sh
set -eu
if [ "$#" -ne 1 ] || [ ! -f "$1" ]; then printf 'Usage: %s /private/ouro.dump\n' "$0" >&2; exit 2; fi
env_file=${OURO_HOSTING_ENV_FILE:?set protected Ouro environment file}
backup=$1
restore_db="ouro_restore_$(date -u +%Y%m%dT%H%M%S)_$$"
umask 077
if [ -f "$backup.sha256" ]; then sha256sum --check "$backup.sha256"; fi
docker compose --env-file "$env_file" exec -T db createdb -U ouro_admin --owner=ouro "$restore_db"
if ! docker compose --env-file "$env_file" exec -T db pg_restore -U ouro_admin --role=ouro -d "$restore_db" --no-owner --no-privileges --exit-on-error <"$backup"; then
 printf 'Restore failed; isolated database retained: %s\n' "$restore_db" >&2; exit 1
fi
# Reuse the app container's existing credential without printing it or changing its process.
# Explicit restore name is validated below; production database is never the target.
if ! docker compose --env-file "$env_file" exec -T -e OURO_RESTORE_DATABASE="$restore_db" app node --input-type=module -e '
import {spawnSync} from "node:child_process";
if(!/^ouro_restore_[0-9]{8}T[0-9]{6}_[0-9]+$/.test(process.env.OURO_RESTORE_DATABASE))process.exit(2);
const u=new URL(process.env.DATABASE_URL);u.pathname="/"+process.env.OURO_RESTORE_DATABASE;
const r=spawnSync(process.execPath,[".operations/verify-postgres.mjs"],{stdio:"inherit",env:{...process.env,OURO_VERIFY_DATABASE_URL:u.href}});process.exit(r.status??1);'; then
 printf 'Replay failed; isolated database retained: %s\n' "$restore_db" >&2; exit 1
fi
docker compose --env-file "$env_file" exec -T db dropdb -U ouro_admin "$restore_db"
printf 'Ouro isolated restore/replay passed; test database removed.\n'
