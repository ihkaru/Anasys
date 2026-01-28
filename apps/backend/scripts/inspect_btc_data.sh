#!/bin/bash

# Configuration
DB_USER="postgres"
DB_NAME="finance_db"
TICKER="BTC-USD"
START_DATE="2025-11-01"
END_DATE="2025-12-01"

QUERY="
SELECT 
    to_char(md.timestamp, 'YYYY-MM-DD') as date,
    md.open,
    md.high,
    md.low,
    md.close,
    md.volume,
    md.interval
FROM market_data md
JOIN symbols s ON md.symbol_id = s.id
WHERE s.ticker = '$TICKER' 
  AND md.interval = '1d'
  AND md.timestamp >= '$START_DATE' 
  AND md.timestamp < '$END_DATE'
ORDER BY md.timestamp ASC;
"

echo "Inspecting $TICKER data from $START_DATE to $END_DATE..."
echo "--------------------------------------------------------"

# Exec
CONTAINER_NAME=$(docker ps --format "{{.Names}}" | grep postgres | head -n 1)
if [ -n "$CONTAINER_NAME" ]; then
    docker exec -i $CONTAINER_NAME psql -U $DB_USER -d $DB_NAME -c "$QUERY"
else
    echo "Error: Postgres container not found."
fi
