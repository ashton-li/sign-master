import { describe, expect, it } from 'vitest'
import { getNextThemeMode, resolveThemeClass, resolveThemeLabel } from '../../src/core/theme/themeResolver.js'

describe('themeResolver', () => {
  it('cycles auto -> dark -> light -> auto', () => {
    expect(getNextThemeMode('auto')).toBe('dark')
    expect(getNextThemeMode('dark')).toBe('light')
    expect(getNextThemeMode('light')).toBe('auto')
    expect(getNextThemeMode('unexpected')).toBe('auto')
  })

  it('resolves theme class from explicit or system mode', () => {
    expect(resolveThemeClass('dark', false)).toBe('theme-dark')
    expect(resolveThemeClass('light', true)).toBe('theme-light')
    expect(resolveThemeClass('auto', true)).toBe('theme-dark')
    expect(resolveThemeClass('auto', false)).toBe('theme-light')
  })

  it('returns Chinese labels used by settings toast', () => {
    expect(resolveThemeLabel('auto')).toBe('跟随系统')
    expect(resolveThemeLabel('dark')).toBe('深色模式')
    expect(resolveThemeLabel('light')).toBe('浅色模式')
  })
})
