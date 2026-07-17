<template>
  <PageShell :tab="false" compact>
    <view class="privacy soft-card">
      <text class="updated">更新日期：2026-07-17</text>
      <text class="summary">本说明概述签字大师在微信小程序内处理文件与权限的方式。</text>
      <view v-for="section in sections" :key="section.title" class="section"><text>{{ section.title }}</text><text>{{ section.body }}</text></view>
      <button class="copy-email" @click="handleCopyEmail">联系邮箱：{{ contactEmail }}</button>
    </view>
  </PageShell>
</template>

<script setup>
import PageShell from '../../components/PageShell.vue'

const contactEmail = import.meta.env.VITE_CONTACT_EMAIL || 'amoyhome2026@163.com'
const sections = [
  { title:'1. 处理的数据', body:'当您主动使用相机、相册、微信文件或签字功能时，小程序会处理您选择的文件、图片、手写轨迹、签字坐标、模板和导出结果。' },
  { title:'2. 处理目的与方式', body:'上述数据仅用于完成文件预览、扫描裁切、签字合成、模板复用、导出、备份恢复和用户主动发起的签字鉴别。处理在当前设备的微信小程序沙箱中完成，不上传至签字大师的业务服务器。' },
  { title:'3. 系统权限', body:'仅在您主动点击拍摄、选择相册图片或保存图片时，通过微信请求对应权限。您可在微信的小程序设置中查看或关闭权限；关闭后对应功能可能无法使用。' },
  { title:'4. 本地保存与保留', body:'文件索引、签字图片与轨迹、模板坐标、主题及功能设置保存在微信本地存储和用户文件目录。数据保留至您主动删除、清理小程序数据或卸载小程序。' },
  { title:'5. 本机匿名 ID', body:'首次启动时会在小程序用户文件目录生成随机的本机匿名 ID，用于本地数据归属和鉴别参考。小程序不获取 OpenID，不调用云函数。' },
  { title:'6. 备份、分享与反馈', body:'完整备份使用加密压缩格式生成，只有在您点击分享时才交由微信发送。帮助页填写的反馈不会自动上传，需要您复制后主动通过邮箱或公众号发送。' },
  { title:'7. 删除、导出与恢复', body:'您可在对应页面删除文件、模板和签字，并在“容量管理”中清理临时或可再生成数据。清理小程序数据或卸载后本地内容可能无法恢复，请提前导出加密备份。' },
  { title:'8. 签字鉴别声明', body:'签字鉴别和文件防伪结果仅作为本机技术一致性参考，不构成实名身份认证、司法鉴定或法律意见。' },
  { title:'9. 联系我们', body:'对本说明或数据处理方式有疑问，可通过下方邮箱联系。' }
]
function handleCopyEmail() { uni.setClipboardData({ data:contactEmail, success:() => uni.showToast({ title:'邮箱已复制', icon:'success' }) }) }
</script>

<style scoped>
.privacy{margin:12px 0 calc(24px + env(safe-area-inset-bottom));padding:18px}.updated{display:block;color:var(--color-tertiary);font-size:9px}.summary{display:block;margin-top:9px;padding:11px;color:var(--color-muted);font-size:10px;line-height:18px;border-left:4px solid var(--color-brand);background:var(--color-brand-soft)}.section{display:flex;flex-direction:column;margin-top:18px}.section text:first-child{color:var(--color-ink);font-size:13px;font-weight:900}.section text:last-child{margin-top:7px;color:var(--color-muted);font-size:11px;line-height:19px}.copy-email{display:flex;width:100%;height:44px;align-items:center;justify-content:center;margin-top:20px;color:var(--color-brand);font-size:11px;font-weight:900;border:1px solid rgba(88,86,224,.28);border-radius:8px;background:var(--color-brand-soft)}
</style>
