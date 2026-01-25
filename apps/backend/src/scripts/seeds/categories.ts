
import { categories, symbolCategories, symbols } from "@packages/db/src/schema";
import { eq } from "drizzle-orm";
import { join } from "node:path";
import { db } from "../../db";

const CSV_FILE = join(import.meta.dir, "data/symbol_categories.csv");

export async function seed() {
    console.log(`📂 [Categories] Seeding from ${CSV_FILE}...`);
    try {
        const content = await Bun.file(CSV_FILE).text();
        const lines = content.trim().split('\n');
        // Ticker,Category
        // Skip header
        
        let count = 0;
        
        // Cache categories
        const catMap = new Map<string, number>();

        for (let i = 1; i < lines.length; i++) {
            const [ticker, catName] = lines[i].split(',');
            if (!ticker || !catName) continue;

            // 1. Ensure Category
            const slug = catName.toLowerCase().replace(/\s+/g, '-');
            let catId = catMap.get(slug);

            if (!catId) {
                const [inserted] = await db.insert(categories).values({
                    name: catName,
                    slug
                }).onConflictDoUpdate({
                    target: categories.slug,
                    set: { name: catName }
                }).returning();

                if (inserted) catId = inserted.id;
                else {
                    const [existing] = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
                    if (existing) catId = existing.id;
                }
                
                if (catId) catMap.set(slug, catId);
            }

            if (!catId) continue;

            // 2. Ensure Symbol (We assume symbols exist from other seeders, but if not we skip or create dummy?)
            // Ideally we only categorize existing symbols.
            // But we can lazy fetch.
            
            const [symbol] = await db.select().from(symbols).where(eq(symbols.ticker, ticker)).limit(1);
            if (!symbol) {
                // Should we create it?
                // Let's create it stubbed
                 const [newSym] = await db.insert(symbols).values({
                    ticker,
                    name: ticker,
                    type: catName === 'CRYPTO' ? 'CRYPTO' : 'STOCK',
                    isActive: true,
                    provider: 'seed_category'
                }).onConflictDoNothing().returning();
                
                if (!newSym) continue; // Already exists but select failed? Race condition?
                // Actually onConflictDoNothing returns empty array if conflict.
                // So if newSym is undefined, it exists.
                
                if (!newSym) {
                     // Fetch again?
                     continue; 
                }
                
                // If we created it, we have ID.
                // But wait, if it exists, conflict do nothing returns nothing.
                // So reliable way is:
            }
            
            // Reliable fetch
            const [sym] = await db.select().from(symbols).where(eq(symbols.ticker, ticker)).limit(1);
            if (!sym) continue;

            // 3. Link
            await db.insert(symbolCategories).values({
                symbolId: sym.id,
                categoryId: catId
            }).onConflictDoNothing().execute();

            count++;
            if (count % 1000 === 0) console.log(`Linked ${count} categories...`);
        }
        
        console.log(`✅ Linked ${count} symbol-categories`);

    } catch (e) {
        console.error("Error seeding categories:", e);
        // Don't throw, allow other seeders to proceed if this fails? 
        // Or throw.
        throw e;
    }
}
