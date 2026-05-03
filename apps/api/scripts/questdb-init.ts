/**
 * QuestDB Initialization Script (ADR-0013)
 *
 * Ensures the `candles` table exists with proper DEDUP configuration for idempotent writes.
 * Safe to run multiple times — CREATE TABLE IF NOT EXISTS is idempotent.
 *
 * Run: bun apps/api/scripts/questdb-init.ts
 */

const QUESTDB_URL = process.env.QUESTDB_URL || "http://localhost:19000";

async function execSQL(sql: string, label: string): Promise<void> {
	console.log(`[QuestDB Init] ▶ ${label}`);
	const url = `${QUESTDB_URL}/exec?query=${encodeURIComponent(sql)}`;
	const res = await fetch(url);
	const body = (await res.json()) as any;

	if (!res.ok || body.error) {
		throw new Error(`QuestDB error (${label}): ${body.error ?? res.statusText}`);
	}
	console.log(`[QuestDB Init] ✅ ${label}`);
}

async function main() {
	console.log(`[QuestDB Init] Connecting to ${QUESTDB_URL} ...`);

	// Create candles table with DEDUP for idempotent incremental writes (ADR-0013)
	// DEDUP UPSERT KEYS ensures duplicate candles are upserted rather than inserted twice.
	await execSQL(
		`CREATE TABLE IF NOT EXISTS candles (
      symbol       SYMBOL CAPACITY 2048 CACHE,
      interval     SYMBOL CAPACITY 32 CACHE,
      source       SYMBOL CAPACITY 8 CACHE,
      open         DOUBLE,
      high         DOUBLE,
      low          DOUBLE,
      close        DOUBLE,
      volume       DOUBLE,
      timestamp    TIMESTAMP
    ) TIMESTAMP(timestamp)
      PARTITION BY DAY
      DEDUP UPSERT KEYS(symbol, interval, source, timestamp)`,
		"Create candles table with DEDUP",
	);

	// Verify table exists
	await execSQL(`SELECT count() FROM candles`, "Verify candles table");

	console.log("[QuestDB Init] 🎉 Initialization complete.");
}

main().catch((e) => {
	console.error("[QuestDB Init] ❌ Fatal:", e);
	process.exit(1);
});
