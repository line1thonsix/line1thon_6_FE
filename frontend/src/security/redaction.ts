export const REDACTED = '[REDACTED]'

// Pattern-based protection, not exhaustive PII/secret detection. Do not log matches.
export function redactSecrets(text: string): { value: string; redacted: boolean } {
  let value = text
  // Also protect an unfinished PEM block while a draft is being typed.
  value = value.replace(/-----BEGIN ((?:[A-Z0-9]+ )?PRIVATE KEY)-----[\s\S]*?(?:-----END \1-----|$)/g, REDACTED)
  value = value.replace(/\b(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}|sk_(?:live|test)_[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}|AIza[A-Za-z0-9_-]{20,}|(?:AKIA|ASIA)[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{16,})\b/g, REDACTED)
  value = value.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, REDACTED)
  value = value.replace(/(\bBearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1' + REDACTED)
  value = value.replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)([^\s@]+)(@)/gi, '$1' + REDACTED + '$3')
  const name = String.raw`\b(?:[a-z][a-z0-9]*_)*(?:api[_-]?key|secret[_-]?access[_-]?key|access[_-]?key(?:[_-]?id)?|private[_-]?key|token|access[_-]?token|refresh[_-]?token|auth[_-]?token|client[_-]?secret|secret(?:[_-]?key)?|password|passwd|authorization)\b["']?\s*[:=]\s*`
  const isReference = (v: string) => v === REDACTED || v === 'Bearer' || /^(?:process\.env\.|import\.meta\.env\.|\$\{|\$[A-Z_]|<)/.test(v)
  const quoted = new RegExp('(' + name + ')("(?:\\\\.|[^"\\\\\\r\\n])*"|\'(?:\\\\.|[^\'\\\\\\r\\n])*\'|`(?:\\\\.|[^`\\\\\\r\\n])*`)', 'gi')
  value = value.replace(quoted, (_match, prefix: string, literal: string) => {
    const secret = literal.slice(1, -1)
    return prefix + (secret && !isReference(secret) ? literal[0] + REDACTED + literal.at(-1) : literal)
  })
  const unquoted = new RegExp('(' + name + ')([^\\s"\'`,;)}&#]+)', 'gi')
  value = value.replace(unquoted, (_match, prefix: string, secret: string) =>
    prefix + (isReference(secret) || /^[a-z_$][\w$]*\(/i.test(secret) ? secret : REDACTED))
  return { value, redacted: value !== text }
}

// Sanitize values, never keys/identifiers from a property name. Preserve non-string primitives.
export function redactValue<T>(input: T): { value: T; redacted: boolean } {
  let redacted = false
  function visit(value: unknown, field?: string): unknown {
    if (typeof value === 'string' && field === 'fingerprint') {
      try {
        const nested = redactValue(JSON.parse(value))
        if (nested.redacted) { redacted = true; return JSON.stringify(nested.value) }
        return value
      } catch { /* A non-JSON fingerprint still receives the ordinary string scrub below. */ }
    }
    if (typeof value === 'string') { const result = redactSecrets(value); redacted ||= result.redacted; return result.value }
    if (Array.isArray(value)) return value.map(item => visit(item))
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item, key)]))
    return value
  }
  return { value: visit(input) as T, redacted }
}
