export const CRYPTO_BASES = [
	"BTC",
	"ETH",
	"XRP",
	"SOL",
	"ADA",
	"DOGE",
	"DOT",
	"MATIC",
	"AVAX",
	"LINK",
	"UNI",
	"ATOM",
	"LTC",
	"BCH",
	"XLM",
	"ALGO",
	"VET",
	"FIL",
	"TRX",
	"ETC",
	"AAVE",
	"XMR",
	"EOS",
	"XTZ",
	"NEO",
	"MKR",
	"COMP",
	"SNX",
	"YFI",
	"SUSHI",
	"CRV",
	"1INCH",
	"BAT",
	"ENJ",
	"MANA",
	"SAND",
	"AXS",
	"GALA",
	"APE",
	"SHIB",
	"PEPE",
	"BONK",
	"WIF",
	"FLOKI",
	"ARB",
	"OP",
	"IMX",
	"SUI",
	"SEI",
	"TIA",
	"INJ",
	"RUNE",
	"NEAR",
	"FTM",
	"HBAR",
	"EGLD",
	"FLOW",
	"CFX",
	"ICP",
	"APT",
	"USDT",
	"USDC",
	"BUSD",
	"DAI",
	"TUSD",
	"USDP",
	"FDUSD",
];

export function isCryptoSymbol(symbol: string): boolean {
	const cleaned = symbol.split(":").pop() || symbol;
	const base = cleaned
		.replace(/-USD$/, "")
		.replace(/USDT$/, "")
		.replace(/-PERP$/, "")
		.split("/")[0];

	return CRYPTO_BASES.includes(base.toUpperCase()) || symbol.includes("/USDT") || symbol.toLowerCase().endsWith("usdt");
}

export function toBinanceSymbol(symbol: string): string {
	// BTC-USD -> BTCUSDT
	return symbol.replace("-USD", "USDT").replace("-", "");
}

export function fromBinanceSymbol(binanceSymbol: string): string {
	// BTCUSDT -> BTC-USD
	if (binanceSymbol.endsWith("USDT")) {
		return binanceSymbol.replace("USDT", "-USD");
	}
	return binanceSymbol;
}

export function toBinanceInterval(interval: string): string {
	const map: Record<string, string> = {
		"1m": "1m",
		"5m": "5m",
		"15m": "15m",
		"30m": "30m",
		"1h": "1h",
		"4h": "4h",
		"1d": "1d",
		"1w": "1w",
	};
	return map[interval] || "1m";
}

export function fromBinanceInterval(binanceInterval: string): string {
	return binanceInterval;
}
