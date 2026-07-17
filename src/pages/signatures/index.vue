<template>
  <PageShell active="signatures">
    <view class="ref-title-row signature-heading"><text class="ref-page-title">我的签名</text><text class="count-inline">{{ signaturesStore.signatures.length }} 个</text></view>
    <view class="signature-grid">
      <view v-for="signature in signaturesStore.signatures" :key="signature.id" :class="['signature-card','soft-card',{ active: signature.isDefault }]" @touchstart="handleTouchStart(signature)" @touchend="handleTouchEnd" @touchcancel="handleTouchEnd">
        <button class="remove-signature" @click.stop="handleDelete(signature)"><SvgIcon name="minus" :size="17" color="#ffffff" /></button>
        <view v-if="signature.isDefault" class="default-badge">默认</view>
        <button class="signature-preview" @click.stop="handlePreview(signature)">
          <image v-if="signature.snapshot?.pngPath" class="signature-image" :src="signature.snapshot.pngPath" mode="aspectFit" />
          <SignatureInk v-else :canvas-id="`library-${signature.id}`" :snapshot="signature.snapshot" :width="142" :height="76" />
          <text class="preview-label">点击预览</text>
        </button>
        <button class="signature-name-button" @click.stop="handleSignature(signature)"><text class="signature-name">{{ signature.name || signature.label || '未命名签名' }}</text><text class="signature-hint">点击管理 · 长按删除</text></button>
      </view>
      <button class="signature-card add soft-card" @click="handleAdd"><view class="add-circle"><SvgIcon name="plus" :size="30" color="#5856e0" /></view><text>添加签名</text><text class="signature-hint">创建新的手写签名</text></button>
    </view>
    <view class="library-tip"><text>{{ signaturesStore.signatures.length ? '签名和名称保存在本机，重新打开仍可使用' : '点击“添加签名”创建第一个签名' }}</text></view>
    <template #overlay>
      <view v-if="previewing" class="preview-mask">
        <view class="preview-dialog">
          <view class="preview-head"><text>{{ previewing.name || previewing.label || '签名预览' }}</text><button class="preview-share" :disabled="shareBusy" aria-label="分享签名图片" @click.stop="handleShareSignature"><SvgIcon name="share" :size="20" color="#5856e0" /></button></view>
          <view class="large-preview"><image v-if="previewing.snapshot?.pngPath" :src="previewing.snapshot.pngPath" mode="aspectFit" /><SignatureInk v-else ref="largeSignatureInk" canvas-id="library-signature-large" :snapshot="previewing.snapshot" :width="300" :height="150" /></view>
          <button class="preview-close" @click="previewing = null">关闭预览</button>
        </view>
      </view>
    </template>
  </PageShell>
</template>

<script setup>
import { ref } from 'vue'
import { onShareAppMessage, onShareTimeline, onShow } from '@dcloudio/uni-app'
import PageShell from '../../components/PageShell.vue'
import SignatureInk from '../../components/SignatureInk.vue'
import SvgIcon from '../../components/SvgIcon.vue'
import { useMiniProgramShare } from '../../composables/useMiniProgramShare'
import { syncCustomTabBar } from '../../core/navigation/customTabBar'
import { useSignaturesStore } from '../../stores/signatures'

const signaturesStore = useSignaturesStore()
const miniProgramShare = useMiniProgramShare('signatures')
const suppressedSignatureId = ref('')
const previewing = ref(null)
const largeSignatureInk = ref(null)
const shareBusy = ref(false)
let longPressTimer = null

onShareAppMessage(miniProgramShare.friendShare)
onShareTimeline(miniProgramShare.timelineShare)

onShow(() => syncCustomTabBar(2))

function handleAdd() { uni.navigateTo({ url: '/pages/sign/draw?mode=library' }) }
function handlePreview(signature) { if (suppressedSignatureId.value !== signature.id) previewing.value = signature }

async function handleShareSignature() {
  if (shareBusy.value || !previewing.value) return
  // #ifdef MP-WEIXIN
  if (typeof wx === 'undefined' || typeof wx.showShareImageMenu !== 'function') {
    uni.showModal({ title:'当前微信版本不支持', content:'请升级微信后再分享签名图片。', showCancel:false })
    return
  }
  shareBusy.value = true
  try {
    const path = previewing.value.snapshot?.pngPath || await largeSignatureInk.value?.exportImage?.()
    if (!path) throw new Error('无法生成签名图片')
    wx.showShareImageMenu({
      path,
      fail:(error) => {
        const message = String(error?.errMsg || error?.message || '')
        if (!/cancel/i.test(message)) uni.showToast({ title:'分享失败，请稍后重试', icon:'none' })
      }
    })
  } catch (error) {
    uni.showModal({ title:'分享失败', content:error?.errMsg || error?.message || '无法生成签名图片', showCancel:false })
  } finally {
    shareBusy.value = false
  }
  // #endif
  // #ifndef MP-WEIXIN
  uni.showToast({ title:'请在微信小程序中分享', icon:'none' })
  // #endif
}

function handleSignature(signature) {
  if (suppressedSignatureId.value === signature.id) return
  uni.showActionSheet({
    itemList: [signature.isDefault ? '当前已是默认签名' : '设为默认签名', '修改名称'],
    success: ({ tapIndex }) => {
      if (tapIndex === 0 && !signature.isDefault) signaturesStore.setDefault(signature.id)
      if (tapIndex === 1) handleRename(signature)
    }
  })
}

function handleTouchStart(signature) {
  handleTouchEnd()
  longPressTimer = setTimeout(() => {
    longPressTimer = null
    suppressedSignatureId.value = signature.id
    handleDelete(signature)
    setTimeout(() => {
      if (suppressedSignatureId.value === signature.id) suppressedSignatureId.value = ''
    }, 800)
  }, 550)
}

function handleTouchEnd() {
  if (longPressTimer) clearTimeout(longPressTimer)
  longPressTimer = null
}

function handleRename(signature) {
  uni.showModal({
    title: '修改签名名称',
    editable: true,
    content: signature.name || signature.label || '',
    placeholderText: '例如：工作签名',
    success: ({ confirm, content }) => { if (confirm) signaturesStore.renameSignature(signature.id, content) }
  })
}

function handleDelete(signature) {
  uni.showModal({ title: '删除签名', content: `确认删除“${signature.name || signature.label || '该签名'}”？删除后无法恢复。`, confirmColor: '#e74c5e', success: ({ confirm }) => { if (confirm) signaturesStore.removeSignature(signature.id) } })
}
</script>

<style scoped>
.signature-heading{justify-content:flex-start;gap:10px;margin:4px 104px 14px 0}.count-inline{padding:4px 9px;color:var(--color-brand);font-size:10px;font-weight:900;border-radius:999px;background:var(--color-brand-soft)}.signature-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.signature-card{position:relative;display:flex;width:100%;min-height:166px;flex-direction:column;align-items:center;justify-content:center;padding:14px 10px 10px;overflow:visible}.signature-card.active{border-color:var(--color-brand);box-shadow:0 8px 24px rgba(88,86,224,.15)}.remove-signature{position:absolute;right:-7px;top:-7px;z-index:5;display:flex;align-items:center;justify-content:center;width:28px;height:28px;border:3px solid var(--color-bg);border-radius:50%;background:#e74c5e;box-shadow:0 3px 9px rgba(231,76,94,.28)}.default-badge{position:absolute;left:9px;top:9px;z-index:3;padding:3px 7px;color:#fff;font-size:8px;font-weight:900;border-radius:999px;background:var(--color-brand)}.signature-preview{position:relative;display:flex;width:100%;height:88px;align-items:center;justify-content:center;padding:0;overflow:hidden;border-radius:8px;background:#fafbfe}.signature-image{width:92%;height:78px}.preview-label{position:absolute;right:5px;bottom:4px;padding:2px 5px;color:#fff;font-size:7px;line-height:12px;border-radius:4px;background:rgba(28,30,42,.55)}.signature-name-button{display:flex;width:100%;min-width:0;height:48px;flex-direction:column;align-items:center;justify-content:center;padding:0 4px}.signature-name{display:block;max-width:100%;overflow:hidden;color:var(--color-ink);font-size:13px;font-weight:900;line-height:18px;text-overflow:ellipsis;white-space:nowrap}.signature-hint{margin-top:3px;color:var(--color-tertiary);font-size:8px;line-height:12px}.signature-card.add{gap:7px;color:var(--color-ink);font-size:13px;font-weight:900;border:2px dashed rgba(88,86,224,.28);box-shadow:none}.add-circle{display:flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:50%;background:var(--color-brand-soft)}.library-tip{margin-top:16px;color:var(--color-tertiary);font-size:10px;line-height:16px;text-align:center}.preview-mask{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(20,22,34,.48)}.preview-dialog{width:100%;max-width:360px;padding:14px;border-radius:10px;background:#fff;box-shadow:0 20px 52px rgba(18,20,34,.28)}.preview-head{display:flex;height:36px;align-items:center;justify-content:center;color:var(--color-ink);font-size:15px;font-weight:900;text-align:center}.large-preview{display:flex;height:180px;align-items:center;justify-content:center;margin-top:8px;overflow:hidden;border:1px solid #e2e4ec;border-radius:8px;background:#fafbfe}.large-preview image{width:94%;height:160px}.preview-close{display:flex;width:100%;height:48px;align-items:center;justify-content:center;margin-top:12px;padding:0;color:#fff;font-size:15px;font-weight:900;line-height:normal;text-align:center;border-radius:8px;background:#3e4658}
.preview-head{position:relative;height:42px;padding:0 46px;color:#171923}.preview-share{position:absolute;right:0;top:0;display:flex;width:42px;height:42px;align-items:center;justify-content:center;padding:0;border:1px solid #dedff5;border-radius:50%;background:#f3f3ff}.preview-share[disabled]{opacity:.45}
</style>
