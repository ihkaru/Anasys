type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LEVELS: Record<LogLevel, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

/**
 * Frontend Logger with toggle capabilities via localStorage and Env variables.
 * 
 * Control via Console:
 * - localStorage.setItem('LOG_LEVEL', 'DEBUG')
 * - localStorage.setItem('LOG_MODULES', 'Auth,Market') // Comma separated, references 'moduleName'
 * - localStorage.setItem('LOG_MODULES', '*') // Enable all
 */
export class Logger {
    private module: string;
    private minLevel: number;
    private enabled: boolean = true;

    constructor(moduleName: string) {
        this.module = moduleName;
        
        // 1. Level Config
        const storedLevel = localStorage.getItem('LOG_LEVEL') as LogLevel | null;
        const envLevel = (import.meta.env.VITE_LOG_LEVEL || 'INFO').toUpperCase() as LogLevel;
        const level = storedLevel || envLevel;
        
        this.minLevel = LEVELS[level] ?? 1; // Default INFO

        // 2. Module Toggle
        const storedModules = localStorage.getItem('LOG_MODULES');
        const envModules = import.meta.env.VITE_LOG_MODULES;
        const allowList = storedModules || envModules;
        
        // If allowList is defined, we enforce it. If undefined, we default to ALL enabled (or handled by LOG_LEVEL)
        // Actually, usually if no modules specified, we enable all, unless LOG_LEVEL is stricter.
        // Let's say: if LOG_MODULES is set, only those are allowed. If NOT set, everyone is allowed.
        if (allowList) {
            const modules = allowList.split(',').map((m: string) => m.trim().toLowerCase());
            if (!modules.includes('*') && !modules.includes(moduleName.toLowerCase())) {
                this.enabled = false;
            }
        }
    }

    private format(level: LogLevel, message: string) {
        const timestamp = new Date().toLocaleTimeString();
        return {
            text: `[${timestamp}] [${this.module}] ${message}`,
            style: this.getStyle(level)
        };
    }

    private getStyle(level: LogLevel) {
        switch(level) {
            case 'DEBUG': return 'color: #9ca3af'; // gray
            case 'INFO': return 'color: #3b82f6'; // blue
            case 'WARN': return 'color: #f59e0b'; // orange
            case 'ERROR': return 'color: #ef4444; font-weight: bold'; // red
            default: return '';
        }
    }

    private output(level: LogLevel, msg: string, args: any[]) {
        if (!this.enabled) return;
        if (LEVELS[level] >= this.minLevel) {
            const { text, style } = this.format(level, msg);
            const consoleMethod = console[level.toLowerCase() as keyof Console] as Function;
            // First arg is format string with css, subsequent args are objects
            if (args.length > 0) {
                consoleMethod(`%c${text}`, style, ...args);
            } else {
                consoleMethod(`%c${text}`, style);
            }
        }
    }

    debug(msg: string, ...args: any[]) { this.output('DEBUG', msg, args); }
    info(msg: string, ...args: any[]) { this.output('INFO', msg, args); }
    warn(msg: string, ...args: any[]) { this.output('WARN', msg, args); }
    error(msg: string, ...args: any[]) { this.output('ERROR', msg, args); }
}

export const createLogger = (module: string) => new Logger(module);
