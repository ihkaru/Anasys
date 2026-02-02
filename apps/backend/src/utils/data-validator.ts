/**
 * Market Data Validator
 * Ensures data integrity before saving to database
 * Detects and rejects anomalous candles
 */

export interface CandleData {
    symbolId: number;
    timestamp: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    interval: string;
}

export interface ValidationResult {
    isValid: boolean;
    reason?: string;
    severity?: 'warning' | 'error';
}

export interface ValidationConfig {
    // Maximum allowed volatility (high-low range as % of open)
    maxVolatilityStock: number;      // Default: 25%
    maxVolatilityCrypto: number;     // Default: 60%
    
    // Maximum single-candle price change
    maxPriceChangeStock: number;     // Default: 20%
    maxPriceChangeCrypto: number;    // Default: 50%
    
    // Wick anomaly detection (wick as % of body)
    maxWickRatio: number;            // Default: 500% (5x body size)
    
    // Flash crash detection (low vs open)
    flashCrashThreshold: number;     // Default: 20% drop
    
    // Minimum price (to catch obviously wrong data)
    minPrice: number;                // Default: 0.0001
}

const DEFAULT_CONFIG: ValidationConfig = {
    maxVolatilityStock: 0.25,
    maxVolatilityCrypto: 0.60,
    maxPriceChangeStock: 0.20,
    maxPriceChangeCrypto: 0.50,
    maxWickRatio: 200.0, // Increased to 200.0 to handle extreme Dojis
    flashCrashThreshold: 0.20,
    minPrice: 0.0001
};

export class DataValidator {
    private config: ValidationConfig;

    constructor(config: Partial<ValidationConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Validate a single candle
     */
    validateCandle(candle: CandleData, isCrypto: boolean = false): ValidationResult {
        // 1. Basic null/undefined checks
        if (!candle || candle.open == null || candle.close == null || 
            candle.high == null || candle.low == null) {
            return { isValid: false, reason: 'Missing OHLC data', severity: 'error' };
        }

        // 2. Negative or zero price check
        if (candle.open <= 0 || candle.close <= 0 || candle.high <= 0 || candle.low <= 0) {
            return { isValid: false, reason: 'Non-positive price detected', severity: 'error' };
        }

        // 3. Minimum price threshold
        if (candle.close < this.config.minPrice) {
            return { isValid: false, reason: `Price below minimum (${this.config.minPrice})`, severity: 'error' };
        }

        // 4. OHLC logic check (high >= low, high >= open/close, low <= open/close)
        if (candle.high < candle.low) {
            return { isValid: false, reason: 'High < Low (impossible)', severity: 'error' };
        }
        if (candle.high < candle.open || candle.high < candle.close) {
            return { isValid: false, reason: 'High is not the highest', severity: 'error' };
        }
        if (candle.low > candle.open || candle.low > candle.close) {
            return { isValid: false, reason: 'Low is not the lowest', severity: 'error' };
        }

        // 5. Volatility check
        const range = candle.high - candle.low;
        const volatility = range / candle.open;
        const maxVolatility = isCrypto ? this.config.maxVolatilityCrypto : this.config.maxVolatilityStock;
        
        if (volatility > maxVolatility) {
            return { 
                isValid: false, 
                reason: `Excessive volatility: ${(volatility * 100).toFixed(1)}% (max: ${maxVolatility * 100}%)`,
                severity: 'error'
            };
        }

        // 6. Price change check (open vs close)
        const priceChange = Math.abs(candle.open - candle.close) / candle.open;
        const maxPriceChange = isCrypto ? this.config.maxPriceChangeCrypto : this.config.maxPriceChangeStock;
        
        if (priceChange > maxPriceChange) {
            return {
                isValid: false,
                reason: `Excessive price change: ${(priceChange * 100).toFixed(1)}%`,
                severity: 'error'
            };
        }

        // 7. Flash crash detection
        const lowDrop = (candle.open - candle.low) / candle.open;
        if (lowDrop > this.config.flashCrashThreshold) {
            // Check if it recovered (close is near open)
            const recovery = Math.abs(candle.open - candle.close) / candle.open;
            if (recovery < 0.05) { // Recovered to within 5%
                return {
                    isValid: false,
                    reason: `Flash crash detected: ${(lowDrop * 100).toFixed(1)}% drop with recovery`,
                    severity: 'error'
                };
            }
        }

        // 8. Extreme wick detection
        const body = Math.abs(candle.open - candle.close);
        const upperWick = candle.high - Math.max(candle.open, candle.close);
        const lowerWick = Math.min(candle.open, candle.close) - candle.low;
        const maxWick = Math.max(upperWick, lowerWick);
        
        if (body > 0) {
            const wickRatio = maxWick / body;
            
            // Only flag if ratio is huge AND the wick itself is significant (> 0.5% of price)
            const isSignificantWick = maxWick > (candle.open * 0.005);

            if (wickRatio > this.config.maxWickRatio && isSignificantWick) {
                return {
                    isValid: false,
                    reason: `Extreme wick ratio: ${wickRatio.toFixed(1)}x body`,
                    severity: 'warning'
                };
            }
        }

        // 9. Timestamp validation
        if (!candle.timestamp || isNaN(candle.timestamp.getTime())) {
            return { isValid: false, reason: 'Invalid timestamp', severity: 'error' };
        }

        // Future date check (with 1 hour tolerance for timezone issues)
        const oneHourFromNow = new Date(Date.now() + 3600000);
        if (candle.timestamp > oneHourFromNow) {
            return { isValid: false, reason: 'Timestamp in the future', severity: 'error' };
        }

        return { isValid: true };
    }

    /**
     * Validate and filter an array of candles
     * Returns only valid candles and logs rejected ones
     */
    validateCandles(
        candles: CandleData[], 
        isCrypto: boolean = false,
        onRejected?: (candle: CandleData, reason: string) => void
    ): CandleData[] {
        const validCandles: CandleData[] = [];
        let rejectedCount = 0;

        for (const candle of candles) {
            const result = this.validateCandle(candle, isCrypto);
            
            if (result.isValid) {
                validCandles.push(candle);
            } else {
                rejectedCount++;
                if (onRejected) {
                    onRejected(candle, result.reason || 'Unknown');
                }
            }
        }

        return validCandles;
    }

    /**
     * Check for gaps in time series data
     */
    detectGaps(candles: CandleData[], expectedIntervalMs: number): { start: Date; end: Date }[] {
        const gaps: { start: Date; end: Date }[] = [];
        
        if (candles.length < 2) return gaps;

        // Sort by timestamp ascending
        const sorted = [...candles].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        for (let i = 1; i < sorted.length; i++) {
            const prevTime = sorted[i - 1].timestamp.getTime();
            const currTime = sorted[i].timestamp.getTime();
            const diff = currTime - prevTime;

            // Allow 20% tolerance for interval
            if (diff > expectedIntervalMs * 1.2) {
                gaps.push({
                    start: sorted[i - 1].timestamp,
                    end: sorted[i].timestamp
                });
            }
        }

        return gaps;
    }

    /**
     * Get interval in milliseconds
     */
    static intervalToMs(interval: string): number {
        const map: Record<string, number> = {
            '1m': 60 * 1000,
            '5m': 5 * 60 * 1000,
            '15m': 15 * 60 * 1000,
            '30m': 30 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '4h': 4 * 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000,
            '1wk': 7 * 24 * 60 * 60 * 1000,
            '1mo': 30 * 24 * 60 * 60 * 1000
        };
        return map[interval] || 60 * 60 * 1000; // Default to 1h
    }
}

// Singleton instance
let validatorInstance: DataValidator | null = null;

export function getDataValidator(): DataValidator {
    if (!validatorInstance) {
        validatorInstance = new DataValidator();
    }
    return validatorInstance;
}
