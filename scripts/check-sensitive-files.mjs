import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../src/', import.meta.url))
const allowedExtensions = new Set(['.vue', '.js', '.json'])
const forbidden = [
  [/cloud\.callFunction\s*\(/, '云函数调用'],
  [/wx\.cloud\./, '微信云开发调用'],
  [/(appsecret|app_secret)\s*[:=]\s*['"][^'"]+/i, 'AppSecret 明文'],
  [/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, '私钥']
]

function files(directory) {
  return readdirSync(directory, { withFileTypes:true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? files(path) : allowedExtensions.has(extname(path)) ? [path] : []
  })
}

const errors = []
for (const path of files(root)) {
  const content = readFileSync(path, 'utf8')
  forbidden.forEach(([pattern, label]) => { if (pattern.test(content)) errors.push(`${relative(root, path)}: 发现${label}`) })
}
if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log('敏感能力与凭据检查通过')
