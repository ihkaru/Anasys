#!/bin/bash

# Directory containing raw data
RAW_DIR="apps/backend/data/raw"
OUTPUT_FILE="asset_classification.csv"

# Header
echo "Ticker,Type,File" > "$OUTPUT_FILE"

# Iterate through CSV files
for file in "$RAW_DIR"/*.csv; do
  [ -e "$file" ] || continue
  
  filename=$(basename "$file")
  
  # Extract Ticker from filename (e.g., BTC-USD_1h.csv -> BTC-USD)
  # Pattern: Take everything before the last underscore
  ticker=$(echo "$filename" | sed -r 's/_[^_]+\.csv$//')
  
  # Determine Type based on filename patterns
  # If filename matches *-USD_*, *-USDT_*, or known crypto patterns
  if [[ "$ticker" == *"-"* ]] || [[ "$filename" == *"-USD"* ]]; then
      type="CRYPTO"
  else
      type="STOCK"
  fi
  
  echo "$ticker,$type,$filename" >> "$OUTPUT_FILE"
done

echo "✅ Classification complete. Output saved to $OUTPUT_FILE"
echo "Summary:"
echo "Total Files: $(wc -l < "$OUTPUT_FILE")"
grep -c "STOCK" "$OUTPUT_FILE" | xargs echo "Stocks:" 
grep -c "CRYPTO" "$OUTPUT_FILE" | xargs echo "Cryptos:" 
