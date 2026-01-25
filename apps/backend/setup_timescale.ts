import { db } from './src/db'; import { sql } from 'drizzle-orm';

async function setupTimescaleFeatures() {
  console.log('🚀 Maximizing TimescaleDB...');

  try {
    // 1. Pastikan ekstensi aktif
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;`);

    // 2. Enable Compression (jika sebelumnya gagal/belum)
    // Compress data older than 2 weeks to save space but keep recent data hot
    console.log('📦 Setting up Compression...');
    try {
        await db.execute(sql`ALTER TABLE market_data SET (timescaledb.compress, timescaledb.compress_segmentby = 'symbol_id');`);
        await db.execute(sql`SELECT add_compression_policy('market_data', INTERVAL '14 days');`);
    } catch(e) {
    }

    // 3. Create Continuous Aggregate for DAILY data
    // This effectively auto-calculates OHLCV for '1d' from any finer granularity data (if we had tick data)
    // But since our source IS often '1d' or '1h', this is valid for '1h' -> '1d' rollup.
    
    console.log('⚡ Setting up Continuous Aggregates (Daily Materialized View)...');
    
    // Drop logic to ensure clean state if re-running
    await db.execute(sql`DROP MATERIALIZED VIEW IF EXISTS market_data_daily CASCADE;`);
    
    // Create the View
    await db.execute(sql`
        CREATE MATERIALIZED VIEW market_data_daily
        WITH (timescaledb.continuous) AS
        SELECT
            symbol_id,
            time_bucket('1 day', timestamp) as bucket,
            first(open, timestamp) as open,
            max(high) as high,
            min(low) as low,
            last(close, timestamp) as close,
            sum(volume) as volume
        FROM market_data
        GROUP BY symbol_id, bucket;
    `);
    
    // Add Refresh Policy to keep it up to date automatically
    // Update the view every 1 hour, looking back 3 days for changes
    await db.execute(sql`
        SELECT add_continuous_aggregate_policy('market_data_daily',
            start_offset => INTERVAL '3 days',
            end_offset => INTERVAL '1 hour',
            schedule_interval => INTERVAL '1 hour');
    `);

    console.log('✅ TimescaleDB Maximized Successfully!');
    console.log('   - Compression Enabled (Segment by Symbol)');
    console.log('   - Continuous Aggregates (Daily View) Created');

  } catch (error) {
    console.error('❌ Error setup:', error);
  }
}

setupTimescaleFeatures().then(() => process.exit(0));
