import fs from "node:fs";

const FILE_PATH = "apps/backend/data/polygon/ohlcv_data.csv.zip.b64";
const _OUTPUT_PREVIEW_LINES = 10;

async function inspect() {
	console.log(`Inspecting ${FILE_PATH}...`);

	if (!fs.existsSync(FILE_PATH)) {
		console.error("File not found");
		return;
	}

	// Pipeline: Read File -> Base64 Decode -> Unzip -> Print Lines
	const _readStream = fs.createReadStream(FILE_PATH, { highWaterMark: 64 * 1024 });

	// 1. Base64 Decode Transform
	// Simply reading as utf8 and creating a buffer from base64 string chunks is risky if chunks split base64 chars.
	// But standard base64 streams exist. Node's Buffer can help.
	// Actually, simpler: read the file as string, convert to buffer? No, 300MB is too big.
	// Let's assume it's valid b64. I'll use a simple approach:
	// Shell command `base64 -d` might be safer/faster if available.
	// But let's try node.

	// Easier approach: Use shell command to decode and unzip small part to stdout?
	// `base64 -d apps/backend/data/polygon/ohlcv_data.csv.zip.b64 | funzip | head -n 10`
	// If user has `base64` and `unzip`/`funzip` installed.
	// Let's try that first as its robust.
}

inspect();
