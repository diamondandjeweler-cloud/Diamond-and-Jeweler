/**
 * Structured logger for Edge Functions (Deno).
 *
 * A thin, zero-dependency wrapper over `console` that adds a consistent level +
 * `[scope]` prefix, giving every edge function uniform, greppable logs and a
 * single seam to later forward to an aggregator.
 *
 * Deliberately behaviour-preserving: each call hits the same underlying
 * `console.*` with the same arguments (just prefixed), so output is effectively
 * identical to the raw `console.*` it replaces. Mirrors `console.*` signatures
 * so call sites migrate 1:1:
 *   console.error('x failed', e)  ->  log.error('x failed', e)
 *
 * It never throws and never alters control flow. It does NOT auto-forward to
 * reportError() — that would double-report at the many sites that already call
 * reportError() explicitly (and would risk a cycle with _shared/observe.ts).
 * Those explicit telemetry calls are left untouched.
 */

type Level = 'debug' | 'info' | 'warn' | 'error'

function emit(level: Level, scope: string, args: unknown[]): void {
  try {
    const out =
      level === 'error' ? console.error
      : level === 'warn' ? console.warn
      : level === 'info' ? console.info
      : console.log
    out(`[${scope}]`, ...args)
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

/** Create a scoped logger. `scope` is the function name, e.g. 'payment-webhook'. */
export function createLogger(scope: string): Logger {
  return {
    debug: (...args) => emit('debug', scope, args),
    info: (...args) => emit('info', scope, args),
    warn: (...args) => emit('warn', scope, args),
    error: (...args) => emit('error', scope, args),
  }
}

/** Default edge-scoped logger; prefer createLogger('<function-name>'). */
export const log = createLogger('edge')
