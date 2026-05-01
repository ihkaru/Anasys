import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { Logger } from "./logger";

const logger = new Logger("PlaywrightManager");

export class PlaywrightManager {
	private static instance: PlaywrightManager;
	private browser: Browser | null = null;
	private context: BrowserContext | null = null;
	private page: Page | null = null;
	private isInitializing = false;

	private constructor() {}

	public static getInstance(): PlaywrightManager {
		if (!PlaywrightManager.instance) {
			PlaywrightManager.instance = new PlaywrightManager();
		}
		return PlaywrightManager.instance;
	}

	public async getPage(): Promise<Page> {
		if (this.page && !this.page.isClosed()) {
			return this.page;
		}

		if (this.isInitializing) {
			// Wait for initialization to complete
			while (this.isInitializing) {
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
			if (this.page) return this.page;
		}

		this.isInitializing = true;
		try {
			logger.info("Initializing Playwright Browser...");
			this.browser = await chromium.launch({
				headless: true,
				args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
			});
			this.context = await this.browser.newContext({
				userAgent:
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			});
			this.page = await this.context.newPage();

			// Navigate to a blank page on TradingView to establish domain and potential cookies
			await this.page.goto("https://www.tradingview.com/chart/", { waitUntil: "networkidle", timeout: 60000 });
			logger.info("Playwright Browser ready.");

			return this.page;
		} catch (err) {
			logger.error("Failed to initialize Playwright Browser", err);
			this.isInitializing = false;
			throw err;
		} finally {
			this.isInitializing = false;
		}
	}

	public async cleanup() {
		if (this.browser) {
			logger.info("Cleaning up Playwright Browser...");
			await this.browser.close();
			this.browser = null;
			this.context = null;
			this.page = null;
		}
	}
}

export const playwrightManager = PlaywrightManager.getInstance();
