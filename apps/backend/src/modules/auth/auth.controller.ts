import { cookie } from "@elysiajs/cookie";
import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { getJwtSecret } from "../../config";
import { Logger } from "../../utils/logger";
import { authService } from "./auth.service";

const logger = new Logger("AuthController");

export const authController = new Elysia({ prefix: "/auth" })
	.use(
		jwt({
			name: "jwt",
			secret: getJwtSecret(),
		}),
	)
	.use(cookie())
	.get("/me", async ({ jwt, cookie: { auth }, headers, set }) => {
		let token: string | undefined = auth?.value as string | undefined; // Safe access

		// Try getting token from Authorization Header (Bearer)
		if (!token && headers.authorization) {
			const authHeader = headers.authorization;
			if (authHeader.startsWith("Bearer ")) {
				token = authHeader.substring(7);
			}
		}

		if (!token) {
			logger.debug("/me - No token received");
			set.status = 401;
			return { success: false, error: "No token provided" };
		}

		const profile = await jwt.verify(token);
		if (!profile) {
			logger.warn("/me - Invalid token received");
			set.status = 401;
			return { success: false, error: "Invalid token" };
		}

		const user = await authService.getUserById(profile.id as number);
		if (!user) {
			logger.warn(`/me - User ID ${profile.id} not found locally`);
			set.status = 401;
			return { success: false, error: "User not found" };
		}

		return {
			success: true,
			user: {
				id: user.id,
				name: user.name,
				email: user.email,
			},
		};
	})
	.post("/logout", ({ cookie: { auth }, set }) => {
		logger.info("Logout request");
		auth?.remove();
		set.status = 200;
		return { success: true, message: "Logged out successfully" };
	})
	.post(
		"/google",
		async ({ body, jwt, set, cookie: { auth } }) => {
			try {
				const user = await authService.loginWithGoogle(body.token);

				const token = await jwt.sign({
					id: user.id,
					email: user.email,
				});

				auth.set({
					value: token,
					httpOnly: true,
					maxAge: 7 * 86400,
					path: "/",
					sameSite: process.env.NODE_ENV === "production" ? "lax" : "none",
					secure: process.env.NODE_ENV === "production",
				});

				logger.info(`Google Login Success: ${user.email}`);

				set.status = 200;
				return {
					success: true,
					user: {
						id: user.id,
						name: user.name,
						email: user.email,
					},
					token, // Return token for non-browser clients (Mobile)
				};
			} catch (error) {
				logger.error("Google Login Failed", error);
				set.status = 400;
				return {
					success: false,
					error: error instanceof Error ? error.message : "Login failed",
				};
			}
		},
		{
			body: t.Object({
				token: t.String({ minLength: 1 }), // Validasi tidak kosong
			}),
		},
	);
