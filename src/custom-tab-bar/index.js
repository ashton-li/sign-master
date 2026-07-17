const tabs = [
  { pagePath: 'pages/home/index', text: '文件' },
  { pagePath: 'pages/templates/index', text: '模板' },
  { pagePath: 'pages/signatures/index', text: '签名' },
  { pagePath: 'pages/settings/index', text: '我的' }
]

Component({
  data: {
    selected: 0,
    dark: false,
    tabs
  },
  lifetimes: {
    attached() {
      this.syncSelected()
      this.syncTheme()
      this.themeListener = ({ theme }) => this.syncTheme(theme)
      if (typeof wx.onThemeChange === 'function') wx.onThemeChange(this.themeListener)
    },
    detached() {
      if (this.themeListener && typeof wx.offThemeChange === 'function') wx.offThemeChange(this.themeListener)
    }
  },
  pageLifetimes: {
    show() {
      this.syncSelected()
      this.syncTheme()
      setTimeout(() => this.syncSelected(), 0)
    }
  },
  methods: {
    syncTheme(systemTheme) {
      const mode = wx.getStorageSync('theme-mode') || 'auto'
      const theme = systemTheme || wx.getAppBaseInfo?.().theme || wx.getSystemInfoSync?.().theme || 'light'
      const dark = mode === 'dark' || (mode === 'auto' && theme === 'dark')
      if (dark !== this.data.dark) this.setData({ dark })
    },
    syncSelected() {
      const pages = getCurrentPages()
      const route = pages[pages.length - 1]?.route || ''
      const selected = tabs.findIndex((item) => item.pagePath === route)
      if (selected >= 0 && selected !== this.data.selected) this.setData({ selected })
    },
    switchTab(event) {
      const selected = Number(event.currentTarget.dataset.index)
      const item = tabs[selected]
      if (!item || selected === this.data.selected) return
      this.setData({ selected })
      wx.switchTab({ url: `/${item.pagePath}` })
    },
    startSigning() {
      wx.setStorageSync('sign-master:home-guide-seen', true)
      wx.navigateTo({ url: '/pages/sign/index?fresh=1' })
    }
  }
})
