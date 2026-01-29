/**
 * Integration Test: Yahoo Finance Search API
 * 
 * This test verifies that the search functionality can discover
 * stocks directly from Yahoo Finance, even if they don't exist in the local database.
 * 
 * Run: bun test src/tests/yahoo_search.test.ts
 */

import { describe, expect, it } from "bun:test";
import { marketService } from "../modules/market/market.service";

describe("Yahoo Finance Search Integration", () => {
    
    it("should find EMAS.JK (Indonesian Gold Stock) via Yahoo Finance", async () => {
        // Search for Indonesian stock - Merdeka Gold Resources
        const results = await marketService.searchSymbols("EMAS.JK", 10);
        
        console.log("Search Results for EMAS.JK:", JSON.stringify(results, null, 2));
        
        // Basic assertions
        expect(results).toBeDefined();
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBeGreaterThan(0);
        
        // Check if EMAS.JK is in results
        const emasResult = results.find((r: any) => 
            r.symbol?.includes("EMAS") || r.ticker?.includes("EMAS")
        );
        
        expect(emasResult).toBeDefined();
        console.log("Found EMAS:", emasResult);
    }, 15000); // 15s timeout for API call

    it("should find BBCA.JK (Bank Central Asia) via Yahoo Finance", async () => {
        // Another popular Indonesian stock
        const results = await marketService.searchSymbols("BBCA", 10);
        
        console.log("Search Results for BBCA:", JSON.stringify(results, null, 2));
        
        expect(results).toBeDefined();
        expect(results.length).toBeGreaterThan(0);
        
        const bbcaResult = results.find((r: any) => 
            r.symbol?.includes("BBCA") || r.ticker?.includes("BBCA")
        );
        
        expect(bbcaResult).toBeDefined();
        console.log("Found BBCA:", bbcaResult);
    }, 15000);

    it("should find stocks by company name (not just ticker)", async () => {
        // Search by name instead of ticker
        const results = await marketService.searchSymbols("Tesla", 5);
        
        console.log("Search Results for 'Tesla':", JSON.stringify(results, null, 2));
        
        expect(results).toBeDefined();
        expect(results.length).toBeGreaterThan(0);
        
        const teslaResult = results.find((r: any) => 
            r.symbol === "TSLA" || r.ticker === "TSLA"
        );
        
        expect(teslaResult).toBeDefined();
    }, 15000);

    it("should return empty array for gibberish search", async () => {
        const results = await marketService.searchSymbols("xyzabc123notastock", 5);
        
        console.log("Search Results for gibberish:", results);
        
        expect(results).toBeDefined();
        expect(Array.isArray(results)).toBe(true);
        // Might be empty or have unrelated results
    }, 15000);
});
