#!/bin/sh
# 镜像 init-scripts 只建角色不设密码；这里统一改成 POSTGRES_PASSWORD，
# 供 authenticator (PostgREST) / supabase_auth_admin (GoTrue) / supabase_storage_admin (Storage) 使用。
# 必须以 zz- 开头，排在镜像自带 migrate.sh 之后执行。
set -eu

psql -v ON_ERROR_STOP=1 --no-password --no-psqlrc -U supabase_admin <<EOSQL
alter user authenticator with password '${POSTGRES_PASSWORD}';
alter user supabase_auth_admin with password '${POSTGRES_PASSWORD}';
alter user supabase_storage_admin with password '${POSTGRES_PASSWORD}';
EOSQL
