import { onLoad, onShow } from '@dcloudio/uni-app'

const SHARE_IMAGE = '/static/share-cover.png'
const SHARE_PATH = '/pages/home/index?from=share'
const SHARE_CONFIG = {
  home: {
    friendTitle:'签字大师｜手机签文件，三步轻松完成',
    timelineTitle:'手机签文件不用打印，签字大师三步完成'
  },
  templates: {
    friendTitle:'签字大师｜常用文件一键套用，签署更省时',
    timelineTitle:'常用文件一键套用，手机签署更省时'
  },
  signatures: {
    friendTitle:'签字大师｜保存常用签名，随时快速签文件',
    timelineTitle:'保存常用签名，手机签文件更方便'
  },
  settings: {
    friendTitle:'签字大师｜文件本地处理，手机签署更安心',
    timelineTitle:'文件本地处理，手机签署更安心'
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

  const friendShare = () => ({
    title:config.friendTitle,
    path:`${SHARE_PATH}&campaign=${page}`,
    imageUrl:SHARE_IMAGE
  })

  const timelineShare = () => ({
    title:config.timelineTitle,
    query:`from=timeline&campaign=${page}`,
    imageUrl:SHARE_IMAGE
  })

  return { ...config, imageUrl:SHARE_IMAGE, friendShare, timelineShare }
}
