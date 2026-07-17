<template>
  <PageShell :tab="false">
    <view class="verify-page">
      <view class="identity-card soft-card">
        <view class="identity-icon"><SvgIcon name="shield" :size="25" color="#ffffff" /></view>
        <view class="identity-copy"><text>当前鉴别身份</text><text>{{ identityText }}</text></view>
      </view>

      <view class="notice"><SvgIcon name="fingerprint" :size="19" /><text>鉴定先核验 signMaster 系统防伪签章和文件完整性，再判断文件内签字是否属于当前用户。结果仅供技术一致性参考。</text></view>

      <button class="upload-button" :disabled="analyzing" @click="handleChooseFile">
        <view class="upload-icon"><SvgIcon name="upload" :size="25" color="#ffffff" /></view>
        <view class="upload-copy"><text>{{ analyzing ? '正在提取并核验…' : '上传已签署文件' }}</text><text>支持微信文件中的 PDF/JPEG/PNG 及相册图片</text></view>
        <text class="upload-arrow">›</text>
      </button>

      <view v-if="pickedFile" class="file-card soft-card">
        <view class="file-type"><SvgIcon :name="pickedFile.kind === 'pdf' ? 'pdf' : 'image'" :size="22" /></view>
        <view class="file-copy"><text>{{ pickedFile.name }}</text><text>{{ pickedFile.extension.toUpperCase() }} · {{ formatBytes(pickedFile.size) }}</text></view>
        <button class="change-button" :disabled="analyzing" @click="handleChooseFile">更换</button>
      </view>

      <view v-if="report" class="report-card soft-card">
        <view class="report-head">
          <view><text>签字鉴定报告</text><text>报告编号 {{ report.reportId }}</text></view>
          <view :class="['report-seal', { passed: report.system.valid && report.user.valid }]">{{ report.system.valid && report.user.valid ? '双项通过' : '存在异常' }}</view>
        </view>

        <view class="stage-row">
          <view :class="['stage-index', { passed: report.system.valid }]">1</view>
          <view class="stage-copy"><text>signMaster 系统来源鉴定</text><text>{{ report.system.reason }}</text></view>
          <text :class="['stage-status', { passed: report.system.valid }]">{{ report.system.valid ? '通过' : '未通过' }}</text>
        </view>
        <view class="stage-divider" />
        <view class="stage-row">
          <view :class="['stage-index', { passed: report.user.valid }]">2</view>
          <view class="stage-copy"><text>当前用户签字归属鉴定</text><text>{{ report.user.reason }}</text></view>
          <text :class="['stage-status', { passed: report.user.valid }]">{{ !report.system.valid ? '不予认定' : report.user.valid ? '通过' : '未通过' }}</text>
        </view>

        <view v-if="previewPath" class="document-preview">
          <image :src="previewPath" mode="scaleToFill" />
          <view v-for="item in report.signatures" :key="item.id" class="signature-evidence-box" :class="{ passed:item.ownerValid }" :style="evidenceBoxStyle(item)"><text>{{ item.label }}</text></view>
        </view>
        <view v-else class="document-placeholder"><SvgIcon name="pdf" :size="34" /><text>PDF 防伪载荷已读取</text><text>签字证据从文件内嵌载荷提取</text></view>

        <view class="evidence-head"><text>文件中提取的签字证据</text><text>{{ report.signatures.length }} 个</text></view>
        <view v-if="report.signatures.length" class="evidence-list">
          <view v-for="(item,index) in report.signatures" :key="item.id" class="evidence-row">
            <view class="evidence-number">{{ index + 1 }}</view>
            <view class="evidence-copy"><text>{{ item.label }}</text><text>第 {{ item.page }} 页 · 位置 {{ item.bounds.x }},{{ item.bounds.y }} · {{ item.result }}</text></view>
            <SvgIcon :name="item.ownerValid ? 'check' : 'close'" :size="18" :color="item.ownerValid ? '#168253' : '#c53030'" />
          </view>
        </view>
        <view v-else class="no-evidence">{{ report.system.valid ? '系统水印可识别，但文件未保留可定位的 V2 签字载荷。' : '系统来源未通过，不从该文件认定用户签字。' }}</view>

        <view class="report-meta">
          <text>鉴定时间 {{ formatTime(report.checkedAt) }}</text>
          <text v-if="report.manifest">签发时间 {{ formatTime(report.manifest.exportedAt) }}</text>
        </view>
        <button class="copy-button" @click="handleCopyReport"><SvgIcon name="copy" :size="17" /><text>复制鉴定报告摘要</text></button>
      </view>

      <view v-if="signaturesStore.signatures.length" class="live-section">
        <view class="section-head"><text>{{ report?.user?.valid ? '增强复核：现场复签' : '独立复核：现场复签' }}</text><text>可选</text></view>
        <view v-if="selected" class="check-card soft-card">
          <view><text>来源签章</text><text :class="['check-value',{ valid:integrity.valid }]">{{ integrity.reason }}</text></view>
          <view><text>签章时间</text><text>{{ attestationTime }}</text></view>
        </view>
        <scroll-view class="signature-strip" scroll-x enable-flex>
          <button v-for="item in signaturesStore.signatures" :key="item.id" :class="['signature-option',{ active:selectedId === item.id }]" @click="handleSelect(item)">
            <image v-if="item.snapshot?.pngPath" :src="item.snapshot.pngPath" mode="aspectFit" /><SignatureInk v-else :canvas-id="`verify-${item.id}`" :snapshot="item.snapshot" :width="118" :height="58" />
            <text>{{ item.name }}</text>
          </button>
        </scroll-view>
        <view v-if="liveResult" class="live-result result-card soft-card">
          <view :class="['score-ring',{ accepted:liveResult.accepted }]">{{ liveResult.behavior.score }}</view>
          <view><text>{{ liveResult.accepted ? '现场复签与本人档案一致' : liveResult.behavior.verdict }}</text><text>形态 {{ liveResult.behavior.shapeScore }}% · 节奏 {{ liveResult.behavior.rhythmScore }}%</text></view>
        </view>
        <button class="live-button verify-button" :disabled="!selected" @click="handleLiveVerify"><SvgIcon name="fingerprint" :size="20" color="#ffffff" /><text>{{ liveResult ? '重新现场复签' : '开始现场复签' }}</text></button>
      </view>

      <canvas id="watermarkVerifyCanvas" canvas-id="watermarkVerifyCanvas" class="verify-canvas" :style="{ width:`${canvasSize.width}px`, height:`${canvasSize.height}px` }" :width="canvasSize.width" :height="canvasSize.height" />
      <view v-if="sourcePickerOpen" class="source-mask" @click="sourcePickerOpen = false">
        <view class="source-sheet" @click.stop>
          <view class="source-head"><text>选择已签署文件</text><button @click="sourcePickerOpen = false"><SvgIcon name="close" :size="20" /></button></view>
          <button class="source-option" @click="handlePickSource('wechat')"><view><SvgIcon name="chat" :size="22" /></view><text>从微信文件选择</text><text>PDF、JPEG、PNG</text></button>
          <button class="source-option" @click="handlePickSource('album')"><view><SvgIcon name="image" :size="22" /></view><text>从相册选择图片</text><text>JPEG、PNG</text></button>
        </view>
      </view>
    </view>
  </PageShell>
</template>

<script setup>
import { computed, getCurrentInstance, nextTick, reactive, ref } from 'vue'
import PageShell from '../../components/PageShell.vue'
import SignatureInk from '../../components/SignatureInk.vue'
import SvgIcon from '../../components/SvgIcon.vue'
import { pickDocumentSource } from '../../core/file/sourcePicker'
import { buildFileVerificationReport, extractFileEvidence, readFileBytes } from '../../core/security/fileEvidence'
import { getIdentity, identityLabel } from '../../core/security/identity'
import { getProvenanceRecords } from '../../core/security/provenance'
import { extractDctWatermark, systemWatermark, watermarkToken } from '../../core/security/watermark'
import { useSignaturesStore } from '../../stores/signatures'

const signaturesStore = useSignaturesStore()
const instance = getCurrentInstance()
const identity = getIdentity()
const records = ref(getProvenanceRecords())
const selectedId = ref(signaturesStore.defaultSignature?.id || signaturesStore.signatures[0]?.id || '')
const selected = computed(() => signaturesStore.signatures.find((item) => item.id === selectedId.value) || null)
const integrity = computed(() => selected.value ? signaturesStore.verifyStoredSignature(selected.value.id) : { valid:false, reason:'未选择签名' })
const attestationTime = computed(() => {
  const value = selected.value?.snapshot?.attestation?.createdAt
  return value ? formatTime(value) : '未记录'
})
const pickedFile = ref(null)
const previewPath = ref('')
const report = ref(null)
const liveResult = ref(null)
const analyzing = ref(false)
const sourcePickerOpen = ref(false)
const canvasSize = reactive({ width: 960, height: 960 })
const identityText = identityLabel(identity)

function handleChooseFile() {
  if (analyzing.value) return
  sourcePickerOpen.value = true
}

async function handlePickSource(source) {
  sourcePickerOpen.value = false
  try {
    const file = await pickDocumentSource(source, { uniApi:uni, persist:false })
    pickedFile.value = file
    previewPath.value = file.kind === 'image' ? file.path : ''
    report.value = null
    liveResult.value = null
    analyzing.value = true
    uni.showLoading({ title:'正在鉴定', mask:true })
    const bytes = await readFileBytes(file.path)
    const packet = extractFileEvidence(bytes)
    if (packet.valid) {
      report.value = buildFileVerificationReport(packet, { identity, signatures:signaturesStore.signatures })
    } else if (file.kind === 'image' && !packet.found) {
      report.value = await buildBlindWatermarkReport(file)
    } else {
      report.value = buildFileVerificationReport(packet, { identity, signatures:signaturesStore.signatures })
    }
  } catch (error) {
    const message = String(error?.errMsg || error?.message || '')
    if (!/cancel/i.test(message)) uni.showModal({ title:'鉴定失败', content:message || '文件无法读取', showCancel:false })
  } finally {
    analyzing.value = false
    uni.hideLoading()
  }
}

async function readImagePixels(path) {
  const info = await new Promise((resolve, reject) => uni.getImageInfo({ src:path, success:resolve, fail:reject }))
  const scale = Math.min(1, 1200 / Math.max(info.width, info.height))
  canvasSize.width = Math.max(1, Math.round(info.width * scale))
  canvasSize.height = Math.max(1, Math.round(info.height * scale))
  await nextTick()
  const context = uni.createCanvasContext('watermarkVerifyCanvas', instance?.proxy)
  context.drawImage(path, 0, 0, canvasSize.width, canvasSize.height)
  await new Promise((resolve) => context.draw(false, resolve))
  return new Promise((resolve, reject) => uni.canvasGetImageData({ canvasId:'watermarkVerifyCanvas', x:0, y:0, width:canvasSize.width, height:canvasSize.height, success:resolve, fail:reject }, instance?.proxy))
}

async function buildBlindWatermarkReport(file) {
  const pixels = await readImagePixels(file.path)
  const system = systemWatermark()
  const systemExtracted = extractDctWatermark(pixels.data, canvasSize.width, canvasSize.height, system.token.length, system.key, system.options)
  const knownTokens = new Set([
    ...signaturesStore.signatures.map((item) => watermarkToken(item.snapshot?.attestation)),
    ...records.value.flatMap((record) => record.signatures.map((signature) => `534d${record.ownerHash.slice(0, 16)}${signature.attestation.slice(0, 16)}`))
  ].filter(Boolean))
  const ownerExtracted = extractDctWatermark(pixels.data, canvasSize.width, canvasSize.height, 36, identity.secret)
  const systemValid = systemExtracted.token === system.token && systemExtracted.confidence >= .55
  const legacyValid = knownTokens.has(ownerExtracted.token) && ownerExtracted.confidence >= .55
  const userValid = (systemValid || legacyValid) && legacyValid
  return {
    reportId: `${Date.now().toString(36).toUpperCase()}-DCT`,
    checkedAt: Date.now(),
    system: { valid:systemValid || legacyValid, reason:systemValid ? `检测到 signMaster 系统盲水印（置信度 ${Math.round(systemExtracted.confidence * 100)}%）` : legacyValid ? `检测到 signMaster 旧版本机水印（置信度 ${Math.round(ownerExtracted.confidence * 100)}%）` : '未检测到有效的 signMaster 系统水印' },
    user: { valid:userValid, ownerMatch:userValid, reason:userValid ? `水印与当前用户签字档案匹配（置信度 ${Math.round(ownerExtracted.confidence * 100)}%）` : systemValid ? '系统来源可识别，但水印不属于当前用户' : '系统来源未通过，停止用户归属认定' },
    manifest:null,
    signatures:[]
  }
}

function evidenceBoxStyle(item) {
  const bounds = item.bounds || {}
  return { left:`${Number(bounds.x || 0) / 330 * 100}%`, top:`${Number(bounds.y || 0) / 500 * 100}%`, width:`${Number(bounds.width || 1) / 330 * 100}%`, height:`${Number(bounds.height || 1) / 500 * 100}%` }
}

function handleSelect(item) {
  selectedId.value = item.id
  liveResult.value = null
}

function handleLiveVerify() {
  if (!selected.value) return
  uni.navigateTo({
    url:'/pages/sign/draw?mode=verify',
    events:{ verificationComplete:(snapshot) => { liveResult.value = signaturesStore.verifySignature(selectedId.value, snapshot) } }
  })
}

function reportText() {
  const value = report.value
  if (!value) return ''
  const lines = [
    'signMaster 签字鉴定报告',
    `报告编号：${value.reportId}`,
    `鉴定文件：${pickedFile.value?.name || ''}`,
    `一、系统来源：${value.system.valid ? '通过' : '未通过'}；${value.system.reason}`,
    `二、用户归属：${!value.system.valid ? '不予认定' : value.user.valid ? '通过' : '未通过'}；${value.user.reason}`,
    `提取签字：${value.signatures.length} 个`,
    ...value.signatures.map((item,index) => `${index + 1}. ${item.label}，第${item.page}页，${item.result}`),
    `鉴定时间：${formatTime(value.checkedAt)}`,
    '声明：本报告为本机技术一致性结果，不构成司法鉴定或法律身份认证。'
  ]
  return lines.join('\n')
}

function handleCopyReport() {
  uni.setClipboardData({ data:reportText(), success:() => uni.showToast({ title:'报告摘要已复制', icon:'success' }) })
}

function formatTime(value) { return new Date(value).toLocaleString('zh-CN', { hour12:false }) }
function formatBytes(value) {
  const bytes = Number(value || 0)
  if (!bytes) return '大小未知'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
</script>

<style scoped>
.verify-page{padding:8px 0 calc(28px + env(safe-area-inset-bottom))}.identity-card{display:flex;align-items:center;gap:12px;padding:14px}.identity-icon{display:flex;width:44px;height:44px;align-items:center;justify-content:center;border-radius:8px;background:var(--color-brand)}.identity-copy{display:flex;min-width:0;flex-direction:column}.identity-copy text:first-child{color:var(--color-ink);font-size:14px;font-weight:900}.identity-copy text:last-child{margin-top:5px;color:var(--color-tertiary);font-size:10px}.notice{display:flex;align-items:flex-start;gap:8px;margin-top:10px;padding:11px 12px;color:#4f5567;font-size:10px;line-height:17px;border-radius:8px;background:#eef2ff}.notice text{flex:1}.upload-button{display:grid;width:100%;min-height:76px;margin-top:12px;grid-template-columns:46px 1fr 18px;align-items:center;gap:11px;padding:10px 13px;text-align:left;border-radius:8px;background:linear-gradient(135deg,#5754df,#704ee5);box-shadow:0 8px 20px rgba(88,86,224,.22)}.upload-button[disabled]{opacity:.7}.upload-icon{display:flex;width:44px;height:44px;align-items:center;justify-content:center;border-radius:8px;background:rgba(255,255,255,.15)}.upload-copy{display:flex;min-width:0;flex-direction:column}.upload-copy text:first-child{color:#fff;font-size:15px;font-weight:900;line-height:20px}.upload-copy text:last-child{margin-top:5px;color:rgba(255,255,255,.75);font-size:9px;line-height:14px}.upload-arrow{color:#fff;font-size:26px}.file-card{display:flex;align-items:center;gap:10px;margin-top:10px;padding:10px 12px}.file-type{display:flex;width:38px;height:38px;align-items:center;justify-content:center;color:var(--color-brand);border-radius:7px;background:var(--color-brand-soft)}.file-copy{display:flex;min-width:0;flex:1;flex-direction:column}.file-copy text:first-child{overflow:hidden;color:var(--color-ink);font-size:12px;font-weight:900;text-overflow:ellipsis;white-space:nowrap}.file-copy text:last-child{margin-top:5px;color:var(--color-tertiary);font-size:9px}.change-button{display:flex;width:52px;height:34px;align-items:center;justify-content:center;color:var(--color-brand);font-size:10px;font-weight:900;border:1px solid rgba(88,86,224,.25);border-radius:7px;background:#fff}.report-card{margin-top:12px;padding:14px}.report-head{display:flex;align-items:center;justify-content:space-between;padding-bottom:13px;border-bottom:1px solid #eceef3}.report-head>view:first-child{display:flex;min-width:0;flex-direction:column}.report-head>view:first-child text:first-child{color:var(--color-ink);font-size:16px;font-weight:900}.report-head>view:first-child text:last-child{margin-top:5px;color:var(--color-tertiary);font-size:8px}.report-seal{display:flex;height:30px;align-items:center;padding:0 9px;color:#b52d38;font-size:10px;font-weight:900;border:1px solid #e8aab0;border-radius:6px;background:#fff2f3}.report-seal.passed{color:#168253;border-color:#91d0ad;background:#edf9f2}.stage-row{display:grid;min-height:70px;grid-template-columns:30px 1fr auto;align-items:center;gap:10px}.stage-index{display:flex;width:28px;height:28px;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:900;border-radius:50%;background:#c94a55}.stage-index.passed{background:#1c9a61}.stage-copy{display:flex;min-width:0;flex-direction:column}.stage-copy text:first-child{color:var(--color-ink);font-size:12px;font-weight:900}.stage-copy text:last-child{margin-top:5px;color:var(--color-tertiary);font-size:9px;line-height:14px}.stage-status{color:#c53030;font-size:10px;font-weight:900}.stage-status.passed{color:#168253}.stage-divider{height:1px;margin-left:40px;background:#eceef3}.document-preview{position:relative;width:100%;height:330px;margin-top:10px;overflow:hidden;border:1px solid #dfe2eb;border-radius:7px;background:#eef0f5}.document-preview>image{width:100%;height:100%}.signature-evidence-box{position:absolute;display:flex;align-items:flex-start;justify-content:flex-start;min-width:34px;min-height:16px;border:2px solid #d44755;background:rgba(212,71,85,.08)}.signature-evidence-box.passed{border-color:#1c9a61;background:rgba(28,154,97,.09)}.signature-evidence-box text{max-width:100%;padding:2px 4px;overflow:hidden;color:#fff;font-size:8px;font-weight:900;text-overflow:ellipsis;white-space:nowrap;background:#d44755}.signature-evidence-box.passed text{background:#168253}.document-placeholder{display:flex;height:130px;flex-direction:column;align-items:center;justify-content:center;gap:6px;margin-top:10px;color:var(--color-brand);border:1px solid #dfe2eb;border-radius:7px;background:#f5f6fa}.document-placeholder text{color:var(--color-ink);font-size:11px;font-weight:900}.document-placeholder text:last-child{color:var(--color-tertiary);font-size:8px;font-weight:600}.evidence-head{display:flex;align-items:center;justify-content:space-between;margin-top:14px;color:var(--color-ink);font-size:12px;font-weight:900}.evidence-head text:last-child{color:var(--color-brand);font-size:10px}.evidence-list{margin-top:6px;border-top:1px solid #eceef3}.evidence-row{display:grid;min-height:54px;grid-template-columns:24px 1fr 20px;align-items:center;gap:8px;border-bottom:1px solid #eceef3}.evidence-number{display:flex;width:22px;height:22px;align-items:center;justify-content:center;color:var(--color-brand);font-size:9px;font-weight:900;border-radius:5px;background:var(--color-brand-soft)}.evidence-copy{display:flex;min-width:0;flex-direction:column}.evidence-copy text:first-child{color:var(--color-ink);font-size:11px;font-weight:900}.evidence-copy text:last-child{margin-top:4px;overflow:hidden;color:var(--color-tertiary);font-size:8px;text-overflow:ellipsis;white-space:nowrap}.no-evidence{margin-top:8px;padding:10px;color:var(--color-tertiary);font-size:9px;line-height:15px;border-radius:6px;background:#f4f5f8}.report-meta{display:flex;flex-direction:column;gap:4px;margin-top:11px;color:var(--color-tertiary);font-size:8px}.copy-button{display:flex;width:100%;height:40px;align-items:center;justify-content:center;gap:7px;margin-top:12px;color:var(--color-brand);font-size:11px;font-weight:900;border:1px solid rgba(88,86,224,.28);border-radius:7px;background:#fff}.live-section{margin-top:16px}.section-head{display:flex;align-items:center;justify-content:space-between;margin:0 2px 9px;color:var(--color-ink);font-size:14px;font-weight:900}.section-head text:last-child{color:#b07119;font-size:9px}.check-card{margin-bottom:9px;padding:4px 12px}.check-card>view{display:flex;min-height:38px;align-items:center;justify-content:space-between;color:var(--color-tertiary);font-size:9px;border-bottom:1px solid #eceef3}.check-card>view:last-child{border-bottom:0}.check-card>view>text:first-child{color:var(--color-ink);font-size:11px;font-weight:900}.check-value{color:#c53030;font-weight:900}.check-value.valid{color:#168253}.signature-strip{width:100%;white-space:nowrap}.signature-option{display:inline-flex;width:142px;height:108px;flex-direction:column;align-items:center;justify-content:center;margin-right:9px;padding:8px;color:var(--color-ink);font-size:10px;font-weight:900;border:1px solid #e1e3eb;border-radius:8px;background:#fff}.signature-option.active{color:var(--color-brand);border:2px solid var(--color-brand);background:var(--color-brand-soft)}.signature-option image{width:120px;height:64px}.signature-option text{display:block;max-width:120px;margin-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.live-result{display:flex;align-items:center;gap:12px;margin-top:10px;padding:12px}.score-ring{display:flex;width:54px;height:54px;align-items:center;justify-content:center;color:#c53030;font-size:18px;font-weight:900;border:5px solid #ffd9d9;border-radius:50%}.score-ring.accepted{color:#168253;border-color:#cceedd}.live-result>view:last-child{display:flex;flex-direction:column}.live-result>view:last-child text:first-child{color:var(--color-ink);font-size:12px;font-weight:900}.live-result>view:last-child text:last-child{margin-top:5px;color:var(--color-tertiary);font-size:9px}.live-button{display:flex;width:100%;height:46px;align-items:center;justify-content:center;gap:8px;margin-top:10px;color:#fff;font-size:13px;font-weight:900;border-radius:8px;background:#237c57}.source-mask{position:fixed;z-index:99;inset:0;display:flex;align-items:flex-end;padding:0 12px calc(12px + env(safe-area-inset-bottom));background:rgba(18,20,28,.45)}.source-sheet{width:100%;padding:14px;border-radius:8px;background:var(--color-card)}.source-head{display:flex;height:36px;align-items:center;justify-content:space-between;color:var(--color-ink);font-size:15px;font-weight:900}.source-head button{display:flex;width:34px;height:34px;align-items:center;justify-content:center}.source-option{display:grid;width:100%;height:58px;margin-top:8px;grid-template-columns:38px 1fr auto;align-items:center;gap:9px;padding:0 10px;text-align:left;border:1px solid var(--color-line);border-radius:7px;background:var(--color-card)}.source-option>view{display:flex;width:36px;height:36px;align-items:center;justify-content:center;border-radius:6px;background:var(--color-brand-soft)}.source-option>text:nth-child(2){color:var(--color-ink);font-size:12px;font-weight:900}.source-option>text:last-child{color:var(--color-tertiary);font-size:8px}.verify-canvas{position:fixed;left:-4000px;top:-4000px}
</style>
