import { onLoad, onShareAppMessage, onShareTimeline, onShow } from '@dcloudio/uni-app'

const SHARE_IMAGE = '/static/share-cover.png'
const SHARE_PATH = '/pages/home/index?from=share'
const SHARE_CONFIG = {
  home: {
    friendTitle:'手机签文件，就用签字大师｜本地处理更安心',
    timelineTitle:'我在用签字大师，手机上就能手写签文件'
  },
  templates: {
    friendTitle:'常用文件一键复用｜签字大师让签署更省时',
    timelineTitle:'常用签署模板，手机一键复用更方便'
  },
  signatures: {
    friendTitle:'保存常用签字，随时快速签｜签字大师',
    timelineTitle:'手写签字随身保存，签文件更方便'
  },
  settings: {
    friendTitle:'纯本地电子签署工具｜签字大师',
    timelineTitle:'推荐一个纯本地处理的电子签署小程序'
  }
}

export function useMiniProgramShare(page = 'home') {
  const config = SHARE_CONFIG[page] || SHARE_CONFIG.home

  onLoad((query) => {
    if (page === 'home' || query?.from !== 'timeline') return
    setTimeout(() => uni.switchTab({ url:'/pages/home/index' }), 0)
  })

  onShow(() => {
    // #ifdef MP-WEIXIN
    if (typeof wx !== 'undefined' && typeof wx.showShareMenu === 'function') {
      wx.showShareMenu({ withShareTicket:true, menus:['shareAppMessage', 'shareTimeline'] })
    }
    // #endif
  })

  onShareAppMessage(() => ({
    title:config.friendTitle,
    path:`${SHARE_PATH}&campaign=${page}`,
    imageUrl:SHARE_IMAGE
  }))

  onShareTimeline(() => ({
    title:config.timelineTitle,
    query:`from=timeline&campaign=${page}`,
    imageUrl:SHARE_IMAGE
  }))

  return { ...config, imageUrl:SHARE_IMAGE }
}
