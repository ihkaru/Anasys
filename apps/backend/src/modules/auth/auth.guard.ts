import { cookie } from "@elysiajs/cookie";
import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import { getJwtSecret } from "../../config";
import { Logger } from "../../utils/logger";

const logger = new Logger('AuthGuard');

export const authGuard = new Elysia({ name: 'authGuard' })
    .use(jwt({ 
        name: "jwt", 
        secret: getJwtSecret()
    }))
    .use(cookie())
    .derive(async ({ jwt, cookie: { auth }, headers, request }) => {
        const isDev = process.env.NODE_ENV !== 'production';
        const secret = headers['x-dev-secret'] ?? headers['X-Dev-Secret'];

        // Dev backdoor for testing
        if (isDev && secret === 'dev_secret_123') {
            logger.info("🔓 Dev Backdoor Access GRANTED");
            return { 
                user: { id: 9999, name: 'Dev Superuser', email: 'dev@analisis.local' },
                isDevAdmin: true 
            };
        }

        let token: string | undefined = auth?.value as string | undefined;
        const authHeader = headers['authorization'];
        
        logger.debug(`Auth check: Cookie=${token ? 'YES' : 'NO'}, Header=${authHeader ? 'YES' : 'NO'}`);

        if (!token && authHeader?.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        }

        if (!token || typeof token !== "string") {
            return { user: null, isDevAdmin: false };
        }

        try {
            const profile = await jwt.verify(token);
            if (!profile) {
                logger.debug(`Token verification failed (invalid/expired)`);
                return { user: null, isDevAdmin: false };
            }
            logger.debug(`Authenticated: ${profile.email}`);
            return { 
                user: profile,
                isDevAdmin: false
            };
        } catch (error) {
            logger.warn(`Token verification error`, error);
            return { user: null, isDevAdmin: false };
        }

    })
    .macro({
        isAuthenticated(enabled: boolean) {
            if (!enabled) return;
            
            return {
                beforeHandle({ user, set }: any) {
                    if (!user) {
                        set.status = 401;
                        return { success: false, error: "Unauthorized" };
                    }
                }
            };
        }
    });