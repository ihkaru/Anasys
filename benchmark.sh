#!/bin/bash

echo "🚀 Triggering Anasys Institutional Benchmark..."
echo "=================================================="

FRESH_MODE=0
for arg in "$@"; do
    if [ "$arg" == "--fresh" ]; then
        FRESH_MODE=1
    fi
done

if [ $FRESH_MODE -eq 1 ]; then
    echo "⚠️  FRESH START MODE INITIATED ⚠️"
    echo "This will wipe all existing backfill progress and QuestDB candles."
    read -p "Are you sure you want to proceed? (y/N) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        bun run apps/api/src/scripts/reset_harvesting.ts
        
        echo "🌱 Running Task Seeder..."
        bun run apps/api/src/scripts/seed_missing_tasks.ts
    else
        echo "❌ Fresh start aborted. Exiting..."
        exit 1
    fi
    echo "=================================================="
fi

# Run the comprehensive stress & audit benchmark
bun run apps/api/scripts/stress_audit_benchmark.ts

echo ""
echo "📊 Quick Summary (First 15 lines):"
echo "--------------------------------------------------"
# Display the top part of the report (Throughput section)
head -n 14 docs/benchmarks/harvest_report.md

echo "--------------------------------------------------"
echo "📄 Full report available at: docs/benchmarks/harvest_report.md"
