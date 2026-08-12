import { getBlob, ref } from 'firebase/storage'
import { getFirebaseStorage } from './firebase'

export type PreparedImage = {
  blob?: Blob
  file?: File
  filename: string
  /** 預覽用：blob: 或原始 http(s)／data: */
  objectUrl: string
  kind?: string
  sourceUrl: string
  /** true = 無法轉成同網域 blob，改走直連下載／開新分頁 */
  remoteOnly?: boolean
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

export function safeFilename(filename: string, src: string, mime?: string): string {
  const ext = guessExt(src, mime)
  const safeName = filename
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '-')
    .replace(/[^\w.\-()\u4e00-\u9fff]+/g, '_')
    .slice(0, 80)
  return safeName.includes('.') ? safeName : `${safeName || 'photo'}.${ext}`
}

/** ASCII 檔名給 Content-Disposition 用 */
function asciiFilename(filename: string, src: string): string {
  const ext = guessExt(src)
  const base = filename
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 60)
  return `${base || 'photo'}.${ext}`
}

/**
 * 在 Firebase／GCS URL 加上 attachment，讓「開連結」直接變下載
 *（不需 CORS、不需先 fetch blob）
 */
export function buildAttachmentUrl(src: string, filename: string): string {
  if (!src.startsWith('http')) return src
  try {
    const u = new URL(src)
    const name = asciiFilename(filename, src)
    u.searchParams.set(
      'response-content-disposition',
      `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(safeFilename(filename, src))}`,
    )
    return u.toString()
  } catch {
    return src
  }
}

export function triggerAnchorDownload(href: string, filename: string): void {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.target = '_blank'
  a.rel = 'noopener'
  a.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
  document.body.appendChild(a)
  a.click()
  window.setTimeout(() => a.remove(), 1000)
}

export function isLikelyMobile(): boolean {
  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && window.matchMedia('(max-width: 900px)').matches)
  )
}

async function tryResolveBlob(src: string): Promise<Blob | null> {
  if (src.startsWith('data:')) return dataUrlToBlob(src)
  if (src.startsWith('blob:')) {
    try {
      const res = await fetch(src)
      if (res.ok) return await res.blob()
    } catch {
      /* ignore */
    }
    return null
  }

  // Storage SDK（若 bucket 已設 CORS 才會成功）
  if (isFirebaseStorageUrl(src)) {
    const storage = getFirebaseStorage()
    const path = storagePathFromUrl(src)
    if (storage && path) {
      try {
        return await withTimeout(getBlob(ref(storage, path)), 6_000, 'Storage')
      } catch (err) {
        console.warn('[download] getBlob skipped', err)
      }
    }
  }

  try {
    const res = await withTimeout(
      fetch(src, { mode: 'cors', credentials: 'omit', cache: 'force-cache' }),
      6_000,
      'fetch',
    )
    if (res.ok) return await res.blob()
  } catch (err) {
    console.warn('[download] fetch skipped', err)
  }

  return null
}

/**
 * 批次打包專用：只要 blob，不做 File／objectUrl。
 * 優先走 fetch（多有快取），失敗再短超時試 Storage SDK。
 */
export async function fetchImageBlobForZip(
  src: string,
  timeoutMs = 10_000,
): Promise<Blob | null> {
  if (!src) return null

  if (src.startsWith('data:')) {
    try {
      // fetch(data:) 比逐字 atob 快很多
      const res = await fetch(src)
      if (res.ok) {
        const blob = await res.blob()
        if (blob.size > 0) return blob
      }
    } catch {
      /* fall through */
    }
    try {
      const blob = dataUrlToBlob(src)
      return blob.size > 0 ? blob : null
    } catch {
      return null
    }
  }

  if (src.startsWith('blob:')) {
    try {
      const res = await withTimeout(fetch(src), timeoutMs, 'blob')
      if (res.ok) {
        const blob = await res.blob()
        return blob.size > 0 ? blob : null
      }
    } catch {
      return null
    }
    return null
  }

  try {
    const res = await withTimeout(
      fetch(src, { mode: 'cors', credentials: 'omit', cache: 'force-cache' }),
      timeoutMs,
      'fetch',
    )
    if (res.ok) {
      const blob = await res.blob()
      if (blob.size > 0) return blob
    }
  } catch (err) {
    console.warn('[zip-blob] fetch skipped', err)
  }

  if (isFirebaseStorageUrl(src)) {
    const storage = getFirebaseStorage()
    const path = storagePathFromUrl(src)
    if (storage && path) {
      try {
        const blob = await withTimeout(
          getBlob(ref(storage, path)),
          Math.min(timeoutMs, 5_000),
          'Storage',
        )
        if (blob.size > 0) return blob
      } catch (err) {
        console.warn('[zip-blob] getBlob skipped', err)
      }
    }
  }

  return null
}

/**
 * 準備下載：
 * - data:/blob: → 轉成本機 blob
 * - http(s)（含 Firebase）→ 先短時間嘗試 blob；失敗也立刻回傳 remoteOnly，絕不卡死
 */
export async function prepareImageDownload(
  src: string,
  filename: string,
  kind?: string,
): Promise<PreparedImage> {
  const full = safeFilename(filename, src)

  if (!src) throw new Error('沒有可下載的圖片')

  // 本機資料一律走 blob
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    const blob = src.startsWith('data:')
      ? dataUrlToBlob(src)
      : await tryResolveBlob(src)
    if (!blob || blob.size === 0) throw new Error('無法讀取本機圖片')
    const objectUrl = URL.createObjectURL(blob)
    const file = new File([blob], full, { type: blob.type || 'image/jpeg' })
    return { blob, file, filename: full, objectUrl, kind, sourceUrl: src }
  }

  // 遠端：快速嘗試；失敗就用直連下載（解 CORS 卡住「準備中」）
  const blob = await tryResolveBlob(src)
  if (blob && blob.size > 0) {
    const objectUrl = URL.createObjectURL(blob)
    const file = new File([blob], full, { type: blob.type || 'image/jpeg' })
    return { blob, file, filename: full, objectUrl, kind, sourceUrl: src }
  }

  return {
    filename: full,
    objectUrl: src,
    kind,
    sourceUrl: src,
    remoteOnly: true,
  }
}

export function revokePrepared(image: PreparedImage | null | undefined) {
  if (image?.objectUrl?.startsWith('blob:')) URL.revokeObjectURL(image.objectUrl)
}

/**
 * 桌面：優先直接下載（blob 或 attachment URL）
 * 手機：有 file 才分享；否則開原圖／attachment
 */
export async function shareOrDownloadPrepared(
  image: PreparedImage,
  options?: { forceDownload?: boolean },
): Promise<'shared' | 'downloaded' | 'opened'> {
  const forceDownload = options?.forceDownload === true || !isLikelyMobile()
  const mobile = isLikelyMobile()

  // 有本機 blob：可分享或真正另存
  if (image.blob && image.file && !image.remoteOnly) {
    if (!forceDownload && mobile) {
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
          console.warn('[download] share failed', err)
        }
      }
    }

    const url = URL.createObjectURL(image.blob)
    try {
      triggerAnchorDownload(url, image.filename)
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
    }
    return 'downloaded'
  }

  // 無 blob（典型：Firebase CORS 未開）→ attachment URL 觸發瀏覽器下載／開檔
  const href = buildAttachmentUrl(image.sourceUrl, image.filename)
  triggerAnchorDownload(href, image.filename)
  return 'opened'
}

export async function downloadImage(src: string, filename: string): Promise<void> {
  const prepared = await prepareImageDownload(src, filename)
  try {
    await shareOrDownloadPrepared(prepared, { forceDownload: !isLikelyMobile() })
  } finally {
    window.setTimeout(() => revokePrepared(prepared), 20_000)
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
      await new Promise((r) => setTimeout(r, 280))
    } catch (err) {
      failed += 1
      console.warn('[downloadImages] failed', item.filename, err)
    }
  }
  if (ok === 0 && failed > 0) throw new Error('下載失敗')
  return { ok, failed }
}

export async function downloadImagesDirect(
  items: { src: string; filename: string }[],
): Promise<{ ok: number; failed: number; errors: string[] }> {
  const errors: string[] = []
  let ok = 0
  let failed = 0
  for (const item of items) {
    if (!item.src) continue
    try {
      const prepared = await prepareImageDownload(item.src, item.filename)
      await shareOrDownloadPrepared(prepared, { forceDownload: true })
      revokePrepared(prepared)
      ok += 1
      await new Promise((r) => setTimeout(r, 280))
    } catch (err) {
      failed += 1
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }
  if (ok === 0 && failed > 0) throw new Error(errors[0] || '下載失敗')
  return { ok, failed, errors }
}
