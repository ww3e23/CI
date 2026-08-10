import { getBlob, ref } from 'firebase/storage'
import { getFirebaseStorage } from './firebase'

export type PreparedImage = {
  blob: Blob
  file: File
  filename: string
  objectUrl: string
  kind?: string
  /** 原始網址，取 blob 失敗時可開新分頁 */
  sourceUrl: string
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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label}逾時`)), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        window.clearTimeout(timer)
        reject(err)
      },
    )
  })
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
  if (canvas.width < 1 || canvas.height < 1) throw new Error('圖片尺寸無效')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('無法建立畫布')
  ctx.drawImage(el, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92),
  )
  if (!blob) throw new Error('無法匯出圖片（可能受跨網域限制）')
  return blob
}

async function blobFromXhr(src: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', src)
    xhr.responseType = 'blob'
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response instanceof Blob) {
        resolve(xhr.response)
        return
      }
      reject(new Error(`XHR ${xhr.status}`))
    }
    xhr.onerror = () => reject(new Error('XHR 網路錯誤'))
    xhr.send()
  })
}

export async function resolveImageBlob(src: string): Promise<Blob> {
  if (!src) throw new Error('沒有可下載的圖片')
  if (src.startsWith('data:')) return dataUrlToBlob(src)
  if (src.startsWith('blob:')) {
    const res = await fetch(src)
    if (!res.ok) throw new Error(`讀取失敗（${res.status}）`)
    return res.blob()
  }

  const errors: string[] = []

  if (isFirebaseStorageUrl(src)) {
    const storage = getFirebaseStorage()
    const path = storagePathFromUrl(src)
    if (storage && path) {
      try {
        return await withTimeout(getBlob(ref(storage, path)), 20_000, 'Storage 下載')
      } catch (err) {
        errors.push(`SDK: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  try {
    const res = await withTimeout(
      fetch(src, { mode: 'cors', credentials: 'omit', cache: 'no-cache' }),
      20_000,
      'fetch',
    )
    if (res.ok) return await res.blob()
    errors.push(`fetch ${res.status}`)
  } catch (err) {
    errors.push(`fetch: ${err instanceof Error ? err.message : String(err)}`)
  }

  try {
    return await withTimeout(blobFromXhr(src), 20_000, 'XHR')
  } catch (err) {
    errors.push(`xhr: ${err instanceof Error ? err.message : String(err)}`)
  }

  try {
    return await withTimeout(blobFromImageElement(src), 20_000, 'canvas')
  } catch (err) {
    errors.push(`canvas: ${err instanceof Error ? err.message : String(err)}`)
  }

  throw new Error(`無法取得圖片（${errors.join('；')}）`)
}

export function safeFilename(filename: string, src: string, mime?: string): string {
  const ext = guessExt(src, mime)
  // 去掉容易讓瀏覽器拒絕 download 屬性的字元
  const safeName = filename
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '-')
    .replace(/[^\w.\-()\u4e00-\u9fff]+/g, '_')
    .slice(0, 80)
  return safeName.includes('.') ? safeName : `${safeName || 'photo'}.${ext}`
}

export async function prepareImageDownload(
  src: string,
  filename: string,
  kind?: string,
): Promise<PreparedImage> {
  const blob = await resolveImageBlob(src)
  const full = safeFilename(filename, src, blob.type)
  const type = blob.type || 'image/jpeg'
  const file = new File([blob], full, { type })
  const objectUrl = URL.createObjectURL(blob)
  return { blob, file, filename: full, objectUrl, kind, sourceUrl: src }
}

export function revokePrepared(image: PreparedImage | null | undefined) {
  if (image?.objectUrl) URL.revokeObjectURL(image.objectUrl)
}

/** 觸發瀏覽器「另存新檔／下載」；桌面端主力路徑 */
export function triggerAnchorDownload(objectUrl: string, filename: string): void {
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  a.rel = 'noopener'
  // 勿用 display:none，部分瀏覽器會忽略 click
  a.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none'
  document.body.appendChild(a)
  a.click()
  // 延遲移除，給瀏覽器時間開始下載
  window.setTimeout(() => a.remove(), 1000)
}

export function isLikelyMobile(): boolean {
  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && window.matchMedia('(max-width: 900px)').matches)
  )
}

/**
 * 桌面：一律直接下載檔案（不要走 Web Share，否則常「沒反應」）。
 * 手機：優先系統分享。
 */
export async function shareOrDownloadPrepared(
  image: PreparedImage,
  options?: { forceDownload?: boolean },
): Promise<'shared' | 'downloaded'> {
  const forceDownload = options?.forceDownload === true || !isLikelyMobile()

  if (!forceDownload) {
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
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new Error('已取消分享')
        }
        console.warn('[download] share failed, fallback download', err)
      }
    }
  }

  // 用新鮮 blob URL，避免先前被 revoke
  const url = URL.createObjectURL(image.blob)
  try {
    triggerAnchorDownload(url, image.filename)
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }
  return 'downloaded'
}

/** 桌面一次下載多張 */
export async function downloadImagesDirect(
  items: { src: string; filename: string }[],
): Promise<{ ok: number; failed: number; errors: string[] }> {
  let ok = 0
  let failed = 0
  const errors: string[] = []
  for (const item of items) {
    if (!item.src) continue
    try {
      const prepared = await prepareImageDownload(item.src, item.filename)
      await shareOrDownloadPrepared(prepared, { forceDownload: true })
      revokePrepared(prepared)
      ok += 1
      // 多檔下載間隔，降低瀏覽器封鎖
      await new Promise((r) => setTimeout(r, 350))
    } catch (err) {
      failed += 1
      errors.push(err instanceof Error ? err.message : String(err))
      console.warn('[downloadImagesDirect] failed', item.filename, err)
    }
  }
  if (ok === 0 && failed > 0) {
    throw new Error(errors[0] || '下載失敗')
  }
  return { ok, failed, errors }
}

export async function downloadImage(src: string, filename: string): Promise<void> {
  const prepared = await prepareImageDownload(src, filename)
  try {
    await shareOrDownloadPrepared(prepared, { forceDownload: !isLikelyMobile() })
  } finally {
    setTimeout(() => revokePrepared(prepared), 20_000)
  }
}

export async function downloadImages(
  items: { src: string; filename: string }[],
): Promise<{ ok: number; failed: number }> {
  const result = await downloadImagesDirect(items)
  return { ok: result.ok, failed: result.failed }
}
