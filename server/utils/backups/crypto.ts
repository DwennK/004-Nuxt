function fromBase64(value: string) {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0))
}

function toBase64(value: Uint8Array) {
  return btoa(String.fromCharCode(...value))
}

export function isBackupKeyValid(value: string) {
  try {
    return fromBase64(value).byteLength === 32
  } catch {
    return false
  }
}

async function key(value: string) {
  return crypto.subtle.importKey('raw', fromBase64(value), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptBackupToken(value: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(secret), new TextEncoder().encode(value))
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`
}

export async function decryptBackupToken(value: string, secret: string) {
  const [version, iv, ciphertext] = value.split('.')
  if (version !== 'v1' || !iv || !ciphertext) throw new Error('Invalid encrypted token')
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, await key(secret), fromBase64(ciphertext))
  return new TextDecoder().decode(decrypted)
}
