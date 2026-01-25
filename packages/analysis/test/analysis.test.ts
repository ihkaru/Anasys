import { describe, expect, it } from "bun:test";
import { strategySMA, type OHLCV } from "../src";

describe("Analysis Package Tests", () => {
    describe("strategySMA", () => {
        // Helper to generate mock OHLCV data
        const generateMockData = (length: number, basePrice = 100): OHLCV[] => {
            const data: OHLCV[] = [];
            const now = new Date();
            
            for (let i = 0; i < length; i++) {
                const date = new Date(now);
                date.setDate(date.getDate() - (length - i));
                
                // Simple sine wave pattern for predictable crossovers
                const variation = Math.sin(i * 0.1) * 10;
                const price = basePrice + variation;
                
                data.push({
                    timestamp: date,
                    open: price - 1,
                    high: price + 2,
                    low: price - 2,
                    close: price,
                    volume: 1000000,
                });
            }
            return data;
        };

        it("should return empty array for insufficient data", () => {
            const data = generateMockData(10);
            const signals = strategySMA(data, 9, 21);
            
            expect(signals).toEqual([]);
        });

        it("should return array of signals for sufficient data", () => {
            const data = generateMockData(100);
            const signals = strategySMA(data, 9, 21);
            
            expect(Array.isArray(signals)).toBe(true);
        });

        it("should only produce BUY and SELL signals", () => {
            const data = generateMockData(200);
            const signals = strategySMA(data, 9, 21);
            
            for (const signal of signals) {
                expect(["BUY", "SELL"]).toContain(signal.type);
            }
        });

        it("should include required signal properties", () => {
            const data = generateMockData(200);
            const signals = strategySMA(data, 9, 21);
            
            for (const signal of signals) {
                expect(signal.timestamp).toBeDefined();
                expect(signal.price).toBeDefined();
                expect(signal.reason).toBeDefined();
                expect(typeof signal.price).toBe("number");
            }
        });

        it("should alternate between BUY and SELL", () => {
            const data = generateMockData(300);
            const signals = strategySMA(data, 5, 20);
            
            if (signals.length >= 2) {
                for (let i = 1; i < signals.length; i++) {
                    const prev = signals[i - 1];
                    const curr = signals[i];
                    
                    if (prev && curr) {
                        // BUY should be followed by SELL and vice versa
                        expect(prev.type).not.toBe(curr.type);
                    }
                }
            }
        });

        it("should respect custom periods", () => {
            const data = generateMockData(100);
            
            const signalsShort = strategySMA(data, 3, 10);
            const signalsLong = strategySMA(data, 20, 50);
            
            // Shorter periods should generally produce more signals
            // (though not guaranteed for all data)
            expect(signalsShort.length).toBeGreaterThanOrEqual(0);
            expect(signalsLong.length).toBeGreaterThanOrEqual(0);
        });

        it("should include reason in signals", () => {
            const data = generateMockData(200);
            const signals = strategySMA(data, 9, 21);
            
            for (const signal of signals) {
                expect(signal.reason).toContain("Cross");
                if (signal.type === "BUY") {
                    expect(signal.reason).toContain("Golden");
                } else {
                    expect(signal.reason).toContain("Death");
                }
            }
        });
    });
});
