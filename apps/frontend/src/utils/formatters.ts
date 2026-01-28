
export function formatCurrency(
  value: number, 
  options?: Intl.NumberFormatOptions
): string {
  return '$' + value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options
  });
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

export function formatPrice(price: number): string {
  // Smart formatting based on price magnitude
  if (price >= 1000) {
    return formatCurrency(price, { maximumFractionDigits: 2 });
  }
  if (price >= 1) {
    return formatCurrency(price, { maximumFractionDigits: 2 });
  }
  // For crypto < $1
  return formatCurrency(price, { 
    minimumFractionDigits: 4, 
    maximumFractionDigits: 6 
  });
}
