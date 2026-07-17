import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { secureSnapshot } from '../../src/core/security/attestation'
import { createMinimalPdf } from '../../src/core/export/exporter'
import { attachFileEvidence, buildFileVerificationReport, createFileEvidence, extractFileEvidence } from '../../src/core/security/fileEvidence'

const identity = { id:'sigpen_user_evidence', source:'local-file', secret:'evidence-secret' }

function snapshot() {
  return secureSnapshot({
    width:300,
    height:120,
    strokes:[{ color:'#111111', width:4, points:[
      { x:20, y:70, pressure:.5, t:0 },
      { x:80, y:30, pressure:.6, t:30 },
      { x:160, y:75, pressure:.55, t:70 }
    ] }]
  }, identity)
}

function evidence(format) {
  return createFileEvidence({
    documentId:'document-1',
    fileName:`signed.${format}`,
    format,
    layers:[{ id:'layer-1', label:'家长签字', page:1, x:160, y:430, width:105, height:42, snapshot:snapshot() }]
  }, identity)
}

describe('signMaster file evidence', () => {
  it('embeds and verifies a PDF manifest before checking user ownership', () => {
    const source = new TextEncoder().encode(createMinimalPdf({ title:'signed form' }))
    const stamped = attachFileEvidence(source, evidence('pdf'))
    const packet = extractFileEvidence(stamped.bytes)
    const report = buildFileVerificationReport(packet, { identity, signatures:[] })

    expect(packet).toMatchObject({ found:true, valid:true, sealValid:true, contentValid:true })
    expect(report.system.valid).toBe(true)
    expect(report.user.valid).toBe(true)
    expect(report.signatures).toHaveLength(1)
    expect(report.signatures[0]).toMatchObject({ label:'家长签字', ownerValid:true, bounds:{ x:160, y:430, width:105, height:42 } })
  })

  it('embeds valid evidence containers in JPEG and PNG files', () => {
    const jpeg = new Uint8Array(readFileSync('tests/fixtures/return-form-three-slots.jpg'))
    const png = new Uint8Array(readFileSync('tests/fixtures/return-form-three-slots.png'))
    const jpegPacket = extractFileEvidence(attachFileEvidence(jpeg, evidence('jpg')).bytes)
    const pngPacket = extractFileEvidence(attachFileEvidence(png, evidence('png')).bytes)

    expect(jpegPacket.valid).toBe(true)
    expect(jpegPacket.sourceBytes).toEqual(jpeg)
    expect(pngPacket.valid).toBe(true)
    expect(pngPacket.sourceBytes).toEqual(png)
  })

  it('rejects a copied payload when the signed file body changes', () => {
    const source = new TextEncoder().encode(createMinimalPdf({ title:'original' }))
    const stamped = attachFileEvidence(source, evidence('pdf')).bytes
    const modified = new Uint8Array(stamped)
    modified[20] ^= 1
    const packet = extractFileEvidence(modified)
    const report = buildFileVerificationReport(packet, { identity, signatures:[] })

    expect(packet).toMatchObject({ found:true, valid:false, sealValid:true, contentValid:false })
    expect(report.system.valid).toBe(false)
    expect(report.user.valid).toBe(false)
  })

  it('does not attribute a valid signMaster file to another local user', () => {
    const source = new TextEncoder().encode(createMinimalPdf({ title:'owner check' }))
    const packet = extractFileEvidence(attachFileEvidence(source, evidence('pdf')).bytes)
    const report = buildFileVerificationReport(packet, { identity:{ ...identity, id:'sigpen_user_other' }, signatures:[] })

    expect(report.system.valid).toBe(true)
    expect(report.user.valid).toBe(false)
    expect(report.user.ownerMatch).toBe(false)
  })
})
