// ── New-password rules, shared by the reset page and the admin reset ──
// Kept at 6 to match the minimum the sign-up form already advertises, so a
// player is never told a different rule depending on which door they came in.

export const MIN_PASSWORD_LENGTH = 6

export type PasswordCheck = { ok: true } | { ok: false; error: string }

export function validateNewPassword(password: string, confirm: string): PasswordCheck {
  // Mismatch first: when both fields are wrong, the mismatch is the one the
  // player can actually see and fix.
  if (password !== confirm) {
    return { ok: false, error: 'Those passwords do not match.' }
  }
  // Deliberately not trimmed for the length check below — spaces are real
  // characters in a password — but an entirely blank entry is a slip, not a
  // password.
  if (password.trim().length === 0) {
    return { ok: false, error: 'Please enter a password.' }
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Please use at least ${MIN_PASSWORD_LENGTH} characters.` }
  }
  return { ok: true }
}

// ── Admin-issued temporary passwords ───────────────────────
// An admin reads this down a phone or pastes it into a chat, so the alphabet
// leaves out 0/O and 1/l/I, which get transcribed wrongly.

export const TEMP_PASSWORD_LENGTH = 12
export const TEMP_PASSWORD_ALPHABET =
  'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateTempPassword(): string {
  const n = TEMP_PASSWORD_ALPHABET.length
  // Rejection sampling: taking a byte modulo 57 would favour the first few
  // characters, so bytes above the last whole multiple of 57 are discarded.
  const limit = Math.floor(256 / n) * n
  const byte = new Uint8Array(1)
  let out = ''
  while (out.length < TEMP_PASSWORD_LENGTH) {
    crypto.getRandomValues(byte)
    if (byte[0] < limit) out += TEMP_PASSWORD_ALPHABET[byte[0] % n]
  }
  return out
}
