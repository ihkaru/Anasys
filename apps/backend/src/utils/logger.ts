type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LEVELS: Record<LogLevel, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

// Check if stdout is a real terminal (not piped to file)
const isTTY = process.stdout.isTTY ?? false;

export class Logger {
    private module: string;
    private minLevel: number;
    private enabled: boolean = true;
    private isProd: boolean;

    constructor(moduleName: string) {
        this.module = moduleName;
        this.isProd = process.env.NODE_ENV === 'production';
        
        // 1. Check Global Level
        const envLevel = (process.env.LOG_LEVEL || 'INFO').toUpperCase() as LogLevel;
        this.minLevel = LEVELS[envLevel] ?? 1;

        // 2. Check Module Toggle (Allowlist)
        const allowList = process.env.LOG_MODULES;
        if (allowList && allowList !== '*') {
            const modules = allowList.split(',').map(m => m.trim().toLowerCase());
            if (!modules.includes(moduleName.toLowerCase())) {
                this.enabled = false;
            }
        }
        
        // 3. Debug Logger Config (Only if DEBUG_LOGGER=true)
        if (process.env.DEBUG_LOGGER === 'true' && this.enabled) {
            this.loggerDebug(moduleName, envLevel);
        }
    }

    private loggerDebug(moduleName: string, envLevel: string) {
        const debugMsg = `[Logger Init] Module: ${moduleName}, Level: ${envLevel} (${this.minLevel}), Enabled: ${this.enabled}`;
        console.log(debugMsg);
    }

    private logFilePath = 'server.log';

    private output(level: LogLevel, msg: string, meta?: any) {
        if (!this.enabled) return;
        if (LEVELS[level] < this.minLevel) return;
        
        // 1. Console Output (with colors if TTY)
        const consoleFormatted = this.format(level, msg, meta, true);
        switch (level) {
            case 'ERROR': console.error(consoleFormatted); break;
            case 'WARN':  console.warn(consoleFormatted); break;
            default:      console.log(consoleFormatted);
        }

        // 2. File Output (no colors)
        // We write asynchronously and ignore errors to not block main thread
        const fileFormatted = this.format(level, msg, meta, false);
        this.appendToFile(fileFormatted);
    }

    private appendToFile(line: string) {
        // Bun specific file appending or Node fs
        // Using Bun.file().writer() is one way, or simple fs.appendFile
        // Since we are in standard environment, let's use fs for compatibility or Bun.write
        // fs is safer for simple append logging without keeping open handles everywhere
        // but Bun's write is optimized.
        
        // Simulating simple append.
        // We use absolute path to be safe.
        // Assumes running from apps/backend or root. 
        // Best to use process.cwd()/apps/backend/server.log if running from root, or just server.log if CWD is correct.
        // Given "bun run restart" runs in /projects/analisis, we might need to adjust path.
        // BUT current CWD for backend in monorepo scripts usually is apps/backend or root?
        // Let's check where the user expects it. The user has "apps/backend/server.log" open.
        // If CWD is project root, path is 'apps/backend/server.log'.
        // If CWD is apps/backend, path is 'server.log'.
        
        // Hack for now: try to write to standard location relative to CWD
        // We'll use a pragmatic approach: write to 'server.log' in CWD.
        // If CWD is root, it logs to root. If backend, logs to backend.
        
        try {
           // Synchronous append for safety/simplicity in this context, or async.
           // Async is better.
           const fs = require('fs');
           fs.appendFile(this.logFilePath, line + '\n', (err: any) => {
               if (err) console.error('Failed to write to log file:', err);
           });
        } catch (e) {
            // ignore
        }
    }

    private format(level: LogLevel, message: string, meta?: any, useColors: boolean = false) {
        const timestamp = new Date().toISOString();
        
        if (this.isProd) {
            return JSON.stringify({
                timestamp,
                level,
                module: this.module,
                message,
                ...(meta && { meta })
            });
        }
        
        if (meta instanceof Error) {
            meta = {
                message: meta.message,
                stack: meta.stack,
                name: meta.name,
                ...(meta as any)
            };
        }
        const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
        
        if (useColors && isTTY) {
             const colors = {
                DEBUG: '\x1b[90m', // Gray
                INFO: '\x1b[32m',  // Green
                WARN: '\x1b[33m',  // Yellow
                ERROR: '\x1b[31m', // Red
            };
            const reset = '\x1b[0m';
            return `${colors[level]}[${timestamp}] [${level.padEnd(5)}] [${this.module}] ${message}${metaStr}${reset}`;
        }
        
        return `[${timestamp}] [${level.padEnd(5)}] [${this.module}] ${message}${metaStr}`;
    }

    debug(msg: string, meta?: any) { this.output('DEBUG', msg, meta); }
    info(msg: string, meta?: any) { this.output('INFO', msg, meta); }
    warn(msg: string, meta?: any) { this.output('WARN', msg, meta); }
    error(msg: string, meta?: any) { this.output('ERROR', msg, meta); }
}