<template>
  <PageShell :tab="false">
    <view class="guide soft-card">
      <text class="section-title">快速上手</text>
      <view v-for="(item,index) in guides" :key="item.title" class="guide-row">
        <text class="step-number">{{ index + 1 }}</text>
        <view><text>{{ item.title }}</text><text>{{ item.body }}</text></view>
      </view>
    </view>

    <view class="faq-list">
      <view v-for="item in faqs" :key="item.q" class="faq soft-card"><text>{{ item.q }}</text><text>{{ item.a }}</text></view>
    </view>

    <view class="support soft-card">
      <text class="section-title">联系与支持</text>
      <text class="support-copy">请附上问题截图、复现步骤、手机型号和微信版本，便于快速定位。</text>
      <button class="email-button" @click="handleCopyEmail"><SvgIcon name="mail" :size="18" /><text>{{ contactEmail }}</text><text>复制</text></button>
      <image class="support-code" src="/static/support-qrcode.jpg" mode="aspectFit" show-menu-by-longpress />
      <text class="code-tip">使用微信扫一扫或长按识别二维码，关注公众号后发送反馈与支持需求。</text>
    </view>

    <view class="feedback soft-card">
      <text class="section-title">整理反馈内容</text>
      <text class="draft-tip">此处不会自动上传。复制后通过邮箱或公众号发送。</text>
      <textarea v-model="feedback" maxlength="500" placeholder="请描述现象、操作步骤和期望结果" />
      <text class="counter">{{ feedback.length }}/500</text>
      <button class="feedback-button" :disabled="!feedback.trim()" @click="handleCopyFeedback">复制反馈内容</button>
    </view>
  </PageShell>
</template>

<script setup>
import { ref } from 'vue'
import PageShell from '../../components/PageShell.vue'
import SvgIcon from '../../components/SvgIcon.vue'

const feedback = ref('')
const contactEmail = import.meta.env.VITE_CONTACT_EMAIL || 'amoyhome2026@163.com'
const guides = [
  { title:'选择文件', body:'在“签署”中选择微信文件、相册图片、扫描文稿或最近文件。' },
  { title:'完成签字', body:'手写签字或应用已保存的签字，再调整大小、旋转和位置。' },
  { title:'导出与分享', body:'选择 JPEG、PDF 或 PNG，点击导出文件或分享好友。' }
]
const faqs = [
  { q:'如何扫描纸质文件？', a:'进入“扫描文稿”后手动拍照。拍完会立即进入预览并在后台裁切；可继续拍摄多页，长按右侧手柄调整 PDF 顺序。' },
  { q:'没有识别到签字位怎么办？', a:'可直接手写签字、手动添加位置，或在文件上长按后选择手写签字或已有签字。' },
  { q:'为什么清理小程序数据后文件不见了？', a:'文件保存在微信小程序本机沙箱。请在清理数据或卸载前通过“备份与恢复”导出加密备份。' },
  { q:'文件会上传到服务器吗？', a:'不会上传到签字大师的业务服务器。文件、签字、模板、导出和鉴别在当前设备上处理。' }
]

function copyText(data, title) {
  uni.setClipboardData({ data, success:() => uni.showToast({ title, icon:'success' }) })
}
function handleCopyEmail() { copyText(contactEmail, '邮箱已复制') }
function handleCopyFeedback() {
  const data = `签字大师反馈\n\n${feedback.value.trim()}\n\n版本：${import.meta.env.VITE_APP_VERSION || '1.0.0'}`
  copyText(data, '反馈已复制')
}
</script>

<style scoped>
.section-title{display:block;color:var(--color-ink);font-size:15px;font-weight:900}.guide{margin-top:12px;padding:16px}.guide-row{display:flex;align-items:flex-start;gap:11px;margin-top:15px}.step-number{display:flex;width:25px;height:25px;flex-shrink:0;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:900;border-radius:50%;background:var(--color-brand)}.guide-row>view{display:flex;flex-direction:column}.guide-row>view text:first-child{color:var(--color-ink);font-size:12px;font-weight:900}.guide-row>view text:last-child{margin-top:4px;color:var(--color-muted);font-size:10px;line-height:17px}.faq-list{display:flex;flex-direction:column;gap:9px;margin-top:12px}.faq{display:flex;flex-direction:column;padding:14px;color:var(--color-ink);font-size:12px;font-weight:900}.faq text:last-child{margin-top:7px;color:var(--color-muted);font-size:11px;font-weight:500;line-height:18px}.support{display:flex;align-items:center;flex-direction:column;margin-top:12px;padding:16px}.support-copy{align-self:stretch;margin-top:8px;color:var(--color-muted);font-size:10px;line-height:18px}.email-button{display:grid;width:100%;height:46px;grid-template-columns:24px 1fr 36px;align-items:center;margin-top:12px;padding:0 12px;color:var(--color-ink);font-size:11px;border:1px solid var(--color-quaternary);border-radius:8px;background:var(--color-elevated);text-align:left}.email-button text:last-child{color:var(--color-brand);font-weight:900;text-align:right}.support-code{width:184px;height:184px;margin-top:16px;border-radius:6px}.code-tip{display:block;margin-top:9px;color:var(--color-muted);font-size:10px;line-height:17px;text-align:center}.feedback{position:relative;margin:12px 0 calc(110px + env(safe-area-inset-bottom));padding:16px}.draft-tip{display:block;margin-top:6px;color:var(--color-tertiary);font-size:9px;line-height:16px}.feedback textarea{box-sizing:border-box;width:100%;height:120px;margin-top:10px;padding:10px;color:var(--color-ink);font-size:11px;border:1px solid var(--color-quaternary);border-radius:8px;background:var(--color-elevated)}.counter{position:absolute;right:25px;bottom:68px;color:var(--color-tertiary);font-size:9px}.feedback button{display:flex;width:100%;height:44px;align-items:center;justify-content:center;margin-top:10px;color:#fff;font-size:12px;font-weight:900;border-radius:8px;background:#238458}.feedback button[disabled]{opacity:.4}
</style>
