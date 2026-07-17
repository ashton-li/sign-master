<template>
  <PageShell active="templates">
    <view class="ref-title-row template-heading"><text class="ref-page-title">我的模板</text><text class="count-inline">{{ templatesStore.count }} 个</text></view>
    <view v-if="templatesStore.templates.length" class="template-grid">
      <view v-for="item in templatesStore.templates" :key="item.id" class="template-wrap" @touchstart="handleTouchStart(item)" @touchend="handleTouchEnd" @touchcancel="handleTouchEnd">
        <TemplateCard :template="item" gallery @click="handleTemplateClick(item)" />
        <button class="delete-button" @click.stop="handleDelete(item)"><SvgIcon name="minus" :size="16" color="#ffffff" /></button>
      </view>
    </view>
    <view v-else class="empty-state soft-card"><SvgIcon name="template" :size="34" /><text>暂无模板</text><text>完成一次真实签署后，可在预览页保存签字位置为模板</text></view>
  </PageShell>
</template>

<script setup>
import { ref } from 'vue'
import { onShareAppMessage, onShareTimeline, onShow } from '@dcloudio/uni-app'
import PageShell from '../../components/PageShell.vue'
import SvgIcon from '../../components/SvgIcon.vue'
import TemplateCard from '../../components/TemplateCard.vue'
import { useMiniProgramShare } from '../../composables/useMiniProgramShare'
import { syncCustomTabBar } from '../../core/navigation/customTabBar'
import { useTemplatesStore } from '../../stores/templates'
import { useSignaturesStore } from '../../stores/signatures'

const templatesStore = useTemplatesStore()
const miniProgramShare = useMiniProgramShare('templates')
const suppressedTemplateId = ref('')
let longPressTimer = null

onShareAppMessage(miniProgramShare.friendShare)
onShareTimeline(miniProgramShare.timelineShare)

onShow(() => syncCustomTabBar(1))

function handleTemplateClick(template) {
  if (suppressedTemplateId.value === template.id) return
  uni.showActionSheet({
    itemList: ['应用模板', '修改名称'],
    success: ({ tapIndex }) => {
      if (tapIndex === 0) handleApply(template)
      if (tapIndex === 1) handleRename(template)
    }
  })
}

function handleApply(template) {
  uni.navigateTo({ url: `/subpackages/templates/apply?id=${encodeURIComponent(template.id)}` })
}

function handleDelete(template) {
  const associatedIds = [...new Set((template.embeddedSignatures || []).map((item) => item.librarySignatureId).filter(Boolean))]
  if (!associatedIds.length) { confirmDelete(template, false); return }
  uni.showActionSheet({
    itemList: ['仅删除模板，保留关联签名', `删除模板和 ${associatedIds.length} 个关联签名`],
    success: ({ tapIndex }) => confirmDelete(template, tapIndex === 1)
  })
}

function confirmDelete(template, removeAssociated) {
  uni.showModal({
    title: '删除模板',
    content: removeAssociated ? `确认删除“${template.name}”及不再被其他模板使用的关联签名？` : `确认删除“${template.name}”？关联签名将保留在“我的签名”。`,
    confirmColor: '#e74c5e',
    success: ({ confirm }) => {
      if (!confirm) return
      const associatedIds = new Set((template.embeddedSignatures || []).map((item) => item.librarySignatureId).filter(Boolean))
      templatesStore.removeTemplate(template.id)
      if (!removeAssociated) return
      const signaturesStore = useSignaturesStore()
      const usedByOtherTemplates = new Set(templatesStore.templates.flatMap((item) => (item.embeddedSignatures || []).map((signature) => signature.librarySignatureId).filter(Boolean)))
      associatedIds.forEach((id) => { if (!usedByOtherTemplates.has(id)) signaturesStore.removeSignature(id) })
    }
  })
}

function handleLongPress(template) {
  suppressedTemplateId.value = template.id
  handleDelete(template)
  setTimeout(() => { if (suppressedTemplateId.value === template.id) suppressedTemplateId.value = '' }, 800)
}

function handleTouchStart(template) {
  handleTouchEnd()
  longPressTimer = setTimeout(() => {
    longPressTimer = null
    handleLongPress(template)
  }, 550)
}

function handleTouchEnd() {
  if (longPressTimer) clearTimeout(longPressTimer)
  longPressTimer = null
}

function handleRename(template) {
  uni.showModal({
    title: '修改模板名称',
    editable: true,
    content: template.name || '',
    placeholderText: '请输入模板名称',
    success: ({ confirm, content }) => { if (confirm) templatesStore.renameTemplate(template.id, content) }
  })
}
</script>

<style scoped>
.template-heading{justify-content:flex-start;gap:10px;margin:4px 104px 14px 0}.count-inline{padding:4px 9px;color:var(--color-brand);font-size:10px;font-weight:900;border-radius:999px;background:var(--color-brand-soft)}.template-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.template-wrap{position:relative;width:100%;height:184px;min-width:0;isolation:isolate;padding:0;overflow:visible}.delete-button{position:absolute;right:-6px;top:-6px;z-index:12;display:flex;width:28px;height:28px;align-items:center;justify-content:center;border:3px solid var(--color-bg);border-radius:50%;background:#e74c5e;box-shadow:0 3px 9px rgba(231,76,94,.28);pointer-events:auto}.empty-state{display:flex;height:240px;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:28px;color:var(--color-tertiary);font-size:11px;line-height:18px;text-align:center}.empty-state text:first-of-type{color:var(--color-ink);font-size:15px;font-weight:900}</style>
