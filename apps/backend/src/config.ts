/**
 * Application Configuration
 * 
 * Centralized configuration with validation.
 * Throws errors for missing required environment variables.
 */

function getRequiredEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`❌ Missing required environment variable: ${name}`);
    }
    return value;
}

function getOptionalEnv(name: string, defaultValue: string): string {
    return process.env[name] || defaultValue;
}

// Validate JWT_SECRET at startup
let _jwtSecret: string | null = null;

export function getJwtSecret(): string {
    if (_jwtSecret === null) {
        _jwtSecret = getRequiredEnv('JWT_SECRET');
    }
    return _jwtSecret;
}

export const config = {
    // Server
    port: parseInt(getOptionalEnv('PORT', '3000')),
    nodeEnv: getOptionalEnv('NODE_ENV', 'development'),
    
    // CORS
    corsOrigin: getOptionalEnv('CORS_ORIGIN', 'http://localhost:5173'),
    
    // Database
    databaseUrl: getOptionalEnv('DATABASE_URL', ''),
    
    // Rate Limiting
    rateLimit: {
        windowMs: parseInt(getOptionalEnv('RATE_LIMIT_WINDOW_MS', '60000')), // 1 minute
        maxRequests: parseInt(getOptionalEnv('RATE_LIMIT_MAX', '100')),
    },
    
    // Market Data Defaults
    defaults: {
        overviewTickers: ['SPY', 'QQQ', 'BTC-USD'],
        period: '7d',
        searchLimit: 15,
        trendingRegion: 'US',
        trendingCount: 10,
        historyLimit: 100,
        historyInterval: '1d',
    }
};

// Export a function to validate all required config at startup
export function validateConfig(): void {
    console.log('🔧 Validating configuration...');
    
    try {
        getJwtSecret();
        console.log('   ✅ JWT_SECRET is set');
    } catch (e) {
        console.error('   ❌ JWT_SECRET is NOT set - this is required for production!');
        if (config.nodeEnv === 'production') {
            throw e;
        } else {
            console.warn('   ⚠️  Using fallback secret for development only');
            _jwtSecret = 'dev_secret_not_for_production';
        }
    }
    
    console.log(`   📍 Environment: ${config.nodeEnv}`);
    console.log(`   🌐 CORS Origin: ${config.corsOrigin}`);
    console.log('   ✅ Configuration validated');
}
