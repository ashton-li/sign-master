<template>
  <PageShell :tab="false">
    <view class="template-save-page">
      <view class="name-panel">
        <text>模板名称</text>
        <input v-model="templateName" class="template-name-input" maxlength="32" confirm-type="done" placeholder="请输入模板名称" />
      </view>

      <view class="document-card">
        <view class="document-paper">
          <image v-if="documentPreview" class="document-image" :src="documentPreview" mode="scaleToFill" />
          <view v-else class="pdf-placeholder"><SvgIcon name="file" :size="34" /><text>{{ signingStore.document?.name }}</text></view>
          <view v-for="(slot, index) in templatePositions" :key="slot.id" :class="['slot-marker', { active: selectedSlotId === slot.id }]" :style="slotStyle(slot, index)" @click="selectedSlotId = slot.id">
            <text>{{ index + 1 }} · {{ slot.label }}</text>
          </view>
          <view v-for="layer in signingStore.layers" :key="layer.id" class="signature-layer" :style="layerStyle(layer)">
            <image v-if="layer.snapshot?.pngPath" :src="layer.snapshot.pngPath" mode="aspectFit" />
            <SignatureInk v-else :canvas-id="`template-layer-${layer.id}`" :snapshot="layer.snapshot" :width="Math.max(1, layer.width)" :height="Math.max(1, layer.height)" fluid />
          </view>
        </view>
      </view>

      <view class="position-panel">
        <view class="position-head"><text>签字位明细</text><text>{{ templatePositions.length }} 个</text></view>
        <view v-for="(slot, index) in templatePositions" :key="slot.id" :class="['position-row', { selected: selectedSlotId === slot.id }]" @click="selectedSlotId = slot.id">
          <view class="position-index" :style="indexStyle(index)">{{ index + 1 }}</view>
          <view class="position-copy"><text>{{ slot.label || `签字位${index + 1}` }}</text><text>第 {{ slot.page || 1 }} 页 · {{ Math.round(slot.x * 100) }}%, {{ Math.round(slot.y * 100) }}%</text></view>
          <button :class="['binding-status', { ready: signatureForSlot(slot.id) }]" @click.stop="handlePreviewSignature(slot)">{{ signatureForSlot(slot.id)?.name || '未填写签名' }}</button>
        </view>
      </view>

      <view class="save-footer">
        <button class="save-template-button" :disabled="!canSave" @click="handleSave">保存并返回</button>
      </view>
    </view>
    <template #overlay>
      <view v-if="previewSignature" class="signature-mask">
        <view class="signature-dialog" @click.stop>
          <text class="signature-dialog-title">模板签名</text>
          <view class="signature-large-preview">
            <image v-if="previewSignature.snapshot?.pngPath" :src="previewSignature.snapshot.pngPath" mode="aspectFit" />
            <SignatureInk v-else canvas-id="template-signature-preview" :snapshot="previewSignature.snapshot" :width="300" :height="140" />
          </view>
          <text class="signature-name-label">签名名称</text>
          <input v-model="previewSignatureName" class="signature-name-input" maxlength="24" confirm-type="done" placeholder="请输入签名名称" @click.stop />
          <view class="signature-dialog-actions"><button class="signature-dialog-cancel" @click="handleCancelSignaturePreview">取消</button><button class="signature-dialog-confirm" @click="handleConfirmSignatureName">确定</button></view>
        </view>
      </view>
    </template>
  </PageShell>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import PageShell from '../../components/PageShell.vue'
import SignatureInk from '../../components/SignatureInk.vue'
import SvgIcon from '../../components/SvgIcon.vue'
import { resolveTemplatePositions } from '../../core/templates/templatePositions'
import { useSigningStore } from '../../stores/signing'
import { useSignaturesStore } from '../../stores/signatures'
import { useTemplatesStore } from '../../stores/templates'

const signingStore = useSigningStore()
const signaturesStore = useSignaturesStore()
const templatesStore = useTemplatesStore()
const baseName = String(signingStore.document?.name || '签署文件').replace(/\.[^.]+$/, '').replace(/\.+/g, '_')
const templateName = ref(`${baseName}模板`)
const selectedSlotId = ref(signingStore.slots[0]?.id || '')
const previewSignature = ref(null)
const previewSignatureName = ref('')
const templateSignatures = ref(signingStore.layers.map((layer, index) => ({
  id: `template-signature-${layer.slotId}`,
  slotId: layer.slotId,
  name: `我的签名${index + 1}`,
  snapshot: JSON.parse(JSON.stringify(layer.snapshot))
})))
let eventChannel = null

const documentPreview = computed(() => {
  const document = signingStore.document
  const page = document?.pages?.[Math.max(0, (document.page || 1) - 1)] || document
  return page?.previewPath || (document?.kind === 'image' ? page?.path || document?.path : '')
})
const templatePositions = computed(() => resolveTemplatePositions(signingStore.slots, signingStore.layers).filter((slot) => layerForSlot(slot.id)))
const canSave = computed(() => templateName.value.trim().length > 0 && templatePositions.value.length > 0 && templatePositions.value.every((slot) => signatureForSlot(slot.id)?.snapshot))
const slotColors = ['82,70,220', '12,132,105', '221,107,32', '190,45,95', '32,111,190', '121,83,34']

onLoad(() => {
  const pages = getCurrentPages()
  eventChannel = pages[pages.length - 1]?.getOpenerEventChannel?.()
})

function layerForSlot(slotId) {
  return signingStore.layers.find((layer) => layer.slotId === slotId) || null
}

function signatureForSlot(slotId) {
  return templateSignatures.value.find((item) => item.slotId === slotId) || null
}

function handlePreviewSignature(slot) {
  selectedSlotId.value = slot.id
  previewSignature.value = signatureForSlot(slot.id)
  previewSignatureName.value = previewSignature.value?.name || ''
  if (!previewSignature.value) uni.showToast({ title: '该签字位还没有签名', icon: 'none' })
}

function handleConfirmSignatureName() {
  if (!previewSignature.value) return
  previewSignature.value.name = previewSignatureName.value.trim() || '模板签名'
  previewSignature.value = null
  previewSignatureName.value = ''
}

function handleCancelSignaturePreview() { previewSignature.value = null; previewSignatureName.value = '' }

function signatureFingerprint(snapshot) {
  return snapshot?.attestation?.signatureHash || JSON.stringify(snapshot?.strokes || [])
}

function saveAssociatedSignature(item) {
  const fingerprint = signatureFingerprint(item.snapshot)
  const existing = signaturesStore.signatures.find((signature) => signatureFingerprint(signature.snapshot) === fingerprint)
  if (existing) return existing.id
  return signaturesStore.addSignature({ name: item.name, label: item.name, snapshot: JSON.parse(JSON.stringify(item.snapshot)), source: 'template' }).id
}

function slotStyle(slot, index) {
  const color = slotColors[index % slotColors.length]
  const active = selectedSlotId.value === slot.id
  return {
    left: `${slot.x * 100}%`,
    top: `${slot.y * 100}%`,
    width: `${slot.width * 100}%`,
    height: `${slot.height * 100}%`,
    color: `rgb(${color})`,
    borderColor: `rgb(${color})`,
    background: `rgba(${color},${active ? 0.24 : 0.13})`,
    boxShadow: active ? `0 0 0 3px #ffffff,0 0 0 6px rgba(${color},.72)` : 'none'
  }
}

function indexStyle(index) {
  return { background: `rgb(${slotColors[index % slotColors.length]})` }
}

function layerStyle(layer) {
  return { left: `${layer.x / 330 * 100}%`, top: `${layer.y / 500 * 100}%`, width: `${layer.width / 330 * 100}%`, height: `${layer.height / 500 * 100}%`, opacity: layer.opacity, transform: `rotate(${layer.rotation || 0}deg)` }
}

async function handleSave() {
  if (!canSave.value) return
  const name = templateName.value.trim()
  const fingerprints = new Set(signaturesStore.signatures.map((signature) => signatureFingerprint(signature.snapshot)))
  const newSignatureCount = templateSignatures.value.reduce((count, item) => {
    const fingerprint = signatureFingerprint(item.snapshot)
    if (fingerprints.has(fingerprint)) return count
    fingerprints.add(fingerprint)
    return count + 1
  }, 0)
  if (!await templatesStore.requestCapacity()) return
  if (newSignatureCount && !await signaturesStore.requestCapacity(newSignatureCount)) return
  const embeddedSignatures = templateSignatures.value.map((item) => ({ ...JSON.parse(JSON.stringify(item)), librarySignatureId: saveAssociatedSignature(item) }))
  templatesStore.saveTemplate({
    name,
    positions: templatePositions.value,
    sourceKind: signingStore.document.kind,
    documentSize: { width: signingStore.document.width, height: signingStore.document.height },
    embeddedSignatures,
    signatureBindings: embeddedSignatures.map((item) => ({ slotId: item.slotId, name: item.name, librarySignatureId: item.librarySignatureId, signatureHash: item.snapshot?.attestation?.signatureHash || '' }))
  })
  eventChannel?.emit('templateSaved', { name, signatureCount: new Set(embeddedSignatures.map((item) => item.librarySignatureId)).size })
  uni.navigateBack()
}
</script>

<style scoped>
.template-save-page{min-height:100vh;box-sizing:border-box;margin:0 -18px;padding:14px 18px calc(94px + env(safe-area-inset-bottom));background:#f4f5f9}.name-panel{display:grid;grid-template-columns:72px minmax(0,1fr);align-items:center;padding:12px 14px;border:1px solid rgba(26,30,40,.06);border-radius:8px;background:#fff}.name-panel>text{color:#343947;font-size:12px;font-weight:900}.template-name-input{height:40px;padding:0 11px;color:#202532;font-size:13px;font-weight:800;border:1px solid #dfe2ea;border-radius:7px;background:#f8f9fb}.document-card{display:flex;height:min(48vh,430px);min-height:280px;align-items:center;justify-content:center;margin-top:12px;padding:10px;border:1px solid rgba(26,30,40,.07);border-radius:8px;background:#e9ebf1;box-shadow:0 7px 20px rgba(24,28,40,.07)}.document-paper{position:relative;height:100%;max-width:100%;aspect-ratio:330/500;overflow:hidden;background:#fff;box-shadow:0 3px 12px rgba(24,28,40,.12)}.document-image{display:block;width:100%;height:100%}.pdf-placeholder{display:flex;height:100%;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#707586;font-size:11px}.slot-marker{position:absolute;z-index:4;display:flex;box-sizing:border-box;align-items:center;justify-content:center;overflow:hidden;border:2px solid;border-radius:4px}.slot-marker text{max-width:100%;padding:2px 4px;overflow:hidden;font-size:9px;font-weight:900;line-height:12px;text-align:center;text-overflow:ellipsis;white-space:nowrap}.signature-layer{position:absolute;z-index:3;display:flex;align-items:center;justify-content:center;pointer-events:none}.signature-layer image{width:100%;height:100%}.position-panel{margin-top:12px;overflow:hidden;border:1px solid rgba(26,30,40,.06);border-radius:8px;background:#fff}.position-head{display:flex;height:44px;align-items:center;justify-content:space-between;padding:0 14px;border-bottom:1px solid #eceef3}.position-head text:first-child{color:#292e3a;font-size:13px;font-weight:900}.position-head text:last-child{color:#797e8c;font-size:10px}.position-row{display:grid;min-height:64px;grid-template-columns:32px minmax(0,1fr) auto;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid #eef0f4}.position-row:last-child{border-bottom:0}.position-row.selected{background:#f6f5ff}.position-index{display:flex;width:28px;height:28px;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:900;border-radius:6px}.position-copy{display:flex;min-width:0;flex-direction:column}.position-copy text:first-child{overflow:hidden;color:#303542;font-size:12px;font-weight:900;text-overflow:ellipsis;white-space:nowrap}.position-copy text:last-child{margin-top:4px;color:#858a98;font-size:9px}.save-footer{position:fixed;right:0;bottom:0;left:0;z-index:30;padding:10px 18px calc(12px + env(safe-area-inset-bottom));border-top:1px solid rgba(30,34,46,.07);background:rgba(255,255,255,.98)}.save-template-button{display:flex;width:100%;height:58px;align-items:center;justify-content:center;padding:0;color:#fff;font-size:15px;font-weight:900;line-height:normal;text-align:center;border-radius:8px;background:#27875a;box-shadow:0 6px 16px rgba(39,135,90,.2)}.save-template-button[disabled]{color:#9a9eaa;background:#e3e5ea;box-shadow:none}
.binding-status{display:flex;min-width:82px;max-width:112px;height:34px;align-items:center;justify-content:center;padding:0 8px;overflow:hidden;color:#9b5b1e;font-size:9px;font-weight:900;line-height:13px;text-align:center;border-radius:6px;background:#fff3df}.binding-status.ready{color:#176b43;background:#e8f8ef}.signature-mask{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(20,22,34,.48)}.signature-dialog{width:100%;max-width:360px;padding:16px;border-radius:10px;background:#fff;box-shadow:0 20px 52px rgba(18,20,34,.28)}.signature-dialog-title{display:block;color:var(--color-ink);font-size:16px;font-weight:900;text-align:center}.signature-large-preview{display:flex;height:170px;align-items:center;justify-content:center;margin-top:12px;overflow:hidden;border:1px solid #e1e4ec;border-radius:8px;background:#fafbfe}.signature-large-preview image{width:94%;height:150px}.signature-name-label{display:block;margin-top:12px;color:#596173;font-size:10px;font-weight:800}.signature-name-input{height:42px;margin-top:6px;padding:0 11px;color:var(--color-ink);font-size:13px;font-weight:800;border:1px solid #dce0e9;border-radius:7px;background:#f8f9fb}.signature-dialog-actions{display:grid;grid-template-columns:1fr 1.4fr;gap:8px;margin-top:14px}.signature-dialog-cancel,.signature-dialog-confirm{display:flex;width:100%;height:46px;align-items:center;justify-content:center;margin:0;padding:0;font-size:14px;font-weight:900;line-height:normal;text-align:center;border-radius:8px}.signature-dialog-cancel{color:#505665;border:1px solid #d7dbe5;background:#f6f7f9}.signature-dialog-confirm{color:#fff;background:#27875a}
</style>
