<template>
  <PageShell :tab="false">
    <view class="about-page">
      <AppLogo />
      <text class="brand-name">签字大师</text>
      <text class="brand-version">signMaster {{ version }}</text>

      <view class="about-section">
        <text class="section-title">产品说明</text>
        <text class="section-body">签字大师用于在微信小程序内选取文件、扫描纸质文稿、手写签字、调整位置并导出文件。</text>
      </view>
      <view class="about-section">
        <text class="section-title">数据边界</text>
        <text class="section-body">文件和签字在当前设备的微信小程序沙箱中处理，不上传至业务服务器。清理小程序数据或卸载前，请先在“备份与恢复”中导出加密备份。</text>
      </view>
      <view class="about-section notice">
        <text class="section-title">使用提示</text>
        <text class="section-body">签字鉴别与文件防伪结果是本机技术参考，不代替实名身份认证、司法鉴定或对具体文件法律效力的判断。</text>
      </view>
      <view class="about-section support-section">
        <text class="section-title">联系与支持</text>
        <text class="section-body">请附上问题截图、复现步骤、手机型号和微信版本，便于快速定位。</text>
        <button class="email-button" @click="handleCopyEmail"><SvgIcon name="mail" :size="18" /><text>{{ contactEmail }}</text><text>复制</text></button>
        <image class="support-code" src="/static/support-qrcode.jpg" mode="aspectFit" show-menu-by-longpress />
        <text class="code-tip">使用微信扫一扫或长按识别二维码，关注公众号后发送反馈与支持需求。</text>
      </view>
      <button class="support-link" @click="handleSupport">帮助与反馈</button>
      <view class="about-meta"><text>版本 {{ version }}</text><text>本地处理 · 加密备份 · 离线签字</text></view>
      <FilingFooter />
    </view>
  </PageShell>
</template>

<script setup>
import AppLogo from '../../components/AppLogo.vue'
import FilingFooter from '../../components/FilingFooter.vue'
import PageShell from '../../components/PageShell.vue'
import SvgIcon from '../../components/SvgIcon.vue'

const version = import.meta.env.VITE_APP_VERSION || '1.0.0'
const contactEmail = import.meta.env.VITE_CONTACT_EMAIL || 'amoyhome2026@163.com'
function handleSupport() { uni.navigateTo({ url:'/subpackages/settings/help' }) }
function handleCopyEmail() { uni.setClipboardData({ data:contactEmail, success:() => uni.showToast({ title:'邮箱已复制', icon:'success' }) }) }
</script>

<style scoped>
.about-page{display:flex;min-height:100%;box-sizing:border-box;align-items:center;flex-direction:column;padding:30px 20px calc(54px + env(safe-area-inset-bottom));background:var(--color-bg);text-align:center}.brand-name{display:block;margin-top:16px;color:var(--color-ink);font-size:25px;font-weight:900}.brand-version{display:block;margin-top:4px;color:var(--color-tertiary);font-size:11px}.about-section{width:100%;box-sizing:border-box;margin-top:18px;padding:17px;text-align:left;border:1px solid var(--color-quaternary);border-radius:8px;background:var(--color-surface)}.about-section.notice{border-left:4px solid #d7922b}.section-title{display:block;color:var(--color-ink);font-size:14px;font-weight:900}.section-body{display:block;margin-top:8px;color:var(--color-muted);font-size:11px;line-height:20px}.support-section{display:flex;align-items:center;flex-direction:column}.support-section .section-title,.support-section .section-body{align-self:stretch}.email-button{display:grid;width:100%;height:46px;grid-template-columns:24px 1fr 36px;align-items:center;margin-top:12px;padding:0 12px;color:var(--color-ink);font-size:11px;border:1px solid var(--color-quaternary);border-radius:8px;background:var(--color-elevated);text-align:left}.email-button text:last-child{color:var(--color-brand);font-weight:900;text-align:right}.support-code{width:184px;height:184px;margin-top:16px;border-radius:6px}.code-tip{display:block;margin-top:9px;color:var(--color-muted);font-size:10px;line-height:17px;text-align:center}.support-link{display:flex;width:100%;height:46px;align-items:center;justify-content:center;margin-top:18px;color:#fff;font-size:13px;font-weight:900;border-radius:8px;background:var(--color-brand)}.about-meta{display:flex;margin-top:22px;flex-direction:column;gap:6px;color:var(--color-tertiary);font-size:10px}
</style>
