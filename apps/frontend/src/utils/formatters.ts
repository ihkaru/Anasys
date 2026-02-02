export function formatCurrency(
  value: number, 
  currency: string = 'USD',
  options?: Intl.NumberFormatOptions
): string {
  try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        ...options
      }).format(value);
  } catch (e) {
      // Fallback for invalid currency codes
      return (currency === 'USD' ? '$' : currency + ' ') + value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        ...options
      });
  }
}

export function formatPercent(
  value: number,
  decimals: number = 2,
  includeSign: boolean = true
): string {
  const sign = includeSign && value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatCompactNumber(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toFixed(2);
}

export function formatPrice(price: number, currency: string = 'USD'): string {
  // Smart formatting based on price magnitude
  if (price >= 1000) {
    return formatCurrency(price, currency, { maximumFractionDigits: 2 });
  }
  if (price >= 1) {
    return formatCurrency(price, currency, { maximumFractionDigits: 2 });
  }
  // For crypto < $1
  return formatCurrency(price, currency, { 
    minimumFractionDigits: 4, 
    maximumFractionDigits: 6 
  });
}

// Extended Hours Types
export type MarketState = 'PRE' | 'REGULAR' | 'POST' | 'POSTPOST' | 'CLOSED';

export interface ExtendedHoursInfo {
  label: string;
  price: number;
  change: number;
  changePercent: number;
}

/**
 * Get extended hours display info based on market state
 * Returns the appropriate extended hours data to show as secondary info
 */
export function getExtendedHoursInfo(quote: {
  marketState?: MarketState;
  preMarketPrice?: number;
  preMarketChange?: number;
  preMarketChangePercent?: number;
  postMarketPrice?: number;
  postMarketChange?: number;
  postMarketChangePercent?: number;
}): ExtendedHoursInfo | null {
  if (!quote.marketState) return null;

  // During pre-market, show pre-market data
  if (quote.marketState === 'PRE' && quote.preMarketPrice) {
    return {
      label: 'Pre',
      price: quote.preMarketPrice,
      change: quote.preMarketChange || 0,
      changePercent: quote.preMarketChangePercent || 0
    };
  }

  // After market close, show post-market data
  if ((quote.marketState === 'POST' || quote.marketState === 'POSTPOST' || quote.marketState === 'CLOSED') 
      && quote.postMarketPrice) {
    return {
      label: 'After',
      price: quote.postMarketPrice,
      change: quote.postMarketChange || 0,
      changePercent: quote.postMarketChangePercent || 0
    };
  }

  return null;
}

/**
 * Format market state for display
 */
export function formatMarketState(state?: MarketState): string {
  switch (state) {
    case 'PRE': return 'Pre-Market';
    case 'REGULAR': return 'Open';
    case 'POST': return 'After-Hours';
    case 'POSTPOST': return 'After-Hours';
    case 'CLOSED': return 'Closed';
    default: return '';
  }
}
