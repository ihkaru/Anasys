
/**
 * Generate a synthetic sparkline based on trend direction
 */
export function generateSparkline(isPositive: boolean): number[] {
    const points = 12;
    const data: number[] = [];
    let value = 100;
    const trend = isPositive ? 0.3 : -0.3; // Slight bias based on direction
    
    for (let i = 0; i < points; i++) {
        value += (Math.random() - 0.5 + trend) * 5;
        data.push(Math.max(0, value)); // Ensure no negative values
    }
    return data;
}

/**
 * Extract close prices from candle data for sparkline
 */
export function candlesToSparkline(candles: any[]): number[] {
    return candles.map(c => Number(c.close || c.price || 0));
}

export function sortCandlesByTime(candles: any[], asc = true): any[] {
    return candles.sort((a, b) => {
        const timeA = new Date(a.time || a.timestamp).getTime();
        const timeB = new Date(b.time || b.timestamp).getTime();
        return asc ? timeA - timeB : timeB - timeA;
    });
}
