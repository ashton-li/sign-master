import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getNextThemeMode, resolveThemeClass, resolveThemeLabel } from '../core/theme/themeResolver'
import { syncCustomTabBarTheme } from '../core/navigation/customTabBar'

const STORAGE_KEY = 'theme-mode'

function readSystemDark() {
  try {
    const info = typeof uni.getAppBaseInfo === 'function'
      ? uni.getAppBaseInfo()
      : (typeof uni.getSystemInfoSync === 'function' ? uni.getSystemInfoSync() : {})
    return info.theme === 'dark'
  } catch {
    return false
  }
}

export const useThemeStore = defineStore('theme', () => {
  const mode = ref('auto')
  const systemDark = ref(false)
  const initialized = ref(false)

  const themeClass = computed(() => resolveThemeClass(mode.value, systemDark.value))
  const themeLabel = computed(() => resolveThemeLabel(mode.value))

  function persist() {
    try {
      uni.setStorageSync(STORAGE_KEY, mode.value)
    } catch {
      // Storage can fail in restricted runtimes; theme still works in memory.
    }
    syncCustomTabBarTheme(resolveThemeClass(mode.value, systemDark.value) === 'theme-dark')
  }

  function init() {
    systemDark.value = readSystemDark()

    if (!initialized.value) {
      try {
        const saved = uni.getStorageSync(STORAGE_KEY)
        if (saved) mode.value = saved
      } catch {
        mode.value = 'auto'
      }

      if (typeof uni.onThemeChange === 'function') {
        uni.onThemeChange((res) => {
          systemDark.value = res.theme === 'dark'
          syncCustomTabBarTheme(resolveThemeClass(mode.value, systemDark.value) === 'theme-dark')
        })
      }
      initialized.value = true
    }
    syncCustomTabBarTheme(resolveThemeClass(mode.value, systemDark.value) === 'theme-dark')
  }

  function toggle() {
    mode.value = getNextThemeMode(mode.value)
    persist()
    return mode.value
  }

  function setMode(nextMode) {
    mode.value = nextMode
    persist()
  }

  return {
    mode,
    systemDark,
    themeClass,
    themeLabel,
    init,
    toggle,
    setMode
  }
})
