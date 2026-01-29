import { Elysia } from "elysia";
import { Logger } from "../utils/logger";

const logger = new Logger("Security");

// Security headers middleware
export const securityHeaders = new Elysia({ name: "securityHeaders" })
    .onAfterHandle(({ set }) => {
        // Prevent clickjacking
        set.headers["X-Frame-Options"] = "DENY";
        
        // XSS Protection
        set.headers["X-Content-Type-Options"] = "nosniff";
        set.headers["X-XSS-Protection"] = "1; mode=block";
        
        // Referrer Policy
        set.headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
        
        // Content Security Policy (basic)
        set.headers["Content-Security-Policy"] = "default-src 'self'";
        
        // HSTS (only in production)
        if (process.env.NODE_ENV === 'production') {
            set.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
        }
    });

// Input sanitization helper
export const sanitizeInput = (input: string): string => {
    return input
        .replace(/[<>]/g, '') // Remove potential HTML tags
        .trim();
};

// Helper to safely extract and mask sensitive headers
const getSafeHeaders = (headers: Headers) => {
    const safeHeaders: Record<string, string> = {};
    
    // Authorization - show presence only
    const auth = headers.get('authorization');
    if (auth) {
        safeHeaders['authorization'] = auth.startsWith('Bearer ') 
            ? `Bearer ${auth.substring(7, 20)}...` 
            : '[PRESENT]';
    }
    
    // Cookie - show presence only
    const cookie = headers.get('cookie');
    if (cookie) {
        safeHeaders['cookie'] = cookie.includes('auth=') ? '[auth=PRESENT]' : '[OTHER]';
    }
    
    // Content-Type
    const contentType = headers.get('content-type');
    if (contentType) safeHeaders['content-type'] = contentType;
    
    // Origin / Referer
    const origin = headers.get('origin');
    if (origin) safeHeaders['origin'] = origin;
    
    return safeHeaders;
};

// Request logging middleware
export const requestLogger = new Elysia({ name: "requestLogger" })
    .derive(async ({ request }) => {
        // Generate or reuse Request ID
        const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
        
        // Clone body for logging (only in dev, and only for mutation methods)
        const isDev = process.env.NODE_ENV !== 'production';
        let bodySnapshot: any = undefined;
        
        if (isDev && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
            try {
                const cloned = request.clone();
                const text = await cloned.text();
                if (text) {
                    bodySnapshot = text.length > 500 ? text.substring(0, 500) + '...[truncated]' : text;
                }
            } catch {
                bodySnapshot = '[UNREADABLE]';
            }
        }
        
        return { requestId, _bodySnapshot: bodySnapshot };
    })
    .onBeforeHandle(({ request, requestId }) => {
        const url = new URL(request.url);
        const isDev = process.env.NODE_ENV !== 'production';
        
        const meta: Record<string, any> = { requestId };
        if (url.search) meta.query = url.search;
        
        if (isDev) {
            meta.headers = getSafeHeaders(request.headers);
        }
        
        logger.info(`→ ${request.method} ${url.pathname}`, meta);
    })
    .onAfterHandle(({ request, requestId, _bodySnapshot }) => {
        const isDev = process.env.NODE_ENV !== 'production';
        if (isDev && _bodySnapshot) {
            const url = new URL(request.url);
            logger.debug(`📦 ${request.method} ${url.pathname} BODY:`, { requestId, body: _bodySnapshot });
        }
    })
    .onAfterHandle(({ request, set, requestId }) => {
        const url = new URL(request.url);
        // Add Request-ID to response headers
        set.headers['X-Request-ID'] = requestId;
        
        logger.info(`← ${request.method} ${url.pathname}`, {
            requestId,
            status: set.status || 200
        });
    })
    .onError(({ request, error, set, requestId }) => {
        const url = new URL(request.url);
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`✗ ${request.method} ${url.pathname}`, {
            requestId,
            status: set.status || 500,
            error: errorMessage
        });
    });

// Error handler middleware
export const errorHandler = new Elysia({ name: "errorHandler" })
    .onError(({ code, error, set }) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Unhandled error: ${code}`, { message: errorMessage });
        
        switch (code) {
            case 'VALIDATION':
                set.status = 400;
                return { 
                    success: false, 
                    error: "Invalid request data",
                    details: errorMessage
                };
            case 'NOT_FOUND':
                set.status = 404;
                return { success: false, error: "Resource not found" };
            case 'PARSE':
                set.status = 400;
                return { success: false, error: "Invalid JSON" };
            default:
                // Don't leak internal errors in production
                const isProd = process.env.NODE_ENV === 'production';
                set.status = 500;
                return { 
                    success: false, 
                    error: isProd ? "Internal server error" : errorMessage
                };
        }
    });
