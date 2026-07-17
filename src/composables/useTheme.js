import { computed } from 'vue'
import { useThemeStore } from '../stores/theme'

export function useTheme() {
  const themeStore = useThemeStore()

  return {
    mode: computed(() => themeStore.mode),
    themeClass: computed(() => themeStore.themeClass),
    themeLabel: computed(() => themeStore.themeLabel),
    initTheme: themeStore.init,
    toggleTheme: themeStore.toggle
  }
}
