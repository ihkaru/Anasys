import { users, watchlists } from "@packages/db/src/schema";
import { eq } from "drizzle-orm";
import { OAuth2Client } from "google-auth-library";
import { db } from "../../db";

import { Logger } from "../../utils/logger";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const logger = new Logger('AuthService');

export class AuthService {
	async verifyGoogleToken(token: string) {
        logger.debug("Verifying Google Token...");
		try {
			// Try as ID Token first
			const ticket = await client.verifyIdToken({
				idToken: token,
				audience: process.env.GOOGLE_CLIENT_ID,
			});
			const payload = ticket.getPayload();
            logger.debug("ID Token verified");
			return payload;
		} catch (error) {
            logger.debug("ID Token failed, trying Access Token endpoint...");
			// Fallback: Try as Access Token (UserInfo API)
			try {
				const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
					headers: { Authorization: `Bearer ${token}` }
				});
				if (!response.ok) throw new Error("UserInfo failed");
				const data = await response.json();
                logger.debug("Access Token verified via UserInfo");
				// Normalize payload to match ID Token structure
				return {
					...data,
					sub: data.sub, // google id
					email: data.email,
					name: data.name
				}; // returns similar payload structure
			} catch (e) {
                logger.error("Token verification failed completely");
				throw new Error("Invalid Google Token");
			}
		}
	}

	async loginWithGoogle(idToken: string) {
        logger.info("Login attempt with Google");
		const payload = await this.verifyGoogleToken(idToken);
		if (!payload || !payload.email) throw new Error("No email in token");

		// Check if user exists
		const [existingUser] = await db
			.select()
			.from(users)
			.where(eq(users.email, payload.email))
			.limit(1);

		if (existingUser) {
            logger.info(`User login: ${existingUser.email}`);
			return existingUser;
		}

		// Create new user
		const [newUser] = await db
			.insert(users)
			.values({
				email: payload.email,
				name: payload.name || "Unknown",
				googleId: payload.sub,
			})
			.returning();

        logger.info(`New user created: ${newUser.email}`);
        
        // Create Default Watchlist
        await db.insert(watchlists).values({
            userId: newUser.id,
            name: 'Watchlist',
            isDefault: true
        });

		return newUser;
	}

    async getUserById(id: number) {
        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, id))
            .limit(1);
        return user;
    }
}

export const authService = new AuthService();
