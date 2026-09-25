#!/usr/bin/env bash
set -Eeuo pipefail

/pb/pocketbase serve \
  --http=0.0.0.0:8090 \
  --dir=/pb/pb_data \
  --hooksDir=/pb/pb_hooks \
  --migrationsDir=/pb/pb_migrations &
pocketbase_pid=$!

nginx -g 'daemon off;' &
nginx_pid=$!

stop_services() {
  trap - TERM INT
  kill -TERM "$nginx_pid" "$pocketbase_pid" 2>/dev/null || true
  wait "$nginx_pid" "$pocketbase_pid" 2>/dev/null || true
}

trap 'stop_services; exit 143' TERM
trap 'stop_services; exit 130' INT

set +e
wait -n "$pocketbase_pid" "$nginx_pid"
status=$?
set -e
stop_services

if ((status == 0)); then
  exit 1
fi
exit "$status"
