
import { ColorType } from 'lightweight-charts';

export interface ChartTheme {
  background: string;
  textColor: string;
  gridColor: string;
  borderColor: string;
  upColor: string;
  downColor: string;
}

export const DARK_THEME: ChartTheme = {
  background: '#1a1a2e',
  textColor: '#d1d4dc',
  gridColor: '#2B2B43',
  borderColor: '#2B2B43',
  upColor: '#10b981',
  downColor: '#ef4444',
};

export function getChartOptions(theme: ChartTheme, width: number, height: number, isFullscreen: boolean) {
  return {
    layout: {
      background: { type: ColorType.Solid, color: theme.background },
      textColor: theme.textColor,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
    },
    grid: {
      vertLines: { color: theme.gridColor },
      horzLines: { color: theme.gridColor },
    },
    width,
    height: isFullscreen ? height : Math.min(height, 400),
    crosshair: { mode: 1 },
    rightPriceScale: { borderColor: theme.borderColor },
    timeScale: {
      borderColor: theme.borderColor,
      timeVisible: true,
      secondsVisible: false,
    },
  };
}

export function getCandlestickSeriesOptions(theme: ChartTheme) {
  return {
    upColor: theme.upColor,
    downColor: theme.downColor,
    borderDownColor: theme.downColor,
    borderUpColor: theme.upColor,
    wickDownColor: theme.downColor,
    wickUpColor: theme.upColor,
  };
}
