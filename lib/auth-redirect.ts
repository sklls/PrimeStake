// ── Where an auth callback is allowed to send someone ──────
// The `next` parameter arrives from a link in an email, so it is attacker
// controllable. Only same-site paths are honoured; anything else falls back to
// the home page rather than bouncing the visitor off to another host.

export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return '/'
  // Must be anchored at the site root.
  if (!raw.startsWith('/')) return '/'
  // "//host" is protocol-relative and leaves the site.
  if (raw.startsWith('//')) return '/'
  // Browsers treat backslashes in the authority position like forward slashes,
  // so "/\host" can escape too.
  if (raw.includes('\\')) return '/'
  return raw
}
