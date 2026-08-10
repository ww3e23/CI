import { getBlob, ref } from 'firebase/storage'
import { getFirebaseStorage } from './firebase'

export type PreparedImage = {
  blob: Blob
  file: File
  filename: string
  objectUrl: string
  kind?: string
}

function guessExt(src: string, mime?: string): string {
  if (mime?.includes('png') || src.startsWith('data:image/png') || src.includes('.png')) {
    return 'png'
  }
  if (mime?.includes('webp') || src.startsWith('data:image/webp') || src.includes('.webp')) {
    return 'webp'
  }
  return 'jpg'
}

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',')
  const header = comma >= 0 ? dataUrl.slice(0, comma) : ''
  const body = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  const mime = /data:(.*?);/.exec(header)?.[1] ?? 'image/jpeg'
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function isFirebaseStorageUrl(src: string): boolean {
  return (
    src.includes('firebasestorage.googleapis.com') ||
    src.includes('.firebasestorage.app') ||
    src.includes('storage.googleapis.com')
  )
}

function storagePathFromUrl(src: string): string | null {
  try {
    const u = new URL(src)
    const match = u.pathname.match(/\/(?:v0\/)?b\/[^/]+\/o\/(.+)$/)
    if (match?.[1]) return decodeURIComponent(match[1])
    return null
  } catch {
    return null
  }
}

async function blobFromImageElement(src: string): Promise<Blob> {
  const load = (crossOrigin?: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      if (crossOrigin) el.crossOrigin = crossOrigin
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('圖片載入失敗'))
      el.src = src
    })

  let el: HTMLImageElement
  try {
    el = await load('anonymous')
  } catch {
    el = await load()
  }

  const canvas = document.createElement('canvas')
  canvas.width = el.naturalWidth || el.width
  canvas.height = el.naturalHeight || el.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('無法建立畫布')
  ctx.drawImage(el, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92),
  )
  if (!blob) throw new Error('無法匯出圖片（可能受跨網域限制）')
  return blob
}

export async function resolveImageBlob(src: string): Promise<Blob> {
  if (!src) throw new Error('沒有可下載的圖片')
  if (src.startsWith('data:')) return dataUrlToBlob(src)
  if (src.startsWith('blob:')) {
    const res = await fetch(src)
    if (!res.ok) throw new Error(`讀取失敗（${res.status}）`)
    return res.blob()
  }

  if (isFirebaseStorageUrl(src)) {
    const storage = getFirebaseStorage()
    const path = storagePathFromUrl(src)
    if (storage && path) {
      try {
        return await getBlob(ref(storage, path))
      } catch (err) {
        console.warn('[download] getBlob failed, fallback fetch', err)
      }
    }
  }

  try {
    const res = await fetch(src, { mode: 'cors', credentials: 'omit', cache: 'no-cache' })
    if (res.ok) return await res.blob()
    console.warn('[download] fetch status', res.status)
  } catch (err) {
    console.warn('[download] fetch failed', err)
  }

  return blobFromImageElement(src)
}

export function safeFilename(filename: string, src: string, mime?: string): string {
  const ext = guessExt(src, mime)
  const safeName = filename.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '-')
  return safeName.includes('.') ? safeName : `${safeName}.${ext}`
}

/** 先準備檔案，讓 UI 再用「新的點擊」觸發分享（iOS 才穩） */
export async function prepareImageDownload(
  src: string,
  filename: string,
  kind?: string,
): Promise<PreparedImage> {
  const blob = await resolveImageBlob(src)
  const full = safeFilename(filename, src, blob.type)
  const file = new File([blob], full, { type: blob.type || 'image/jpeg' })
  const objectUrl = URL.createObjectURL(blob)
  return { blob, file, filename: full, objectUrl, kind }
}

export function revokePrepared(image: PreparedImage | null | undefined) {
  if (image?.objectUrl) URL.revokeObjectURL(image.objectUrl)
}

/** 必須在使用者剛點擊的同步／微任務鏈中呼叫，手機才會跳出分享 */
export async function shareOrDownloadPrepared(
  image: PreparedImage,
): Promise<'shared' | 'downloaded'> {
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean
    share?: (data: ShareData) => Promise<void>
  }

  if (typeof nav.canShare === 'function' && typeof nav.share === 'function') {
    try {
      if (nav.canShare({ files: [image.file] })) {
        await nav.share({ files: [image.file], title: image.filename })
        return 'shared'
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'shared'
      console.warn('[download] share failed', err)
    }
  }

  const a = document.createElement('a')
  a.href = image.objectUrl
  a.download = image.filename
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  return 'downloaded'
}

/** 舊介面相容：桌面可直接下載；手機建議改走 SavePhotosSheet */
export async function downloadImage(src: string, filename: string): Promise<void> {
  const prepared = await prepareImageDownload(src, filename)
  try {
    await shareOrDownloadPrepared(prepared)
  } finally {
    // 分享後稍晚再釋放
    setTimeout(() => revokePrepared(prepared), 20_000)
  }
}

export async function downloadImages(
  items: { src: string; filename: string }[],
): Promise<{ ok: number; failed: number }> {
  let ok = 0
  let failed = 0
  for (const item of items) {
    if (!item.src) continue
    try {
      await downloadImage(item.src, item.filename)
      ok += 1
      await new Promise((r) => setTimeout(r, 220))
    } catch (err) {
      failed += 1
      console.warn('[downloadImages] one failed', item.filename, err)
    }
  }
  if (ok === 0 && failed > 0) {
    throw new Error('照片下載失敗，請確認已登入且網路正常後再試')
  }
  return { ok, failed }
}

export function isLikelyMobile(): boolean {
  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 0 && window.matchMedia('(max-width: 900px)').matches)
  )
}
