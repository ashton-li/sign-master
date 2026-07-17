import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const mode = process.argv[2] || process.env.NODE_ENV || 'production'
const root = process.cwd()
const manifestPath = resolve(root, 'src/manifest.json')

function readEnvFile(fileName) {
  try {
    const content = readFileSync(resolve(root, fileName), 'utf8')
    return Object.fromEntries(
      content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const index = line.indexOf('=')
          return [line.slice(0, index), line.slice(index + 1)]
        })
    )
  } catch {
    return {}
  }
}

const env = {
  ...readEnvFile('.env'),
  ...readEnvFile(`.env.${mode}`),
  ...process.env
}

const appid = env.VITE_MP_WEIXIN_APPID

if (!appid) {
  throw new Error('VITE_MP_WEIXIN_APPID is required before building mp-weixin')
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
manifest['mp-weixin'] = {
  ...(manifest['mp-weixin'] || {}),
  appid
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`synced mp-weixin appid for ${mode}`)
