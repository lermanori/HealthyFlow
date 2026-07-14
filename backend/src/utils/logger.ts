/**
 * Minimal leveled logger.
 *
 * Replaces scattered `console.log` calls so that diagnostic/trace output can be
 * silenced in production. Level is controlled by `LOG_LEVEL` (debug | info |
 * warn | error); it defaults to `debug` in development and `info` otherwise, so
 * `logger.debug(...)` traces disappear from production logs without code changes.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

function resolveLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL || '').toLowerCase()
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug'
}

const threshold = LEVEL_ORDER[resolveLevel()]

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= threshold
}

export const logger = {
  debug(...args: unknown[]): void {
    if (shouldLog('debug')) console.debug(...args)
  },
  info(...args: unknown[]): void {
    if (shouldLog('info')) console.info(...args)
  },
  warn(...args: unknown[]): void {
    if (shouldLog('warn')) console.warn(...args)
  },
  error(...args: unknown[]): void {
    if (shouldLog('error')) console.error(...args)
  },
}
