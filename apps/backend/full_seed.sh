#!/bin/bash
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/finance_db

echo "🚀 Starting Full Seed Process..."

# Ensure we are in the right directory
cd "$(dirname "$0")"

# Exit on error
set -e

echo "🛑 Stopping containers and removing volumes (Fresh Start)..."
docker-compose down -v

echo "🚀 Starting TimescaleDB..."
docker-compose up -d postgres

echo "⏳ Waiting for Database to be ready..."
# Wait loop
until docker compose exec postgres pg_isready -U postgres; do
  echo "Sleeping 2s..."
  sleep 2
done
echo "✅ Database is ready!"

echo "🛠 Pushing Schema..."
# Push schema from packages/db
cd packages/db
bun run push
cd ../../apps/backend

echo "⚙️ Configuring TimescaleDB..."
bun run src/scripts/setup_timescale.ts

echo "🌱 Running Master Seeder..."
bun run src/scripts/seed.ts

echo "🎉 All Done!"
