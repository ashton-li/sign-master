const THEME_SEQUENCE = ['auto', 'dark', 'light']

export function normalizeThemeMode(mode) {
  return THEME_SEQUENCE.includes(mode) ? mode : 'auto'
}

export function getNextThemeMode(mode) {
  if (!THEME_SEQUENCE.includes(mode)) return 'auto'
  const normalized = mode
  const index = THEME_SEQUENCE.indexOf(normalized)
  return THEME_SEQUENCE[(index + 1) % THEME_SEQUENCE.length]
}

export function resolveThemeClass(mode, systemDark = false) {
  const normalized = normalizeThemeMode(mode)
  if (normalized === 'dark') return 'theme-dark'
  if (normalized === 'light') return 'theme-light'
  return systemDark ? 'theme-dark' : 'theme-light'
}

export function resolveThemeLabel(mode) {
  const labels = {
    auto: '跟随系统',
    dark: '深色模式',
    light: '浅色模式'
  }
  return labels[normalizeThemeMode(mode)]
}
