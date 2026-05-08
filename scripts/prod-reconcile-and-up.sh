#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env.prod}"
DC=(docker compose --env-file "$ENV_FILE" -f docker-compose.yml -f docker-compose.prod.yml)

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: env file not found: $ENV_FILE" >&2
  exit 1
fi

if [[ ! -f docker-compose.yml || ! -f docker-compose.prod.yml ]]; then
  echo "ERROR: run this script from the repository root." >&2
  exit 1
fi

echo "==> Starting postgres and redis"
"${DC[@]}" up -d postgres redis

echo "==> Waiting for postgres to become ready"
for i in $(seq 1 60); do
  if "${DC[@]}" exec -T postgres pg_isready -q 2>/dev/null; then
    echo "  postgres is ready"
    break
  fi
  if [[ "$i" == "60" ]]; then
    echo "ERROR: postgres did not become ready in time" >&2
    "${DC[@]}" logs --tail=80 postgres >&2 || true
    exit 1
  fi
  sleep 2
done

echo "==> Syncing Postgres role password from $ENV_FILE"
bash scripts/sync-postgres-role-password.sh "$ENV_FILE"

echo "==> Verifying application DATABASE_URL credentials"
bash scripts/check-prod-db-auth.sh "$ENV_FILE"

echo "==> Resolving postgres container IP for migration runner"
PG_CONTAINER_ID="$("${DC[@]}" ps -q postgres)"
if [[ -z "$PG_CONTAINER_ID" ]]; then
  echo "ERROR: postgres container id not found" >&2
  exit 1
fi
PG_IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$PG_CONTAINER_ID")"
if [[ -z "$PG_IP" ]]; then
  echo "ERROR: postgres container IP not found" >&2
  exit 1
fi

echo "==> Running Prisma migrations with verified credentials"
"${DC[@]}" run --rm -T \
  -e HOME=/tmp \
  -e XDG_CONFIG_HOME=/tmp/.config \
  -e DB_HOST_IP="$PG_IP" \
  api sh -lc '
    export DATABASE_URL=$(node -e "const u=new URL(process.env.DATABASE_URL);u.hostname=process.env.DB_HOST_IP;process.stdout.write(u.toString())")
    exec corepack pnpm --filter @quizmind/database db:migrate:deploy
  '

echo "==> Starting api, worker, and web"
"${DC[@]}" up -d api worker web

echo "==> Container status"
"${DC[@]}" ps

echo "==> Waiting for api health"
for i in $(seq 1 60); do
  status="$(docker inspect --format='{{.State.Health.Status}}' quizmind-api 2>/dev/null || echo missing)"
  if [[ "$status" == "healthy" ]]; then
    echo "  api is healthy"
    break
  fi
  if [[ "$i" == "60" ]]; then
    echo "ERROR: api did not become healthy, status=$status" >&2
    "${DC[@]}" logs --tail=80 api >&2 || true
    exit 1
  fi
  sleep 3
done

echo "==> Waiting for web health"
for i in $(seq 1 60); do
  status="$(docker inspect --format='{{.State.Health.Status}}' quizmind-web 2>/dev/null || echo missing)"
  if [[ "$status" == "healthy" ]]; then
    echo "  web is healthy"
    break
  fi
  if [[ "$i" == "60" ]]; then
    echo "ERROR: web did not become healthy, status=$status" >&2
    "${DC[@]}" logs --tail=80 web >&2 || true
    exit 1
  fi
  sleep 3
done

echo "==> Production stack reconciled and running"
