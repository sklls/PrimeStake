import { describe, it, expect } from 'vitest'
import {
  validateNewPassword,
  MIN_PASSWORD_LENGTH,
  generateTempPassword,
  TEMP_PASSWORD_LENGTH,
  TEMP_PASSWORD_ALPHABET,
} from './password'

describe('validateNewPassword', () => {
  it('accepts a matching password at the minimum length', () => {
    const pw = 'a'.repeat(MIN_PASSWORD_LENGTH)
    expect(validateNewPassword(pw, pw)).toEqual({ ok: true })
  })

  it('rejects a password one character short of the minimum', () => {
    const pw = 'a'.repeat(MIN_PASSWORD_LENGTH - 1)
    const result = validateNewPassword(pw, pw)
    expect(result.ok).toBe(false)
  })

  it('names the minimum length in the too-short message, so the page can state the rule', () => {
    const pw = 'a'.repeat(MIN_PASSWORD_LENGTH - 1)
    const result = validateNewPassword(pw, pw)
    expect(result.ok === false && result.error).toContain(String(MIN_PASSWORD_LENGTH))
  })

  it('rejects an empty password', () => {
    expect(validateNewPassword('', '').ok).toBe(false)
  })

  it('rejects a password made only of whitespace', () => {
    const pw = ' '.repeat(MIN_PASSWORD_LENGTH + 2)
    expect(validateNewPassword(pw, pw).ok).toBe(false)
  })

  it('rejects a confirmation that does not match', () => {
    expect(validateNewPassword('correct-horse', 'correct-horse-x').ok).toBe(false)
  })

  it('reports the mismatch rather than the length when both are wrong', () => {
    const result = validateNewPassword('ab', 'cd')
    expect(result.ok === false && result.error.toLowerCase()).toContain('match')
  })

  it('treats surrounding spaces as part of the password rather than trimming them', () => {
    // ' secret' and 'secret ' are only equal if the implementation trims.
    expect(validateNewPassword(' secret', 'secret ').ok).toBe(false)
  })

  it('accepts a password whose length depends on its surrounding spaces', () => {
    const pw = '  ab  '
    expect(pw.length).toBe(MIN_PASSWORD_LENGTH)
    expect(validateNewPassword(pw, pw)).toEqual({ ok: true })
  })
})

describe('generateTempPassword', () => {
  it('is long enough to be worth generating', () => {
    expect(generateTempPassword()).toHaveLength(TEMP_PASSWORD_LENGTH)
    expect(TEMP_PASSWORD_LENGTH).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH)
  })

  it('uses only characters from its own alphabet', () => {
    for (const char of generateTempPassword()) {
      expect(TEMP_PASSWORD_ALPHABET).toContain(char)
    }
  })

  it('leaves out glyphs that get misread when the password is read aloud or copied', () => {
    for (const ambiguous of ['0', 'O', '1', 'l', 'I']) {
      expect(TEMP_PASSWORD_ALPHABET).not.toContain(ambiguous)
    }
  })

  it('does not return the same password twice', () => {
    const seen = new Set(Array.from({ length: 20 }, () => generateTempPassword()))
    expect(seen.size).toBe(20)
  })

  it('produces something the reset form would itself accept', () => {
    const pw = generateTempPassword()
    expect(validateNewPassword(pw, pw)).toEqual({ ok: true })
  })
})
