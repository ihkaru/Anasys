#!/bin/bash

# Configuration
ADR_DIR="./docs/adr"
OUTPUT_FILE="CONSOLIDATED_ADR.md"

# Clear output file
echo "# Consolidated Architecture Decision Records" > "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "*Generated on: $(date)*" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "---" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Loop through markdown files sorted by name
# Excluding README.md and the output file itself if it's in the same dir
for file in $(ls "$ADR_DIR"/*.md | grep -v "README.md" | sort); do
    filename=$(basename "$file")
    echo "Processing $filename..."
    
    echo "## File: $filename" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    cat "$file" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    echo "---" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
done

echo "✅ Success! All ADRs merged into $OUTPUT_FILE"
