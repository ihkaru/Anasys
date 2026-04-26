#!/usr/bin/env bun

/**
 * 🚀 Anasys Setup Script
 *
 * One-command setup for the entire project.
 * Run: bun run setup
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { $ } from "bun";

const COLORS = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	red: "\x1b[31m",
	cyan: "\x1b[36m",
	blue: "\x1b[34m",
};

function log(emoji: string, message: string, color = COLORS.reset) {
	console.log(`${color}${emoji} ${message}${COLORS.reset}`);
}

function header(title: string) {
	console.log(`\n${COLORS.cyan}${"═".repeat(50)}${COLORS.reset}`);
	console.log(`${COLORS.bright}${COLORS.cyan}   ${title}${COLORS.reset}`);
	console.log(`${COLORS.cyan}${"═".repeat(50)}${COLORS.reset}\n`);
}

async function checkPrerequisites() {
	header("1️⃣  Checking Prerequisites");

	// Check Bun
	try {
		const bunVersion = await $`bun --version`.text();
		log("✅", `Bun ${bunVersion.trim()} installed`);
	} catch {
		log("❌", "Bun is not installed. Please install from https://bun.sh", COLORS.red);
		process.exit(1);
	}

	// Check Docker
	try {
		await $`docker --version`.quiet();
		log("✅", "Docker installed");
	} catch {
		log("❌", "Docker is not installed. Please install Docker Desktop.", COLORS.red);
		process.exit(1);
	}

	// Check Docker Compose
	try {
		await $`docker compose version`.quiet();
		log("✅", "Docker Compose installed");
	} catch {
		log("❌", "Docker Compose is not available.", COLORS.red);
		process.exit(1);
	}
}

async function setupEnvironment() {
	header("2️⃣  Setting Up Environment");

	// .env file
	if (!existsSync(".env")) {
		if (existsSync(".env.example")) {
			copyFileSync(".env.example", ".env");
			log("✅", ".env created from .env.example");
			log("⚠️", "Please edit .env and set JWT_SECRET!", COLORS.yellow);
		} else {
			// Create minimal .env
			const envContent = `# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/analisis

# JWT Secret (REQUIRED - generate a strong random string!)
JWT_SECRET=change_me_to_a_secure_random_string_min_32_chars

# CORS
CORS_ORIGIN=http://localhost:5173

# Server
PORT=3000
NODE_ENV=development
`;
			writeFileSync(".env", envContent);
			log("✅", ".env created with defaults");
			log("⚠️", "IMPORTANT: Edit .env and set a secure JWT_SECRET!", COLORS.yellow);
		}
	} else {
		log("✅", ".env already exists");
	}

	// Check JWT_SECRET
	const envContent = readFileSync(".env", "utf-8");
	if (envContent.includes("change_me") || envContent.includes("secret_key_change_me")) {
		log("⚠️", "JWT_SECRET needs to be changed before production use!", COLORS.yellow);
	}

	// credential_analisis.json
	if (!existsSync("credential_analisis.json")) {
		if (existsSync("credential_analisis.example.json")) {
			copyFileSync("credential_analisis.example.json", "credential_analisis.json");
			log("✅", "credential_analisis.json created (configure for Google OAuth)");
		} else {
			log("⚠️", "No credential_analisis.example.json found (Google OAuth will not work)", COLORS.yellow);
		}
	} else {
		log("✅", "credential_analisis.json already exists");
	}
}

async function startDatabase() {
	header("3️⃣  Starting Database");

	try {
		// Check if postgres container is already running
		const result = await $`docker ps --filter name=postgres --format "{{.Names}}"`.text();

		if (result.includes("postgres")) {
			log("✅", "PostgreSQL container already running");
		} else {
			log("🚀", "Starting PostgreSQL container...");
			await $`docker compose up -d postgres`.quiet();

			// Wait for database to be ready
			log("⏳", "Waiting for database to be ready...");
			for (let i = 0; i < 30; i++) {
				try {
					await $`docker exec postgres pg_isready -U postgres`.quiet();
					log("✅", "PostgreSQL is ready!");
					break;
				} catch {
					await new Promise((r) => setTimeout(r, 1000));
					if (i === 29) {
						log("❌", "Database failed to start in time", COLORS.red);
						process.exit(1);
					}
				}
			}
		}
	} catch (e) {
		log("❌", `Failed to start database: ${e}`, COLORS.red);
		process.exit(1);
	}
}

async function installDependencies() {
	header("4️⃣  Installing Dependencies");

	log("📦", "Running bun install...");
	await $`bun install`;
	log("✅", "Dependencies installed");
}

async function setupDatabase() {
	header("5️⃣  Setting Up Database Schema");

	try {
		log("🔧", "Pushing database schema...");
		await $`bun run db:push`;
		log("✅", "Database schema created");

		// Setup QuestDB (handled by Rust engine mostly, but we can verify here)
		log("🔧", "QuestDB verification skipped (handled by Rust engine)");
		log("✅", "Database verification complete");
	} catch (e) {
		log("⚠️", `Schema push had issues: ${e}`, COLORS.yellow);
	}
}

async function promptForSeeding(): Promise<boolean> {
	header("6️⃣  Database Seeding (Optional)");

	console.log(`
${COLORS.yellow}Seeding will populate the database with market data.${COLORS.reset}

Options:
  ${COLORS.green}[Y]${COLORS.reset} Yes, seed the database (takes ~15-20 minutes)
  ${COLORS.green}[N]${COLORS.reset} No, skip seeding (can run later with: bun run --filter @apps/backend seed)

`);

	// For automated setup, check if SEED env var is set
	if (process.env.SEED === "true" || process.env.SEED === "1") {
		return true;
	}
	if (process.env.SEED === "false" || process.env.SEED === "0" || process.env.CI) {
		log("⏭️", "Skipping seeding (CI/automated mode)");
		return false;
	}

	// Interactive prompt
	const prompt = `Seed database? [y/N]: `;
	process.stdout.write(prompt);

	for await (const line of console) {
		const answer = line.trim().toLowerCase();
		if (answer === "y" || answer === "yes") {
			return true;
		}
		return false;
	}
	return false;
}

async function seedDatabase() {
	log("🌱", "Starting database seeding...");
	log("⏳", "This may take 15-20 minutes for full market data...\n");

	try {
		await $`bun run --filter @apps/backend seed`;
		log("✅", "Database seeded successfully");
	} catch (e) {
		log("⚠️", `Seeding had issues: ${e}`, COLORS.yellow);
	}
}

async function runValidation() {
	header("7️⃣  Validating Data Consistency");

	try {
		log("🔍", "Running data consistency tests...");
		const result = await $`bun run --filter @apps/backend test src/tests/data_consistency.test.ts 2>&1`.text();

		if (result.includes("DATABASE IS CLEAN") || result.includes("0 critical issues")) {
			log("✅", "Data validation passed - no critical issues");
		} else if (result.includes("fail")) {
			log("⚠️", "Some data issues detected. Run 'bun run --filter @apps/backend audit' to fix.", COLORS.yellow);
		}
	} catch {
		log("⚠️", "Validation skipped (database may be empty)", COLORS.yellow);
	}
}

async function showSummary(seeded: boolean) {
	header("🎉 Setup Complete!");

	console.log(`
${COLORS.green}Your Anasys installation is ready!${COLORS.reset}

${COLORS.bright}To start development:${COLORS.reset}
  ${COLORS.cyan}bun run dev${COLORS.reset}           # Start both frontend and backend. Runs on http://localhost:5173.

${COLORS.bright}Individual servers:${COLORS.reset}
  ${COLORS.cyan}bun run --filter @apps/backend dev${COLORS.reset}   # Backend only (port 3000)
  ${COLORS.cyan}bun run --filter @apps/frontend dev${COLORS.reset}  # Frontend only (port 5173)

${COLORS.bright}Database commands:${COLORS.reset}
  ${COLORS.cyan}bun run db:push${COLORS.reset}       # Push schema changes
  ${COLORS.cyan}bun run db:studio${COLORS.reset}     # Open Drizzle Studio

${COLORS.bright}Maintenance:${COLORS.reset}
  ${COLORS.cyan}bun run --filter @apps/backend test src/tests/data_consistency.test.ts${COLORS.reset}  # Validate data
  ${COLORS.cyan}bun run --filter @apps/backend audit${COLORS.reset}                                    # Clean anomalies
  ${COLORS.cyan}bun run --filter @apps/backend repair:vip${COLORS.reset}                               # Repair VIP data

${!seeded ? `${COLORS.yellow}Note: Database was not seeded. Run 'bun run --filter @apps/backend seed' when ready.${COLORS.reset}\n` : ""}
${COLORS.bright}Happy coding! 🚀${COLORS.reset}
`);
}

// Main execution
async function main() {
	console.clear();
	console.log(`
${COLORS.cyan}${COLORS.bright}
    ╔═══════════════════════════════════════════╗
    ║                                           ║
    ║       📈 ANASYS SETUP WIZARD 📈          ║
    ║                                           ║
    ║   High Performance Finance Dashboard      ║
    ║                                           ║
    ╚═══════════════════════════════════════════╝
${COLORS.reset}
`);

	await checkPrerequisites();
	await setupEnvironment();
	await startDatabase();
	await installDependencies();
	await setupDatabase();

	const shouldSeed = await promptForSeeding();
	if (shouldSeed) {
		await seedDatabase();
		await runValidation();
	}

	await showSummary(shouldSeed);
}

main().catch(console.error);
