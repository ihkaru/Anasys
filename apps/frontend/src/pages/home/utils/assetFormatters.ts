
export function formatPrice(price: number): string {
  if (price === undefined || price === null) return '$0.00';
  return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatChangePercent(change: number): string {
  if (change === undefined || change === null) return '0.00%';
  const prefix = change >= 0 ? '+' : '';
  return `${prefix}${change.toFixed(2)}%`;
}

export function generateSparkline(positive: boolean): number[] {
  const points = 12;
  const data: number[] = [];
  let value = 100;
  for (let i = 0; i < points; i++) {
    value += (Math.random() - 0.5) * 10;
    data.push(value);
  }
  if (positive && data[data.length - 1] < data[0]) {
    data.reverse();
  } else if (!positive && data[data.length - 1] > data[0]) {
    data.reverse();
  }
  return data;
}
