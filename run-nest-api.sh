#!/bin/sh
# Build and run Nest API container. Uses .env from this directory.

set -e

cd "$(dirname "$0")"

# Load .env (POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, JWT_SECRET, PORT, FRONTEND_ORIGIN, etc.)
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

IMAGE_NAME="nest-api"
CONTAINER_NAME="nest-api"
POSTGRES_CONTAINER="postgres"
NETWORK_NAME="nest-api-net"

DB_USER="${POSTGRES_USER:-user}"
DB_PASS="${POSTGRES_PASSWORD:-password}"
DB_NAME="${POSTGRES_DB:-db}"
JWT_SECRET="${JWT_SECRET:-change-me-in-production}"
API_PORT="${PORT:-4000}"
PG_PORT="${POSTGRES_PORT:-5433}"

# Create network if it doesn't exist (so both containers can talk by name)
docker network create "$NETWORK_NAME" 2>/dev/null || true

echo "Building image..."
docker build -t "$IMAGE_NAME" .

# Start Postgres if not running (on our network)
if ! docker ps --format '{{.Names}}' | grep -q "^${POSTGRES_CONTAINER}$"; then
  echo "Starting Postgres..."
  docker run -d --name "$POSTGRES_CONTAINER" \
    --network "$NETWORK_NAME" \
    -e POSTGRES_USER="$DB_USER" \
    -e POSTGRES_PASSWORD="$DB_PASS" \
    -e POSTGRES_DB="$DB_NAME" \
    -p "${PG_PORT}:5432" \
    postgres:16-alpine
  echo "Waiting for Postgres..."
  sleep 5
else
  # Postgres already running: connect it to our network so nest-api can reach it
  docker network connect "$NETWORK_NAME" "$POSTGRES_CONTAINER" 2>/dev/null || true
fi

# Remove old container if exists (so we can recreate)
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

echo "Starting Nest API (env from .env)..."
docker run -d --name "$CONTAINER_NAME" \
  --network "$NETWORK_NAME" \
  -p "${API_PORT}:4000" \
  --env-file .env \
  -e DATABASE_URL="postgres://${DB_USER}:${DB_PASS}@${POSTGRES_CONTAINER}:5432/${DB_NAME}" \
  -e PORT=4000 \
  "$IMAGE_NAME"

echo "Nest API container started. Logs: docker logs -f $CONTAINER_NAME"
echo "API: http://localhost:${API_PORT}"
