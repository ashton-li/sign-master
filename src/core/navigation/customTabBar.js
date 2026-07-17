export function syncCustomTabBar(selected) {
  // #ifdef MP-WEIXIN
  const apply = () => {
    try {
      const pages = getCurrentPages()
      const current = pages[pages.length - 1]
      const tabBar = typeof current?.getTabBar === 'function' ? current.getTabBar() : null
      if (tabBar && tabBar.data?.selected !== selected) tabBar.setData({ selected })
    } catch {
      // The native tab bar may not be attached during the first page tick.
    }
  }
  apply()
  setTimeout(apply, 0)
  setTimeout(apply, 80)
  // #endif
}

export function syncCustomTabBarTheme(dark) {
  // #ifdef MP-WEIXIN
  const apply = () => {
    try {
      const pages = getCurrentPages()
      const current = pages[pages.length - 1]
      const tabBar = typeof current?.getTabBar === 'function' ? current.getTabBar() : null
      if (tabBar && tabBar.data?.dark !== dark) tabBar.setData({ dark })
    } catch {}
  }
  apply()
  setTimeout(apply, 0)
  setTimeout(apply, 80)
  // #endif
}
