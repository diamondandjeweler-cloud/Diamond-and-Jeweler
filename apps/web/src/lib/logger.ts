/**
 * Structured client logger.
 *
 * A thin, zero-dependency wrapper over `console` that adds a consistent level +
 * `[scope]` prefix so logs are greppable/filterable, and gives the app a SINGLE
 * place to later route logs to Sentry/an aggregator without touching call sites.
 *
 * Deliberately behaviour-preserving: every call still hits the same underlying
 * `console.*` method with the same arguments (just prefixed), so output is
 * effectively identical to the raw `console.*` it replaces. It mirrors the
 * `console.*` signatures (variadic `...args`) so call sites migrate 1:1:
 *   console.error('fetchProfile error', error)  ->  log.error('fetchProfile error', error)
 *
 * It never throws and never alters control flow. It does NOT statically import
 * the Sentry SDK (that would pull it into the critical path that main.tsx
 * deliberately defers) and does NOT auto-capture — explicit Sentry/telemetry
 * calls at call sites are left as-is.
 */

type Level = 'debug' | 'info' | 'warn' | 'error'

const sink: Record<Level, (...args: unknown[]) => void> = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
}

function emit(level: Level, scope: string, args: unknown[]): void {
  try {
    sink[level](`[${scope}]`, ...args)
  } catch {
    /* logging must never throw or alter control flow */
  }
}

export interface Logger {
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

/** Create a scoped logger. `scope` is a short module/feature tag, e.g. 'session'. */
export function createLogger(scope: string): Logger {
  return {
    debug: (...args) => emit('debug', scope, args),
    info: (...args) => emit('info', scope, args),
    warn: (...args) => emit('warn', scope, args),
    error: (...args) => emit('error', scope, args),
  }
}

/** Default app-scoped logger for quick use; prefer createLogger('<scope>'). */
export const log = createLogger('app')
