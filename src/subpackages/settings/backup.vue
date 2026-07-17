<template>
  <view class="backup-page">
    <view class="status-card">
      <view class="status-icon"><SvgIcon name="archive" :size="30" color="#ffffff" /></view>
      <view class="status-copy">
        <text class="status-title">本机完整备份</text>
      <text class="status-desc">模板、签名、文件和防伪身份加密后一起打包</text>
      </view>
    </view>
    <view class="password-card">
      <text class="password-title">备份密码（可选）</text>
      <text class="password-note">不填写时仍会加密，可由签字大师直接恢复；敏感资料建议设置至少 8 位密码。</text>
      <input v-model="password" class="password-input" type="password" maxlength="64" placeholder="可选：输入至少 8 位密码" />
      <input v-if="password" v-model="passwordConfirm" class="password-input" type="password" maxlength="64" placeholder="再次输入密码（导出时校验）" />
    </view>
    <view class="notice-card">
      <text class="notice-title">为什么清理缓存后会丢失？</text>
      <text class="notice-text">微信的“清除小程序缓存/数据”会删除整个 USER_DATA_PATH 沙箱，沙箱内的 Storage、文件和数据库会同时被删除。纯前端小程序无法阻止该操作，也无法从已删除的沙箱自行恢复。</text>
      <text class="notice-text strong">清理前请生成完整备份并发送到微信聊天。清理后从聊天中选择该备份即可恢复。</text>
    </view>
    <view class="action-card">
      <button class="action-button create" :disabled="busy" @click="handleCreate"><SvgIcon name="save" :size="22" color="#ffffff" /><view><text>生成完整备份</text><text>压缩并覆盖本机唯一的 .signmaster 备份</text></view></button>
      <button class="action-button share" :disabled="busy" @click="handleShare"><SvgIcon name="share" :size="22" color="#17764b" /><view><text>发送备份到微信</text><text>{{ backup ? backup.fileName : '未生成时将先自动生成' }}</text></view></button>
      <button class="action-button restore" :disabled="busy" @click="handleRestore"><SvgIcon name="upload" :size="22" color="#7a4b13" /><view><text>从微信文件恢复</text><text>选择之前保存的 .signmaster 文件</text></view></button>
    </view>
    <view v-if="backup" class="backup-result"><text class="result-title">备份已生成</text><text class="result-value">{{ backup.fileName }}</text><text class="result-note">包含 {{ backup.fileCount }} 个本机文件，请发送到微信聊天后再清理缓存。</text></view>
    <view v-if="busy" class="loading-mask"><view class="loading-card"><view class="spinner" /><text>{{ busyText }}</text></view></view>
  </view>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import SvgIcon from '../../components/SvgIcon.vue'
import { createCompleteBackupOnce, restoreCompleteBackup } from '../../core/storage/backup'
import { validateBackupPassword } from '../../core/storage/backupCrypto'
import { resetIdentityMemory } from '../../core/security/identity'
import { useFilesStore } from '../../stores/files'
import { useSignaturesStore } from '../../stores/signatures'
import { useTemplatesStore } from '../../stores/templates'
import { useThemeStore } from '../../stores/theme'

const filesStore = useFilesStore()
const signaturesStore = useSignaturesStore()
const templatesStore = useTemplatesStore()
const themeStore = useThemeStore()
const backup = ref(null)
const busy = ref(false)
const busyText = ref('正在处理')
const password = ref('')
const passwordConfirm = ref('')
watch([password, passwordConfirm], () => { backup.value = null })
onShow(() => { busy.value = false })

function exportPassword() {
  const value = validateBackupPassword(password.value)
  if (value && value !== passwordConfirm.value) throw new Error('两次输入的备份密码不一致')
  return value
}
async function generateBackup() {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 30))
  backup.value = await createCompleteBackupOnce(exportPassword())
  return backup.value
}
async function handleCreate() {
  if (busy.value) return
  busy.value = true; busyText.value = '正在打包全部本机数据'
  try { await generateBackup(); uni.showToast({ title: '备份已生成', icon: 'success' }) }
  catch (error) { uni.showModal({ title: '生成失败', content: error?.message || '无法生成备份', showCancel: false }) }
  finally { busy.value = false }
}
function handleShare() {
  if (busy.value) return
  if (!backup.value) {
    uni.showModal({ title: '请先生成备份', content: '生成完成后再次点击发送，可确保微信将分享识别为本次点击操作。', showCancel: false })
    return
  }
  busy.value = true; busyText.value = '正在准备备份文件'
  try {
    const current = backup.value
    busy.value = false
    if (typeof wx?.shareFileMessage !== 'function') throw new Error('当前微信版本不支持文件分享')
    wx.shareFileMessage({ filePath: current.filePath, fileName: current.fileName, fail: (error) => { if (!String(error?.errMsg || '').includes('cancel')) uni.showModal({ title: '发送失败', content: error?.errMsg || '请稍后重试', showCancel: false }) } })
  } catch (error) { busy.value = false; uni.showModal({ title: '发送失败', content: error?.message || '无法发送备份', showCancel: false }) }
}
function chooseBackupFile() {
  return new Promise((resolve, reject) => uni.chooseMessageFile({ count: 1, type: 'file', extension: ['signmaster', 'json'], success: (result) => { const file = result?.tempFiles?.[0]; if (!file?.path && !file?.tempFilePath) reject(new Error('cancel')); else resolve(file.path || file.tempFilePath) }, fail: reject }))
}
async function handleRestore() {
  let filePath = ''
  try { filePath = await chooseBackupFile() }
  catch (error) { if (!String(error?.errMsg || error?.message || '').includes('cancel')) uni.showModal({ title: '选择失败', content: error?.errMsg || error?.message || '无法选择备份文件', showCancel: false }); return }
  busy.value = true; busyText.value = '正在恢复文件与数据'
  try {
    const result = restoreCompleteBackup(filePath, validateBackupPassword(password.value))
    resetIdentityMemory(); filesStore.reload(); templatesStore.reload(); signaturesStore.reload(); themeStore.setMode(result.themeMode || 'auto'); busy.value = false
    uni.showModal({ title: '恢复完成', content: `已恢复数据和 ${result.fileCount} 个文件。`, showCancel: false, success: () => uni.reLaunch({ url: '/pages/home/index' }) })
  } catch (error) { busy.value = false; uni.showModal({ title: '恢复失败', content: error?.message || '备份文件无法读取', showCancel: false }) }
}
</script>

<style scoped>
.backup-page{min-height:100vh;box-sizing:border-box;padding:18px 18px calc(28px + env(safe-area-inset-bottom));background:#f4f5f9}.status-card{display:flex;align-items:center;gap:14px;padding:18px;border-radius:8px;background:#212632;color:#fff;box-shadow:0 10px 24px rgba(33,38,50,.16)}.status-icon{display:flex;width:54px;height:54px;flex-shrink:0;align-items:center;justify-content:center;border-radius:8px;background:#5856e0}.status-copy{display:flex;min-width:0;flex-direction:column}.status-title{font-size:18px;font-weight:900}.status-desc{margin-top:5px;color:#c7cad4;font-size:11px;line-height:17px}.notice-card,.password-card,.action-card,.backup-result{margin-top:14px;padding:17px;border:1px solid rgba(24,28,38,.06);border-radius:8px;background:#fff}.notice-title{display:block;color:#b44131;font-size:14px;font-weight:900}.notice-text{display:block;margin-top:9px;color:#686d7b;font-size:11px;line-height:19px}.notice-text.strong{color:#272b36;font-weight:800}.password-title{display:block;color:#272b36;font-size:14px;font-weight:900}.password-note{display:block;margin-top:5px;color:#7b808d;font-size:10px;line-height:16px}.password-input{height:44px;margin-top:10px;padding:0 12px;color:#252a36;font-size:13px;border:1px solid #dfe2e9;border-radius:7px;background:#f8f9fb}.action-card{display:flex;flex-direction:column;gap:10px}.action-button{display:flex;width:100%;height:62px;align-items:center;justify-content:flex-start;gap:13px;padding:0 16px;border-radius:8px;text-align:left}.action-button::after{display:none}.action-button view{display:flex;min-width:0;flex-direction:column}.action-button view text:first-child{font-size:14px;font-weight:900;line-height:20px}.action-button view text:last-child{margin-top:2px;font-size:10px;line-height:15px;opacity:.72}.action-button.create{color:#fff;background:#5856e0;box-shadow:0 6px 15px rgba(88,86,224,.2)}.action-button.share{color:#17764b;border:1px solid #a9d8c1;background:#effaf4}.action-button.restore{color:#7a4b13;border:1px solid #e5c88f;background:#fff8e8}.action-button[disabled]{opacity:.55}.backup-result{border-color:#b7ddc7;background:#f1fbf5}.result-title,.result-value,.result-note{display:block}.result-title{color:#17764b;font-size:14px;font-weight:900}.result-value{margin-top:7px;overflow-wrap:anywhere;color:#2d3340;font-size:11px}.result-note{margin-top:6px;color:#687267;font-size:10px;line-height:17px}.loading-mask{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:rgba(20,23,31,.38)}.loading-card{display:flex;width:190px;height:112px;flex-direction:column;align-items:center;justify-content:center;gap:13px;color:#2d3140;font-size:12px;font-weight:800;border-radius:8px;background:#fff}.spinner{width:28px;height:28px;border:3px solid #e1e1f6;border-top-color:#5856e0;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
</style>
