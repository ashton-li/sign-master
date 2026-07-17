import { afterEach, describe, expect, it, vi } from 'vitest'
import { BACKUP_FORMAT, BACKUP_VERSION, buildBackupPayload, createCompleteBackupOnce, restoreBackupPayload, restoreCompleteBackup, timestampName, validateBackupPayload } from '../../src/core/storage/backup'
import { decryptBackupPayload, encryptBackupPayload, ENCRYPTED_BACKUP_FORMAT } from '../../src/core/storage/backupCrypto'
import { readLocal, writeLocal } from '../../src/core/storage/localRepository'

afterEach(() => {
  delete globalThis.uni
  delete globalThis.wx
})

describe('complete local backup', () => {
  it('embeds managed files once and rewrites every restored path', () => {
    const source = {
      repository: {
        signatures: [{ id: 'signature-1', snapshot: { pngPath: '/user/sign-master/signatures/signature.png' } }],
        templates: [{ id: 'template-1', thumbnail: '/user/sign-master/documents/form.jpg', embeddedSignatures: [{ snapshot: { pngPath: '/user/sign-master/signatures/signature.png' } }] }]
      }
    }
    const binary = new Map([
      ['/user/sign-master/signatures/signature.png', 'c2lnbmF0dXJl'],
      ['/user/sign-master/documents/form.jpg', 'ZG9jdW1lbnQ=']
    ])
    const payload = buildBackupPayload(source, { userDataPath: '/user', readFile: (path) => binary.get(path), createdAt: 1 })

    expect(payload.format).toBe(BACKUP_FORMAT)
    expect(payload.version).toBe(BACKUP_VERSION)
    expect(payload.files).toHaveLength(2)
    expect(payload.data.repository.signatures[0].snapshot.pngPath).toBe('signmaster-file://file-1')
    expect(payload.data.repository.templates[0].embeddedSignatures[0].snapshot.pngPath).toBe('signmaster-file://file-1')

    const restored = restoreBackupPayload(payload, { writeFile: (file) => `/restored/${file.id}.${file.extension}` })
    expect(restored.repository.signatures[0].snapshot.pngPath).toBe('/restored/file-1.png')
    expect(restored.repository.templates[0].thumbnail).toBe('/restored/file-2.jpg')
  })

  it('rejects invalid payloads and emits file names without extra dots', () => {
    expect(() => validateBackupPayload({ format: 'other', version: 1 })).toThrow('不是签字大师备份文件')
    expect(timestampName(new Date(2026, 6, 13, 9, 8, 7))).toBe('20260713-090807')
  })

  it('encrypts backup content and rejects a wrong password or tampering', () => {
    const payload = { format: BACKUP_FORMAT, version: BACKUP_VERSION, data: { secretName: '家长签字', userId: 'private-user-id' }, files: [] }
    const encrypted = encryptBackupPayload(payload, 'correct-password', { salt: '00112233445566778899aabbccddeeff', iv: 'ffeeddccbbaa99887766554433221100', iterations: 10000 })
    const serialized = JSON.stringify(encrypted)

    expect(encrypted.format).toBe(ENCRYPTED_BACKUP_FORMAT)
    expect(encrypted.crypto.compression).toBe('gzip')
    expect(serialized).not.toContain('家长签字')
    expect(serialized).not.toContain('private-user-id')
    expect(decryptBackupPayload(encrypted, 'correct-password')).toEqual(payload)
    expect(() => decryptBackupPayload(encrypted, 'wrong-password')).toThrow('密码错误或文件已被篡改')
    expect(() => decryptBackupPayload({ ...encrypted, ciphertext: `${encrypted.ciphertext.slice(0, -2)}AA` }, 'correct-password')).toThrow('密码错误或文件已被篡改')
  })

  it('encrypts without a user password and lets signMaster restore it directly', () => {
    const payload = { format: BACKUP_FORMAT, version: BACKUP_VERSION, data: { documentName: '保密回执.pdf' }, files: [] }
    const encrypted = encryptBackupPayload(payload, '', { salt: '102132435465768798a9bacbdcedfe0f', iv: '0ffedccbb9a897867564534231201000', iterations: 10000 })

    expect(encrypted.crypto.keyMode).toBe('application')
    expect(JSON.stringify(encrypted)).not.toContain('保密回执')
    expect(decryptBackupPayload(encrypted, '')).toEqual(payload)
  })

  it('compresses repetitive metadata before encryption', () => {
    const payload = { format: BACKUP_FORMAT, version: BACKUP_VERSION, data: { values: Array.from({ length: 500 }, () => '重复的本机签字资料') }, files: [] }
    const encrypted = encryptBackupPayload(payload, '', { salt: '102132435465768798a9bacbdcedfe0f', iv: '0ffedccbb9a897867564534231201000', iterations: 10000 })

    expect(JSON.stringify(encrypted).length).toBeLessThan(JSON.stringify(payload).length / 2)
    expect(decryptBackupPayload(encrypted, '')).toEqual(payload)
  })

  it('restores metadata and binaries after the whole mini-program sandbox is cleared', async () => {
    const storage = new Map()
    const files = new Map()
    const directories = new Set()
    const fs = {
      accessSync: (path) => { if (!directories.has(path) && !files.has(path)) throw new Error('missing') },
      mkdirSync: (path) => directories.add(path),
      writeFileSync: (path, value, encoding) => files.set(path, encoding === 'base64' ? Buffer.from(value, 'base64') : String(value)),
      readFileSync: (path, encoding) => {
        if (!files.has(path)) throw new Error('missing')
        const value = files.get(path)
        if (encoding === 'base64') return Buffer.isBuffer(value) ? value.toString('base64') : Buffer.from(value).toString('base64')
        return Buffer.isBuffer(value) ? value.toString(encoding || 'utf8') : value
      },
      renameSync: (source, target) => { files.set(target, files.get(source)); files.delete(source) },
      unlinkSync: (path) => files.delete(path)
    }
    globalThis.uni = {
      getStorageSync: vi.fn((key) => storage.get(key) ?? ''),
      setStorageSync: vi.fn((key, value) => storage.set(key, value)),
      removeStorageSync: vi.fn((key) => storage.delete(key))
    }
    globalThis.wx = { env: { USER_DATA_PATH: '/user' }, getFileSystemManager: () => fs }
    directories.add('/user/sign-master/signatures')
    files.set('/user/sign-master/signatures/main.png', Buffer.from('signed-binary'))
    writeLocal('signatures', [{ id: 'signature-1', snapshot: { pngPath: '/user/sign-master/signatures/main.png' } }])

    const firstTask = createCompleteBackupOnce('backup-password')
    const duplicateTask = createCompleteBackupOnce('backup-password')
    expect(duplicateTask).toBe(firstTask)
    const backup = await firstTask
    expect(backup.fileName).toBe('signMaster-backup.signmaster')
    const externalBackup = fs.readFileSync(backup.filePath, 'utf8')
    expect(externalBackup).not.toContain('signature-1')
    expect(externalBackup).not.toContain('signed-binary')
    files.clear(); directories.clear(); storage.clear()
    files.set('/external/backup.signmaster', externalBackup)

    expect(() => restoreCompleteBackup('/external/backup.signmaster', 'incorrect-password')).toThrow('密码错误或文件已被篡改')
    expect(restoreCompleteBackup('/external/backup.signmaster', 'backup-password').fileCount).toBe(1)
    const restored = readLocal('signatures', [])
    expect(restored[0].snapshot.pngPath).toMatch(/^\/user\/sign-master\/restored\/file-1\.png$/)
    expect(fs.readFileSync(restored[0].snapshot.pngPath, 'utf8')).toBe('signed-binary')
  })
})
