
import { type Signal } from '../../../stores/market';

export interface OHLCVData {
  timestamp: string | Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export function formatOHLCVForChart(data: OHLCVData[]): ChartCandle[] {
  // Deduplicate using Map
  const dataMap = new Map<number, ChartCandle>();
  
  data.forEach(d => {
    const time = new Date(d.timestamp).getTime() / 1000;
    dataMap.set(time, {
      time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    });
  });
  
  // Sort by time
  return Array.from(dataMap.values()).sort((a, b) => a.time - b.time);
}

export function formatSignalMarkers(signals: Signal[]) {
  return signals.map(signal => ({
    time: new Date(signal.timestamp).getTime() / 1000,
    position: signal.type === 'BUY' ? 'belowBar' as const : 'aboveBar' as const,
    color: signal.type === 'BUY' ? '#10b981' : '#ef4444',
    shape: signal.type === 'BUY' ? 'arrowUp' as const : 'arrowDown' as const,
    text: signal.type,
  }));
}
