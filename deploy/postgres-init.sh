#!/bin/sh
# The image may source a non-executable init script. Keep strict shell options
# and any future local variables inside a subshell, out of its entrypoint.
(
set -eu
# Runs only during initialization of a NEW dedicated PostgreSQL volume. The
# admin credential stays in the DB container; the application receives only ouro.
if [ "${POSTGRES_USER:-}" != ouro_admin ] || [ -z "${POSTGRES_DB:-}" ] || [ -z "${OURO_POSTGRES_APP_PASSWORD:-}" ]; then
 printf 'Dedicated Ouro admin, database and application credential are required.\n' >&2
 exit 2
fi
case "$POSTGRES_DB" in *[!a-zA-Z0-9_]*|'') printf 'Invalid dedicated Ouro database name.\n' >&2; exit 2;; esac

# getenv keeps the password out of argv. Quoted psql variables and server-side
# format handle literals/identifiers; no shell interpolation enters SQL.
psql --no-psqlrc --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<'SQL'
\set ECHO none
\getenv app_password OURO_POSTGRES_APP_PASSWORD
\getenv app_database POSTGRES_DB
SELECT format('CREATE ROLE ouro LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', :'app_password') \gexec
SELECT format('ALTER DATABASE %I OWNER TO ouro', :'app_database') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'app_database') \gexec
SELECT format('GRANT CONNECT, TEMPORARY ON DATABASE %I TO ouro', :'app_database') \gexec
SQL
psql --no-psqlrc --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
ALTER SCHEMA public OWNER TO ouro;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO ouro;
SQL
)
