import { db } from "./apps/backend/src/db";
import { users } from "@packages/db/src/schema";

// We need a way to mock the JWT to test the API via curl
async function generateTestJWT() {
	const user = await db.select().from(users).limit(1);
	console.log("Found user:", user[0].email);
	console.log("Please run this with Elysia's JWT secret to generate a token.");
}
generateTestJWT();
