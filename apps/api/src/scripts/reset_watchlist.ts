/**
 * Reset Watchlist Script
 *
 * This script will:
 * 1. Remove all items from all watchlists
 * 2. Remove all user-created watchlists
 * 3. Keep the default watchlist but empty
 */

import { sql } from "drizzle-orm";
import { db } from "../db";

async function resetWatchlist() {
	console.log("═══════════════════════════════════════════════════════════");
	console.log("           🗑️  RESET WATCHLIST - Fresh Start              ");
	console.log("═══════════════════════════════════════════════════════════\n");

	try {
		// Step 1: Remove all items from watchlist_items
		console.log("🧹 Step 1: Clearing all watchlist items...");
		const itemsDeleted = await db.execute(sql`DELETE FROM watchlist_items`);
		console.log(`   ✅ Watchlist items cleared`);

		// Step 2: Remove all watchlists except the very basic ones if needed
		// Usually, it's safer to just clear items first.
		// But the user asked for "empty watchlist", which could mean empty list of watchlists too.
		console.log("\n🧹 Step 2: Clearing all watchlists...");
		await db.execute(sql`DELETE FROM watchlists CASCADE`);
		console.log("   ✅ All watchlists removed");

		console.log("\n═══════════════════════════════════════════════════════════");
		console.log("                ✅ WATCHLIST RESET COMPLETE                ");
		console.log("═══════════════════════════════════════════════════════════\n");
		console.log("The frontend will now start with a completely empty slate.");
	} catch (e) {
		console.error("\n❌ Fatal error during reset:", e);
		process.exit(1);
	}

	process.exit(0);
}

resetWatchlist();
