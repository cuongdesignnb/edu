#!/bin/sh
set -eu
# Chỉ chạy tự động khi volume PostgreSQL còn trống. Không xoay password trên volume đang dùng.
export EDU_MIGRATOR_PASSWORD="$(cat /run/secrets/db_migrator_password)"
export EDU_APP_PASSWORD="$(cat /run/secrets/db_app_password)"
export EDU_PARENT_PASSWORD="$(cat /run/secrets/db_parent_password)"
export EDU_WORKER_PASSWORD="$(cat /run/secrets/db_worker_password)"
psql -X -q -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv db POSTGRES_DB
\getenv mig_pass EDU_MIGRATOR_PASSWORD
\getenv app_pass EDU_APP_PASSWORD
\getenv parent_pass EDU_PARENT_PASSWORD
\getenv worker_pass EDU_WORKER_PASSWORD
CREATE ROLE edu_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'mig_pass';
CREATE ROLE edu_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'app_pass';
CREATE ROLE edu_parent LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'parent_pass';
CREATE ROLE edu_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'worker_pass';
ALTER DATABASE :"db" OWNER TO edu_migrator;
CREATE EXTENSION IF NOT EXISTS btree_gist;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER ROLE edu_app SET statement_timeout='5s';
ALTER ROLE edu_app SET lock_timeout='2s';
ALTER ROLE edu_app SET idle_in_transaction_session_timeout='15s';
ALTER ROLE edu_parent SET statement_timeout='5s';
ALTER ROLE edu_parent SET idle_in_transaction_session_timeout='15s';
ALTER ROLE edu_worker SET statement_timeout='30s';
ALTER ROLE edu_worker SET idle_in_transaction_session_timeout='60s';
SQL
unset EDU_MIGRATOR_PASSWORD EDU_APP_PASSWORD EDU_PARENT_PASSWORD EDU_WORKER_PASSWORD
