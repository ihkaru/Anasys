/**
 * Global Rate Limiter for External API Calls
 * Prevents rate limiting by enforcing minimum delays between requests
 * Implements exponential backoff on failures
 */

import { Logger } from './logger';

interface RateLimiterConfig {
    minDelayMs: number;           // Minimum delay between requests
    maxRetries: number;           // Max retry attempts on failure
    backoffMultiplier: number;    // Multiplier for exponential backoff
    maxBackoffMs: number;         // Maximum backoff delay
}

interface RequestStats {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    rateLimitHits: number;
    lastRequestTime: number;
    avgResponseTime: number;
}

export class RateLimiter {
    private lastCallTime: number = 0;
    private consecutiveFailures: number = 0;
    private currentBackoff: number = 0;
    private stats: RequestStats = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        rateLimitHits: 0,
        lastRequestTime: 0,
        avgResponseTime: 0
    };
    private responseTimes: number[] = [];

    private readonly config: RateLimiterConfig;
    private readonly logger: Logger;

    constructor(
        config: Partial<RateLimiterConfig> = {},
        logger?: Logger
    ) {
        this.config = {
            minDelayMs: config.minDelayMs ?? 1000,           // 1 second default
            maxRetries: config.maxRetries ?? 3,
            backoffMultiplier: config.backoffMultiplier ?? 2,
            maxBackoffMs: config.maxBackoffMs ?? 60000       // 1 minute max
        };
        this.logger = logger ?? new Logger('RateLimiter');
    }

    /**
     * Wait for the appropriate amount of time before making next request
     */
    async throttle(): Promise<void> {
        const now = Date.now();
        const elapsed = now - this.lastCallTime;
        const requiredDelay = this.config.minDelayMs + this.currentBackoff;

        if (elapsed < requiredDelay) {
            const waitTime = requiredDelay - elapsed;
            this.logger.debug(`Throttling: waiting ${waitTime}ms before next request`);
            await this.sleep(waitTime);
        }

        this.lastCallTime = Date.now();
    }

    /**
     * Execute a function with rate limiting and retry logic
     */
    async execute<T>(
        fn: () => Promise<T>,
        context: string = 'API call'
    ): Promise<T> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            await this.throttle();

            const startTime = Date.now();
            this.stats.totalRequests++;

            try {
                const result = await fn();
                
                // Success - reset backoff
                this.consecutiveFailures = 0;
                this.currentBackoff = 0;
                this.stats.successfulRequests++;
                
                // Track response time
                const responseTime = Date.now() - startTime;
                this.trackResponseTime(responseTime);
                this.stats.lastRequestTime = Date.now();

                return result;

            } catch (error: any) {
                lastError = error;
                this.stats.failedRequests++;

                // Check if it's a rate limit error
                if (this.isRateLimitError(error)) {
                    this.stats.rateLimitHits++;
                    this.consecutiveFailures++;
                    
                    // Calculate exponential backoff
                    this.currentBackoff = Math.min(
                        this.config.minDelayMs * Math.pow(this.config.backoffMultiplier, this.consecutiveFailures),
                        this.config.maxBackoffMs
                    );

                    this.logger.warn(
                        `Rate limit hit for ${context}. ` +
                        `Error: ${error.message}. ` +
                        `Attempt ${attempt}/${this.config.maxRetries}. ` +
                        `Backing off for ${this.currentBackoff}ms`
                    );

                    if (attempt < this.config.maxRetries) {
                        await this.sleep(this.currentBackoff);
                        continue;
                    }
                }

                // For non-rate-limit errors, don't retry
                if (!this.isRateLimitError(error)) {
                    throw error;
                }
            }
        }

        // All retries exhausted
        this.logger.error(`All ${this.config.maxRetries} retries exhausted for ${context}`);
        throw lastError ?? new Error(`Failed after ${this.config.maxRetries} attempts`);
    }

    /**
     * Check if error is a rate limit (429) error
     */
    private isRateLimitError(error: any): boolean {
        return (
            error?.code === 429 ||
            error?.status === 429 ||
            error?.response?.status === 429 ||
            error?.response?.statusCode === 429 ||
            error?.message?.includes('429') ||
            error?.message?.toLowerCase().includes('rate limit') ||
            error?.message?.toLowerCase().includes('too many requests')
        );
    }

    /**
     * Track response time for averaging
     */
    private trackResponseTime(ms: number): void {
        this.responseTimes.push(ms);
        // Keep only last 100 response times
        if (this.responseTimes.length > 100) {
            this.responseTimes.shift();
        }
        this.stats.avgResponseTime = 
            this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
    }

    /**
     * Get current statistics
     */
    getStats(): RequestStats {
        return { ...this.stats };
    }

    /**
     * Reset statistics
     */
    resetStats(): void {
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            rateLimitHits: 0,
            lastRequestTime: 0,
            avgResponseTime: 0
        };
        this.responseTimes = [];
    }

    /**
     * Print statistics summary
     */
    printStats(): void {
        const successRate = this.stats.totalRequests > 0 
            ? ((this.stats.successfulRequests / this.stats.totalRequests) * 100).toFixed(1)
            : '0';
        
        console.log('\n📊 Rate Limiter Statistics:');
        console.log(`   Total Requests:     ${this.stats.totalRequests}`);
        console.log(`   Successful:         ${this.stats.successfulRequests}`);
        console.log(`   Failed:             ${this.stats.failedRequests}`);
        console.log(`   Rate Limit Hits:    ${this.stats.rateLimitHits}`);
        console.log(`   Success Rate:       ${successRate}%`);
        console.log(`   Avg Response Time:  ${this.stats.avgResponseTime.toFixed(0)}ms`);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Singleton instance for Yahoo Finance API
let yahooRateLimiter: RateLimiter | null = null;

export function getYahooRateLimiter(): RateLimiter {
    if (!yahooRateLimiter) {
        yahooRateLimiter = new RateLimiter({
            minDelayMs: 1500,        // 1.5 seconds between requests
            maxRetries: 3,
            backoffMultiplier: 2,
            maxBackoffMs: 120000     // 2 minutes max backoff
        });
    }
    return yahooRateLimiter;
}
