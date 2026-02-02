import { ColorType, TickMarkType } from "lightweight-charts";

export interface ChartTheme {
	background: string;
	textColor: string;
	gridColor: string;
	borderColor: string;
	upColor: string;
	downColor: string;
}

export const DARK_THEME: ChartTheme = {
	background: "#0f0f23",
	textColor: "#d1d4dc",
	gridColor: "#2B2B43",
	borderColor: "#2B2B43",
	upColor: "#10b981",
	downColor: "#ef4444",
};

export const LIGHT_THEME: ChartTheme = {
	background: "#ffffff",
	textColor: "#333333",
	gridColor: "#e0e0e0",
	borderColor: "#e0e0e0",
	upColor: "#10b981",
	downColor: "#ef4444",
};

/**
 * Get the appropriate chart theme based on system preference
 */
export function getSystemChartTheme(): ChartTheme {
	if (typeof window !== "undefined") {
		const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
		return prefersDark ? DARK_THEME : LIGHT_THEME;
	}
	return DARK_THEME; // Default fallback
}

export function getChartOptions(
	theme: ChartTheme,
	width: number,
	height: number,
	isFullscreen: boolean,
	timezone: string = "local",
) {
	const timeOption = timezone === "local" ? undefined : timezone;

	// Create tailored formatters for different needs
	// 1. Full Date+Time for Crosshair
	const fullFormatter = new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "numeric",
		hour12: false,
		timeZone: timeOption,
	});

	// 2. Time Only for Intraday Ticks
	const timeFormatter = new Intl.DateTimeFormat("en-US", {
		hour: "numeric",
		minute: "numeric",
		hour12: false,
		timeZone: timeOption,
	});

	// 3. Date Only for Daily Ticks
	const dateFormatter = new Intl.DateTimeFormat("en-US", {
		day: "numeric",
		month: "short",
		timeZone: timeOption,
	});

	return {
		layout: {
			background: { type: ColorType.Solid, color: theme.background },
			textColor: theme.textColor,
			fontFamily:
				'-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
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
			tickMarkFormatter: (time: number, tickMarkType: number, _locale: string) => {
				const date = new Date(time * 1000);
				switch (tickMarkType) {
					case TickMarkType.Year:
						return date.getFullYear().toString();
					case TickMarkType.Month:
						return date.toLocaleDateString("en-US", { month: "short", timeZone: timeOption });
					case TickMarkType.DayOfMonth:
						return dateFormatter.format(date);
					case TickMarkType.Time:
					case TickMarkType.TimeWithSeconds:
						return timeFormatter.format(date);
					default:
						return "";
				}
			},
		},
		localization: {
			// Crosshair always shows full context
			timeFormatter: (timestamp: number) => {
				return fullFormatter.format(new Date(timestamp * 1000));
			},
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
