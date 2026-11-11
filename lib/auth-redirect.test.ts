import { describe, it, expect } from 'vitest'
import { safeNextPath } from './auth-redirect'

describe('safeNextPath', () => {
  it('keeps an ordinary in-app path', () => {
    expect(safeNextPath('/update-password')).toBe('/update-password')
  })

  it('keeps a query string on an in-app path', () => {
    expect(safeNextPath('/sports/cricket?tab=markets')).toBe('/sports/cricket?tab=markets')
  })

  it('falls back to the home page when there is no next at all', () => {
    expect(safeNextPath(null)).toBe('/')
    expect(safeNextPath(undefined)).toBe('/')
    expect(safeNextPath('')).toBe('/')
  })

  it('refuses a protocol-relative path that would leave the site', () => {
    expect(safeNextPath('//evil.example')).toBe('/')
  })

  it('refuses an absolute url', () => {
    expect(safeNextPath('https://evil.example/phish')).toBe('/')
  })

  it('refuses a backslash path, which browsers treat like a protocol-relative one', () => {
    expect(safeNextPath('/\\evil.example')).toBe('/')
    expect(safeNextPath('\\\\evil.example')).toBe('/')
  })

  it('refuses anything not anchored at the site root', () => {
    expect(safeNextPath('update-password')).toBe('/')
    expect(safeNextPath('../admin')).toBe('/')
  })
})
