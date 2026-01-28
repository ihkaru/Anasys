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

    private format(level: LogLevel, message: string, meta?: any) {
        const timestamp = this.isProd 
            ? new Date().toISOString() 
            : new Date().toLocaleTimeString('en-US', { hour12: false });
        
        // Production: JSON format (for log aggregators)
        if (this.isProd) {
            return JSON.stringify({
                timestamp,
                level,
                module: this.module,
                message,
                ...(meta && { meta })
            });
        }
        
        const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
        
        // Development with TTY: Colored output
        if (isTTY) {
            const colors = {
                DEBUG: '\x1b[90m', // Gray
                INFO: '\x1b[32m',  // Green
                WARN: '\x1b[33m',  // Yellow
                ERROR: '\x1b[31m', // Red
            };
            const reset = '\x1b[0m';
            return `${colors[level]}[${timestamp}] [${level.padEnd(5)}] [${this.module}] ${message}${metaStr}${reset}`;
        }
        
        // Development without TTY (file output): No colors
        return `[${timestamp}] [${level.padEnd(5)}] [${this.module}] ${message}${metaStr}`;
    }

    private output(level: LogLevel, msg: string, meta?: any) {
        if (!this.enabled) return;
        if (LEVELS[level] < this.minLevel) return;
        
        const formatted = this.format(level, msg, meta);
        
        // Use appropriate console method
        switch (level) {
            case 'ERROR':
                console.error(formatted);
                break;
            case 'WARN':
                console.warn(formatted);
                break;
            default:
                console.log(formatted);
        }
    }

    debug(msg: string, meta?: any) { this.output('DEBUG', msg, meta); }
    info(msg: string, meta?: any) { this.output('INFO', msg, meta); }
    warn(msg: string, meta?: any) { this.output('WARN', msg, meta); }
    error(msg: string, meta?: any) { this.output('ERROR', msg, meta); }
}