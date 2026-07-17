<template>
  <PageShell :tab="false">
    <view class="save-page">
      <view class="save-heading">
        <view><text class="save-title">保存签名</text><text class="save-subtitle">选择要保存到“我的签名”的内容</text></view>
      </view>
      <view class="selection-bar"><text>已选择 {{ selectedCount }} / {{ candidates.length }}</text><button class="select-all" @click="handleToggleAll">{{ allSelected ? '取消全选' : '全选' }}</button></view>

      <view class="signature-grid">
        <view v-for="candidate in candidates" :key="candidate.id" :class="['signature-card', { selected: candidate.selected }]">
          <button class="check-button" :aria-label="candidate.selected ? '取消选择' : '选择签名'" @click="candidate.selected = !candidate.selected">
            <SvgIcon v-if="candidate.selected" name="check" :size="16" color="#ffffff" />
          </button>
          <button class="signature-preview" @click="previewing = candidate">
            <image v-if="candidate.snapshot.pngPath" :src="candidate.snapshot.pngPath" mode="aspectFit" />
            <SignatureInk v-else :canvas-id="`save-signature-${candidate.id}`" :snapshot="candidate.snapshot" :width="142" :height="76" />
            <text>点击预览</text>
          </button>
          <view class="name-field">
            <text>签名名称</text>
            <input v-model="candidate.name" maxlength="24" confirm-type="done" :cursor-spacing="90" placeholder="请输入签名名称" />
          </view>
          <text class="slot-name">来自 {{ candidate.slotLabel }}</text>
        </view>
      </view>

      <view class="save-footer">
        <button class="save-confirm" :disabled="!selectedCount" @click="handleSave">保存并返回</button>
      </view>
    </view>

    <template #overlay>
      <view v-if="previewing" class="preview-mask" @click.self="previewing = null">
        <view class="preview-dialog">
          <view class="preview-head"><text>{{ previewing.name || '签名预览' }}</text></view>
          <view class="large-preview">
            <image v-if="previewing.snapshot.pngPath" :src="previewing.snapshot.pngPath" mode="aspectFit" />
            <SignatureInk v-else canvas-id="save-signature-large" :snapshot="previewing.snapshot" :width="300" :height="150" />
          </view>
          <button class="preview-close" @click="previewing = null">关闭预览</button>
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
import { useSignaturesStore } from '../../stores/signatures'
import { useSigningStore } from '../../stores/signing'

const signingStore = useSigningStore()
const signaturesStore = useSignaturesStore()
const candidates = ref([])
const previewing = ref(null)
let eventChannel = null

const selectedCount = computed(() => candidates.value.filter((item) => item.selected).length)
const allSelected = computed(() => candidates.value.length > 0 && selectedCount.value === candidates.value.length)

onLoad(() => {
  const pages = getCurrentPages()
  eventChannel = pages[pages.length - 1]?.getOpenerEventChannel?.()
  const existingHighest = signaturesStore.signatures.reduce((max, item) => {
    const match = String(item.name || item.label || '').match(/(\d+)$/)
    return Math.max(max, Number(match?.[1] || 0))
  }, 0)
  const seen = new Set()
  candidates.value = signingStore.layers.reduce((items, layer, index) => {
    const snapshot = layer.snapshot
    const key = snapshot?.attestation?.signatureHash || layer.id
    if (!snapshot?.strokes?.length || seen.has(key)) return items
    seen.add(key)
    items.push({
      id: layer.id,
      snapshot,
      selected: true,
      name: `我的签名${existingHighest + items.length + 1}`,
      slotLabel: layer.label || layer.slotLabel || `签字位${index + 1}`
    })
    return items
  }, [])
  if (!candidates.value.length) {
    uni.showModal({ title: '没有可保存的签名', content: '当前文件中没有手写签名。', showCancel: false, complete: () => uni.navigateBack() })
  }
})

function handleToggleAll() {
  const next = !allSelected.value
  candidates.value.forEach((item) => { item.selected = next })
}

async function handleSave() {
  const selected = candidates.value.filter((item) => item.selected)
  if (!selected.length) return
  if (!await signaturesStore.requestCapacity(selected.length)) return
  selected.forEach((item, index) => {
    const name = item.name.trim() || `我的签名${signaturesStore.signatures.length + index + 1}`
    signaturesStore.addSignature({ snapshot: item.snapshot, color: item.snapshot.color, name, label: name })
  })
  eventChannel?.emit('signaturesSaved', { count: selected.length })
  uni.navigateBack()
}
</script>

<style scoped>
.save-page{padding:4px 0 92px}.save-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.save-heading>view{display:flex;flex-direction:column;gap:4px}.save-title{color:var(--color-ink);font-size:20px;font-weight:900}.save-subtitle{color:var(--color-tertiary);font-size:11px}.selection-bar{display:flex;height:48px;align-items:center;justify-content:space-between;margin-bottom:12px;padding:0 12px;color:var(--color-tertiary);font-size:11px;border:1px solid #e2e5ec;border-radius:8px;background:#fff}.select-all{display:flex;min-width:92px;height:34px;align-items:center;justify-content:center;padding:0 12px;color:#77510a;font-size:11px;font-weight:900;line-height:normal;text-align:center;border:1px solid #e7c36c;border-radius:7px;background:#fff8e7}.signature-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.signature-card{position:relative;min-width:0;padding:10px;border:2px solid transparent;border-radius:8px;background:#fff;box-shadow:0 6px 18px rgba(30,32,52,.07)}.signature-card.selected{border-color:var(--color-brand)}.check-button{position:absolute;right:7px;top:7px;z-index:4;display:flex;width:26px;height:26px;align-items:center;justify-content:center;border:2px solid #c9ceda;border-radius:50%;background:#fff}.signature-card.selected .check-button{border-color:var(--color-brand);background:var(--color-brand)}.signature-preview{position:relative;display:flex;width:100%;height:94px;align-items:center;justify-content:center;overflow:hidden;border-radius:6px;background:#f7f8fb}.signature-preview image{width:92%;height:76px}.signature-preview>text{position:absolute;right:5px;bottom:4px;padding:2px 5px;color:#fff;font-size:7px;border-radius:4px;background:rgba(28,30,42,.55)}.name-field{display:flex;flex-direction:column;gap:5px;margin-top:9px}.name-field>text{color:var(--color-tertiary);font-size:9px}.name-field input{height:34px;padding:0 9px;color:var(--color-ink);font-size:12px;font-weight:800;border:1px solid #dfe2eb;border-radius:6px;background:#fbfbfd}.slot-name{display:block;margin-top:6px;overflow:hidden;color:var(--color-tertiary);font-size:8px;text-overflow:ellipsis;white-space:nowrap}.save-footer{position:fixed;left:0;right:0;bottom:0;z-index:60;display:flex;height:76px;align-items:center;justify-content:center;padding:0 18px calc(env(safe-area-inset-bottom) / 2);background:rgba(255,255,255,.97);box-shadow:0 -6px 22px rgba(28,30,48,.09)}.save-footer button{display:flex;width:220px;height:48px;align-items:center;justify-content:center;padding:0;color:#fff;font-size:14px;font-weight:900;line-height:normal;text-align:center;border-radius:9px;background:#27875a;box-shadow:0 6px 16px rgba(39,135,90,.22)}.save-footer button[disabled]{opacity:.4}.preview-mask{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(20,22,34,.48)}.preview-dialog{width:100%;max-width:360px;padding:14px;border-radius:10px;background:#fff;box-shadow:0 20px 52px rgba(18,20,34,.28)}.preview-head{display:flex;height:36px;align-items:center;justify-content:center;color:var(--color-ink);font-size:15px;font-weight:900;text-align:center}.large-preview{display:flex;height:180px;align-items:center;justify-content:center;margin-top:8px;overflow:hidden;border:1px solid #e2e4ec;border-radius:8px;background:#fafbfe}.large-preview image{width:94%;height:160px}.preview-close{display:flex;width:100%;height:48px;align-items:center;justify-content:center;margin-top:12px;padding:0;color:#fff;font-size:15px;font-weight:900;line-height:normal;text-align:center;border-radius:8px;background:#3e4658}
.save-footer{z-index:60}
</style>
