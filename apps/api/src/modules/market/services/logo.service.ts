import { join } from "node:path";
import { symbols } from "@packages/db/src/schema";
import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { Logger } from "../../../utils/logger";

/**
 * Logo Service using Elbstream API
 *
 * Elbstream provides 400k+ logos for stocks, ETFs, crypto, and funds.
 * Free tier requires attribution link to elbstream.com
 *
 * API Format:
 * - Stocks/ETFs: https://api.elbstream.com/logos/symbol/{TICKER}
 * - Crypto: https://api.elbstream.com/logos/crypto/{SYMBOL}
 * - Flags: https://api.elbstream.com/logos/flag/{COUNTRY_CODE}
 */
export class LogoService {
	private logger = new Logger("LogoService");
	private readonly LOGO_DIR = join(process.cwd(), "public/logos");
	private readonly ELBSTREAM_BASE = "https://api.elbstream.com/logos";

	async ensureLogo(symbolId: number, ticker: string, type: "STOCK" | "CRYPTO"): Promise<string | null> {
		// Sanitize ticker for filename (replace special chars)
		const sanitizedTicker = ticker.replace(/[^a-zA-Z0-9]/g, "_");

		// 1. Check existing files (SVG priority, then PNG)
		const extensions = ["svg", "png"];

		for (const ext of extensions) {
			const fileName = `${sanitizedTicker}.${ext}`;
			const absPath = join(this.LOGO_DIR, fileName);
			const localPath = `/public/logos/${fileName}`;

			if (await Bun.file(absPath).exists()) {
				// Ensure DB matches reality
				await db.update(symbols).set({ iconUrl: localPath }).where(eq(symbols.id, symbolId));
				return localPath;
			}
		}

		// 2. Fetch from Elbstream
		this.logger.debug(`Fetching logo for ${ticker} (${type})...`);

		try {
			let externalUrl: string;

			if (type === "CRYPTO") {
				const coin = ticker.split("-")[0].toUpperCase();
				externalUrl = `${this.ELBSTREAM_BASE}/crypto/${coin}`;
			} else {
				externalUrl = `${this.ELBSTREAM_BASE}/symbol/${ticker}`;
			}

			// Check if logo exists with HEAD request first
			const headCheck = await fetch(externalUrl, { method: "HEAD" });
			if (!headCheck.ok) {
				this.logger.debug(`Logo not found on Elbstream for ${ticker}`);
				return null;
			}

			// Download the logo
			const response = await fetch(externalUrl);
			if (!response.ok) {
				throw new Error(`Failed to fetch image: ${response.statusText}`);
			}

			// Get content type to determine format
			const contentType = response.headers.get("content-type") || "";
			const extension = contentType.includes("svg") ? "svg" : "png";

			const fileName = `${sanitizedTicker}.${extension}`;
			const localPath = `/public/logos/${fileName}`;
			const absPath = join(this.LOGO_DIR, fileName);

			const blob = await response.blob();

			await Bun.write(absPath, blob);

			this.logger.info(`✅ Logo saved for ${ticker} (${contentType}) -> ${fileName}`);

			// Update DB with local path
			await db.update(symbols).set({ iconUrl: localPath }).where(eq(symbols.id, symbolId));

			return localPath;
		} catch (e) {
			this.logger.error(`Failed to process logo for ${ticker}`, e);
		}

		return null;
	}

	/**
	 * Get the external URL for a logo (for direct frontend use without caching)
	 * This can be used if you want to show logos directly from Elbstream CDN
	 */
	getExternalLogoUrl(ticker: string, type: "STOCK" | "CRYPTO"): string {
		if (type === "CRYPTO") {
			const coin = ticker.split("-")[0].toUpperCase();
			return `${this.ELBSTREAM_BASE}/crypto/${coin}`;
		}
		return `${this.ELBSTREAM_BASE}/symbol/${ticker}`;
	}
}

export const logoService = new LogoService();
