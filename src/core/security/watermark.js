import { sha256Hex } from './hash'

const SIZE = 8
const DEFAULT_REPETITIONS = 3
const DEFAULT_STRENGTH = 18
const SYSTEM_KEY = sha256Hex('signMaster|public-blind-watermark|v2|2026-07')
const SYSTEM_TOKEN = `534d${sha256Hex('signMaster|system-origin|v2').slice(0, 32)}`
const basis = Array.from({ length: SIZE }, (_, frequency) => Array.from({ length: SIZE }, (_, position) => {
  const scale = frequency === 0 ? Math.sqrt(1 / SIZE) : Math.sqrt(2 / SIZE)
  return scale * Math.cos((Math.PI * (2 * position + 1) * frequency) / (2 * SIZE))
}))

function forwardDct(block) {
  const output = new Float64Array(64)
  for (let u = 0; u < SIZE; u += 1) {
    for (let v = 0; v < SIZE; v += 1) {
      let sum = 0
      for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) sum += basis[u][x] * basis[v][y] * block[y * SIZE + x]
      output[u * SIZE + v] = sum
    }
  }
  return output
}

function inverseDct(coefficients) {
  const output = new Float64Array(64)
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      let sum = 0
      for (let u = 0; u < SIZE; u += 1) for (let v = 0; v < SIZE; v += 1) sum += basis[u][x] * basis[v][y] * coefficients[u * SIZE + v]
      output[y * SIZE + x] = sum
    }
  }
  return output
}

function hexToBits(hex) {
  return String(hex || '').toLowerCase().replace(/[^0-9a-f]/g, '').split('').flatMap((character) => {
    const value = parseInt(character, 16)
    return [3, 2, 1, 0].map((shift) => (value >> shift) & 1)
  })
}

function bitsToHex(bits) {
  let result = ''
  for (let index = 0; index < bits.length; index += 4) result += parseInt(bits.slice(index, index + 4).join(''), 2).toString(16)
  return result
}

function createRandom(seedText) {
  let state = parseInt(sha256Hex(seedText).slice(0, 8), 16) || 0x9e3779b9
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 0x100000000
  }
}

function selectBlocks(width, height, count, key) {
  const columns = Math.floor(width / SIZE)
  const rows = Math.floor(height / SIZE)
  const candidates = []
  for (let row = 1; row < rows - 1; row += 1) for (let column = 1; column < columns - 1; column += 1) candidates.push({ x: column * SIZE, y: row * SIZE })
  const random = createRandom(key)
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    const value = candidates[index]; candidates[index] = candidates[swap]; candidates[swap] = value
  }
  return candidates.slice(0, count)
}

function readLuminance(data, width, block) {
  const values = new Float64Array(64)
  for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) {
    const offset = ((block.y + y) * width + block.x + x) * 4
    values[y * SIZE + x] = data[offset] * .299 + data[offset + 1] * .587 + data[offset + 2] * .114
  }
  return values
}

function writeLuminance(data, width, block, before, after) {
  for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) {
    const offset = ((block.y + y) * width + block.x + x) * 4
    const delta = after[y * SIZE + x] - before[y * SIZE + x]
    data[offset] = Math.max(0, Math.min(255, Math.round(data[offset] + delta)))
    data[offset + 1] = Math.max(0, Math.min(255, Math.round(data[offset + 1] + delta)))
    data[offset + 2] = Math.max(0, Math.min(255, Math.round(data[offset + 2] + delta)))
  }
}

function coefficientIndexes(options = {}) {
  const first = options.coefficients?.[0] || [3, 2]
  const second = options.coefficients?.[1] || [2, 3]
  return [first[0] * SIZE + first[1], second[0] * SIZE + second[1]]
}

function encodeBit(coefficients, bit, strength, options) {
  const [firstIndex, secondIndex] = coefficientIndexes(options)
  const first = coefficients[firstIndex]
  const second = coefficients[secondIndex]
  const target = bit ? strength : -strength
  const difference = Math.abs(first) - Math.abs(second)
  const adjustment = (target - difference) / 2
  coefficients[firstIndex] = Math.sign(first || 1) * Math.max(1, Math.abs(first) + adjustment)
  coefficients[secondIndex] = Math.sign(second || 1) * Math.max(1, Math.abs(second) - adjustment)
}

function decodeBit(coefficients, options) {
  const [firstIndex, secondIndex] = coefficientIndexes(options)
  return Math.abs(coefficients[firstIndex]) >= Math.abs(coefficients[secondIndex]) ? 1 : 0
}

export function systemWatermark() {
  return { token: SYSTEM_TOKEN, key: SYSTEM_KEY, options: { coefficients: [[4, 1], [1, 4]], repetitions: 2, strength: 16 } }
}

export function watermarkToken(attestation) {
  if (!attestation?.ownerHash || !attestation?.mac) return ''
  return `534d${attestation.ownerHash.slice(0, 16)}${attestation.mac.slice(0, 16)}`
}

export function embedDctWatermark(source, width, height, token, key, options = {}) {
  const bits = hexToBits(token)
  if (!bits.length) return { data: source, embedded: false, bitCount: 0, repetitions: 0 }
  const maximumBlocks = Math.max(0, (Math.floor(width / SIZE) - 2) * (Math.floor(height / SIZE) - 2))
  const repetitions = Math.min(options.repetitions || DEFAULT_REPETITIONS, Math.floor(maximumBlocks / bits.length))
  if (repetitions < 1) return { data: source, embedded: false, bitCount: bits.length, repetitions: 0 }
  const output = new Uint8ClampedArray(source)
  const blocks = selectBlocks(width, height, bits.length * repetitions, key)
  blocks.forEach((block, index) => {
    const before = readLuminance(output, width, block)
    const coefficients = forwardDct(before)
    encodeBit(coefficients, bits[index % bits.length], options.strength || DEFAULT_STRENGTH, options)
    writeLuminance(output, width, block, before, inverseDct(coefficients))
  })
  return { data: output, embedded: true, bitCount: bits.length, repetitions }
}

export function extractDctWatermark(source, width, height, hexLength, key, options = {}) {
  const bitCount = hexLength * 4
  const maximumBlocks = Math.max(0, (Math.floor(width / SIZE) - 2) * (Math.floor(height / SIZE) - 2))
  const repetitions = Math.min(options.repetitions || DEFAULT_REPETITIONS, Math.floor(maximumBlocks / bitCount))
  if (repetitions < 1) return { token: '', confidence: 0, repetitions: 0 }
  const blocks = selectBlocks(width, height, bitCount * repetitions, key)
  const votes = Array.from({ length: bitCount }, () => 0)
  blocks.forEach((block, index) => { votes[index % bitCount] += decodeBit(forwardDct(readLuminance(source, width, block)), options) ? 1 : -1 })
  const bits = votes.map((vote) => vote >= 0 ? 1 : 0)
  const confidence = votes.reduce((sum, vote) => sum + Math.abs(vote) / repetitions, 0) / bitCount
  return { token: bitsToHex(bits), confidence, repetitions }
}
