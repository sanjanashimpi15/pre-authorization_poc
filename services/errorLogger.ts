/**
 * services/errorLogger.ts
 *
 * Cross-environment browser-safe error telemetry logging service.
 * Automatically detects whether it is running in Node.js or in Vite/Browser.
 *
 * Browser features:
 * - Logs to console.error with a stylized [Aivana Telemetry] prefix.
 * - Stores up to 100 errors in `window.__runtime_errors`.
 * - Persists to `localStorage` under `aivana_runtime_errors`.
 *
 * Node.js features:
 * - Appends structured JSON logs to `logs/runtime_errors.jsonl`.
 */

export interface ErrorLogEntry {
  timestamp: string;
  module: string;
  message: string;
  stack?: string;
  errorName?: string;
}

export function reportError(module: string, message: string, error?: any) {
  const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';
  
  const entry: ErrorLogEntry = {
    timestamp: new Date().toISOString(),
    module,
    message,
    ...(error instanceof Error ? {
      stack: error.stack,
      errorName: error.name
    } : error ? {
      message: String(error)
    } : {})
  };

  // 1. Browser Logging & Persistence
  if (isBrowser) {
    console.error(
      `%c[Aivana Telemetry] [${module}] ${message}`,
      'color: #ff3333; font-weight: bold;',
      error || ''
    );

    try {
      const g = window as any;
      g.__runtime_errors = g.__runtime_errors || [];
      g.__runtime_errors.unshift(entry);
      if (g.__runtime_errors.length > 100) {
        g.__runtime_errors = g.__runtime_errors.slice(0, 100);
      }

      // Persist in localStorage for cross-page diagnostic review
      const raw = localStorage.getItem('aivana_runtime_errors');
      let list: ErrorLogEntry[] = [];
      if (raw) {
        try {
          list = JSON.parse(raw);
        } catch {
          list = [];
        }
      }
      list.unshift(entry);
      if (list.length > 50) {
        list = list.slice(0, 50);
      }
      localStorage.setItem('aivana_runtime_errors', JSON.stringify(list));
    } catch (e) {
      // Ignore storage capacity or permission restrictions in iframe/sandboxes
    }
  } else {
    // 2. Node.js / Server Environment Logging
    // Print to server console
    console.error(`[Aivana Telemetry] [${module}] ${message}`, error || '');

    try {
      // Dynamic import/require of fs & path to prevent Vite bundler from trying to resolve Node modules
      // which triggers build-time warnings or browser runtime exceptions.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const path = require('path');
      
      const logsDir = path.join(process.cwd(), 'logs');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      const logFile = path.join(logsDir, 'runtime_errors.jsonl');
      fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf-8');
    } catch (err) {
      // Fallback for webpack/vite polyfilled server environments where fs does not resolve or throws
    }
  }
}
