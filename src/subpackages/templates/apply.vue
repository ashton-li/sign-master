<template>
  <PageShell :tab="false" compact>
    <view v-if="template" class="apply-body">
      <view class="template-summary soft-card">
        <TemplateCard :template="template" />
        <view class="summary-copy"><text>{{ template.name }}</text><text>{{ templatePositions.length }} 个签字位</text></view>
      </view>

      <view class="section-head"><text>目标文档</text></view>
      <button class="document-picker soft-card" :disabled="importing" @click="handlePickDocument">
        <SvgIcon :name="signingStore.document ? (signingStore.document.kind === 'image' ? 'image' : 'file') : 'upload'" :size="25" />
        <view><text>{{ importing ? '正在载入文件…' : signingStore.document?.name || '选择要应用模板的文件' }}</text><text>{{ signingStore.document ? '已载入，点击可重新选择' : '支持拍摄、相册、微信文件和扫描' }}</text></view><text>›</text>
      </button>

      <view class="section-head"><text>分配签名素材</text><text>{{ assignedCount }}/{{ templatePositions.length }}</text></view>
      <view class="assignment-list soft-card">
        <button v-for="slot in templatePositions" :key="slot.id" class="assignment-row" @click="handleChooseSignature(slot)">
          <view class="slot-index">{{ slotIndex(slot) }}</view>
          <view class="slot-copy"><text>{{ slot.label }}</text><text>{{ signatureLabel(assignments[slot.id]) }}</text></view>
          <SignatureInk v-if="signatureById(assignments[slot.id])" :canvas-id="`assign-${slot.id}`" :snapshot="signatureById(assignments[slot.id]).snapshot" :width="76" :height="34" />
          <text v-else class="choose-label">选择 ›</text>
        </button>
      </view>
      <button v-if="!availableSignatures.length" class="create-signature" @click="handleCreateSignature">＋ 先创建一个签名素材</button>
      <button class="confirm-button" :disabled="!canApply || importing" @click="handleConfirm">确认应用模板</button>
      <view v-if="importing" class="import-mask"><view class="import-card"><view class="import-spinner" /><text>正在载入文件</text><text>模板位置将直接应用，不分析签字位</text></view></view>
    </view>
  </PageShell>
</template>

<script setup>
import { computed, nextTick, reactive, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import PageShell from '../../components/PageShell.vue'
import SignatureInk from '../../components/SignatureInk.vue'
import SvgIcon from '../../components/SvgIcon.vue'
import TemplateCard from '../../components/TemplateCard.vue'
import { persistDocumentFiles, pickDocumentSource } from '../../core/file/sourcePicker'
import { useSignaturesStore } from '../../stores/signatures'
import { useSigningStore } from '../../stores/signing'
import { useTemplatesStore } from '../../stores/templates'

const templatesStore = useTemplatesStore()
const signaturesStore = useSignaturesStore()
const signingStore = useSigningStore()
const template = ref(null)
const assignments = reactive({})
const templatePositions = ref([])
const importing = ref(false)
const availableSignatures = computed(() => [
  ...((template.value?.embeddedSignatures || []).map((item) => ({ ...item, label: item.name }))),
  ...signaturesStore.signatures
])

const assignedCount = computed(() => templatePositions.value.filter((slot) => assignments[slot.id]).length)
const canApply = computed(() => Boolean(signingStore.document && template.value && assignedCount.value === templatePositions.value.length))

onLoad((query) => {
  template.value = templatesStore.getTemplate(query.id)
  if (!template.value) {
    uni.showModal({ title: '模板不存在', content: '该模板可能已被删除。', showCancel: false, complete: () => uni.navigateBack() })
    return
  }
  templatePositions.value = template.value.positions.map((slot) => ({ ...slot }))
  signingStore.resetFlow({ template: { ...template.value, positions: templatePositions.value } })
  assignDefaults()
})

onShow(() => {
  assignDefaults()
  importing.value = false
})

function assignDefaults() {
  const embedded = template.value?.embeddedSignatures || []
  templatePositions.value.forEach((slot) => {
    const bound = embedded.find((item) => item.slotId === slot.id)
    if (bound?.snapshot) assignments[slot.id] = bound.id
  })
  const fallback = signaturesStore.defaultSignature || signaturesStore.signatures[0]
  if (!template.value) return
  if (!fallback) return
  templatePositions.value.forEach((slot) => { if (!assignments[slot.id]) assignments[slot.id] = fallback.id })
}

function slotIndex(slot) { return templatePositions.value.findIndex((item) => item.id === slot.id) + 1 }
function signatureById(id) { return availableSignatures.value.find((item) => item.id === id) || null }
function signatureLabel(id) { const item = signatureById(id); return item ? (item.isDefault ? '默认签名' : item.label || '签名素材') : '未分配' }

function handleChooseSignature(slot) {
  const items = availableSignatures.value
  if (!items.length) { handleCreateSignature(); return }
  uni.showActionSheet({ itemList: items.map((item, index) => `${item.isDefault ? '默认 · ' : ''}${item.label || `签名${index + 1}`}`), success: ({ tapIndex }) => { assignments[slot.id] = items[tapIndex].id } })
}

function handleCreateSignature() { uni.navigateTo({ url: '/pages/sign/draw?mode=library' }) }

function handlePickDocument() {
  uni.showActionSheet({
    itemList: ['拍摄文件', '相册选择', '微信文件', '扫描文稿'],
    success: async ({ tapIndex }) => {
      if (tapIndex === 3) {
        uni.navigateTo({ url: '/pages/sign/scan', events: { scanComplete: handlePickedDocument } })
        return
      }
      const keys = ['camera', 'album', 'wechat']
      importing.value = true
      try {
        const selected = await pickDocumentSource(keys[tapIndex], { uniApi: uni, persist:false })
        const file = await persistDocumentFiles(selected, uni, { category:'temporary' })
        await handlePickedDocument(file)
      } catch (error) {
        const message = String(error?.errMsg || error?.message || '')
        if (!/cancel/i.test(message)) uni.showModal({ title: '导入失败', content: message, showCancel: false })
      } finally { importing.value = false }
    }
  })
}

async function handlePickedDocument(file) {
  if (!file?.path) return
  importing.value = true
  let prepared = { ...file, detectedSlots: [] }
  if (file.kind === 'image' && typeof uni.getImageInfo === 'function') {
    try {
      const info = await new Promise((resolve, reject) => uni.getImageInfo({ src: file.path, success: resolve, fail: reject }))
      prepared = { ...prepared, width: info.width, height: info.height }
    } catch {
      // The saved normalized positions remain available when local image analysis is unavailable.
    }
  }
  signingStore.setPickedFile(prepared)
  importing.value = false
  uni.showToast({ title: '文件已载入', icon: 'success' })
  const hasCompleteEmbeddedSignatures = templatePositions.value.every((slot) => signatureById(assignments[slot.id])?.snapshot)
  if (hasCompleteEmbeddedSignatures) {
    await nextTick()
    handleConfirm()
  }
}

function handleConfirm() {
  if (!canApply.value) return
  if (!signingStore.applyTemplateSignatures(assignments, availableSignatures.value)) {
    uni.showModal({ title: '无法应用', content: '请为每个签字位分配有效签名。', showCancel: false })
    return
  }
  uni.redirectTo({ url: '/pages/sign/edit' })
}
</script>

<style scoped>
.apply-body{padding:12px 0 calc(22px + env(safe-area-inset-bottom))}.template-summary{display:grid;grid-template-columns:145px 1fr;gap:14px;padding:10px}.template-summary :deep(.template-card){box-shadow:none;border:0}.summary-copy{display:flex;flex-direction:column;justify-content:center;gap:7px;color:var(--color-ink);font-size:14px;font-weight:900}.summary-copy text:last-child{color:var(--color-tertiary);font-size:10px}.section-head{display:flex;justify-content:space-between;margin:16px 2px 8px;color:var(--color-ink);font-size:13px;font-weight:900}.section-head text:last-child{color:var(--color-brand);font-size:10px}.document-picker{display:flex;align-items:center;gap:12px;width:100%;min-height:62px;padding:10px 14px;color:var(--color-brand);text-align:left}.document-picker>view{display:flex;flex:1;min-width:0;flex-direction:column;color:var(--color-ink);font-size:12px;font-weight:800}.document-picker>view text:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.document-picker>view text:last-child{margin-top:5px;color:var(--color-tertiary);font-size:9px}.assignment-list{overflow:hidden}.assignment-row{display:flex;align-items:center;gap:10px;width:100%;min-height:62px;padding:8px 12px;border-bottom:1px solid rgba(0,0,0,.06);text-align:left}.assignment-row:last-child{border-bottom:0}.slot-index{display:flex;align-items:center;justify-content:center;width:27px;height:27px;color:#fff;font-size:11px;font-weight:900;border-radius:8px;background:var(--color-brand)}.slot-copy{display:flex;flex:1;flex-direction:column;color:var(--color-ink);font-size:12px;font-weight:800}.slot-copy text:last-child{margin-top:4px;color:var(--color-tertiary);font-size:9px}.choose-label{color:var(--color-brand);font-size:10px}.create-signature{width:100%;height:40px;margin-top:10px;color:var(--color-brand);font-size:11px;font-weight:800;border:1px dashed var(--color-brand);border-radius:10px}.confirm-button{display:flex;width:100%;height:50px;align-items:center;justify-content:center;margin-top:16px;color:#fff;font-size:16px;font-weight:900;line-height:50px;text-align:center;border-radius:10px;background:var(--color-brand)}.confirm-button[disabled]{opacity:.42}.import-mask{position:fixed;inset:0;z-index:120;display:flex;align-items:center;justify-content:center;background:rgba(20,22,34,.38)}.import-card{display:flex;width:220px;min-height:142px;flex-direction:column;align-items:center;justify-content:center;padding:20px;color:var(--color-ink);font-size:14px;font-weight:900;border-radius:12px;background:#fff;box-shadow:0 18px 48px rgba(20,22,34,.2)}.import-card text:last-child{margin-top:8px;color:var(--color-tertiary);font-size:10px;font-weight:600}.import-spinner{width:30px;height:30px;margin-bottom:13px;border:3px solid #e2e4ef;border-top-color:var(--color-brand);border-radius:50%;animation:spin .75s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
</style>
