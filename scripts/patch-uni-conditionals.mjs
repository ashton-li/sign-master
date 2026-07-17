import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const roots = [
  'node_modules/pdf-lib',
  'node_modules/@pdf-lib',
  'node_modules/pako'
]

function visit(path) {
  if (!existsSync(path)) return
  if (statSync(path).isDirectory()) {
    readdirSync(path).forEach((entry) => visit(join(path, entry)))
    return
  }
  if (!/\.(js|mjs|cjs)$/.test(path)) return
  const source = readFileSync(path, 'utf8')
  const patched = source.replaceAll('/*#ifdef', '/* uni-c-ifdef').replaceAll('/*#ifndef', '/* uni-c-ifndef').replaceAll('#endif*/', 'uni-c-endif */')
  if (patched !== source) writeFileSync(path, patched)
}

roots.forEach(visit)
