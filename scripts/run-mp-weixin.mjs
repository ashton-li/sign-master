import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const action = process.argv[2] || 'build'
const mode = process.argv[3] || (action === 'dev' ? 'development' : 'production')
const manifestPath = resolve(root, 'src/manifest.json')
const originalManifest = readFileSync(manifestPath, 'utf8')

function readEnvFile(fileName) {
  try {
    return Object.fromEntries(
      readFileSync(resolve(root, fileName), 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const separator = line.indexOf('=')
          return [line.slice(0, separator), line.slice(separator + 1)]
        })
    )
  } catch {
    return {}
  }
}

const environment = {
  ...readEnvFile('.env'),
  ...readEnvFile(`.env.${mode}`),
  ...readEnvFile('.env.local'),
  ...readEnvFile(`.env.${mode}.local`),
  ...process.env
}
const appid = environment.VITE_MP_WEIXIN_APPID
if (!appid || !/^wx[a-zA-Z0-9_-]{6,}$/.test(appid)) {
  throw new Error('VITE_MP_WEIXIN_APPID is required before building mp-weixin')
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd:root,
    env:environment,
    stdio:'inherit',
    shell:process.platform === 'win32'
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status}`)
}

try {
  const manifest = JSON.parse(originalManifest)
  manifest['mp-weixin'] = { ...(manifest['mp-weixin'] || {}), appid }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  console.log(`temporarily injected mp-weixin appid for ${mode}`)

  const uni = resolve(root, 'node_modules/.bin', process.platform === 'win32' ? 'uni.cmd' : 'uni')
  const args = action === 'dev'
    ? ['-p', 'mp-weixin', '--mode', mode]
    : ['build', '-p', 'mp-weixin', '--mode', mode]
  run(uni, args)
  if (action !== 'dev') run(process.execPath, [resolve(root, 'scripts/prepare-mp-weixin-dist.mjs')])
} finally {
  writeFileSync(manifestPath, originalManifest, 'utf8')
  console.log('restored src/manifest.json placeholder')
}
