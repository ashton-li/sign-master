import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const output = resolve(process.cwd(), 'dist/build/mp-weixin')
const targetFunctions = resolve(output, 'cloudfunctions')
const projectConfigPath = resolve(output, 'project.config.json')

if (!existsSync(projectConfigPath)) throw new Error('mp-weixin project.config.json was not generated')
if (existsSync(targetFunctions)) rmSync(targetFunctions, { recursive: true, force: true })

const projectConfig = JSON.parse(readFileSync(projectConfigPath, 'utf8'))
delete projectConfig.cloudfunctionRoot
writeFileSync(projectConfigPath, `${JSON.stringify(projectConfig, null, 2)}\n`, 'utf8')
console.log('prepared mp-weixin project config without cloud functions')
