#!/bin/bash

# Configuration
DB_HOST="localhost"
DB_PORT="5432"
DB_USER="postgres"
DB_NAME="finance_db"

# Check for .env file to override defaults
if [ -f ../.env ]; then
    export $(grep -v '^#' ../.env | xargs)
    # Extract values if they exist in connection string or variables
    # For simplicity, we assume standard env vars or these defaults for this script
fi

# SQL Query
QUERY="
WITH audit AS (
    SELECT 
        s.id,
        s.ticker,
        s.type,
        md.interval,
        MAX(md.timestamp) as last_ts,
        NOW() - MAX(md.timestamp) as age
    FROM symbols s
    LEFT JOIN market_data md ON s.id = md.symbol_id
    WHERE s.is_active = true
    GROUP BY s.id, s.ticker, s.type, md.interval
)
SELECT 
    ticker,
    interval,
    COALESCE(to_char(last_ts, 'YYYY-MM-DD HH24:MI:SS'), 'NULL') as last_data,
    COALESCE(date_trunc('minute', age)::text, 'N/A') as age_since_update,
    CASE 
        WHEN last_ts IS NULL THEN 'MISSING'
        WHEN interval = '1d' AND age > INTERVAL '3 days' THEN 'STALE (Daily)' -- Give grace period for weekend
        WHEN interval = '1h' AND age > INTERVAL '4 hours' THEN 'STALE (Hourly)' -- Give grace period
        ELSE 'FRESH' 
    END as status
FROM audit
ORDER BY 
    CASE WHEN last_ts IS NULL THEN 1 ELSE 2 END, -- Missing first
    last_ts ASC; -- Oldest first
"

echo "Checking Market Data Freshness..."
echo "---------------------------------"

# Run Query using psql
# Assumes PGPASSWORD is set or .pgpass exists, or trusted auth
# We use docker exec if strictly needed, but let's try psql command first
if command -v psql &> /dev/null; then
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "$QUERY"
else
    # Fallback to docker if psql is not installed but docker is
    echo "psql not found, trying docker..."
    CONTAINER_NAME=$(docker ps --format "{{.Names}}" | grep postgres | head -n 1)
    if [ -n "$CONTAINER_NAME" ]; then
        docker exec -i $CONTAINER_NAME psql -U $DB_USER -d $DB_NAME -c "$QUERY"
    else
        echo "Error: psql client not found and no postgres container running."
        exit 1
    fi
fi
