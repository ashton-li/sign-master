import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../src/', import.meta.url))
const forbidden = [
  ['自动拍摄', '扫描功能已改为用户手动拍照'],
  ['反馈已保存在本机', '不得用本地保存假装反馈已提交'],
  ['保存反馈', '反馈必须明确告知用户如何发送'],
  ['signpen', '品牌名统一为 signMaster'],
  ['SignPen', '品牌名统一为 signMaster']
]
const allowedExtensions = new Set(['.vue', '.js', '.json', '.scss', '.css'])

function files(directory) {
  return readdirSync(directory, { withFileTypes:true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? files(path) : allowedExtensions.has(extname(path)) ? [path] : []
  })
}

const errors = []
for (const path of files(root)) {
  const content = readFileSync(path, 'utf8')
  forbidden.forEach(([term, reason]) => {
    if (content.includes(term)) errors.push(`${relative(root, path)}: 包含“${term}”，${reason}`)
  })
}
const help = readFileSync(new URL('../src/subpackages/settings/help.vue', import.meta.url), 'utf8')
const privacy = readFileSync(new URL('../src/subpackages/settings/privacy.vue', import.meta.url), 'utf8')
if (!help.includes('VITE_CONTACT_EMAIL') || !help.includes('support-qrcode.jpg')) errors.push('帮助页缺少邮箱或公众号支持入口')
if (!privacy.includes('不上传至签字大师的业务服务器') || !privacy.includes('不构成实名身份认证')) errors.push('隐私说明缺少数据边界或鉴别声明')
if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log('文案与支持入口检查通过')
