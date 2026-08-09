import { getBlob, ref } from 'firebase/storage'
import { getFirebaseStorage } from './firebase'

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

/** 從 Firebase download URL 解析 object path */
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

async function resolveBlob(src: string): Promise<Blob> {
  if (src.startsWith('data:')) return dataUrlToBlob(src)
  if (src.startsWith('blob:')) {
    const res = await fetch(src)
    if (!res.ok) throw new Error(`讀取失敗（${res.status}）`)
    return res.blob()
  }

  // 1) Firebase Storage SDK：不依賴 bucket CORS
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

  // 2) 一般 fetch
  try {
    const res = await fetch(src, { mode: 'cors', credentials: 'omit', cache: 'no-cache' })
    if (res.ok) return await res.blob()
    console.warn('[download] fetch status', res.status)
  } catch (err) {
    console.warn('[download] fetch failed', err)
  }

  // 3) 畫布匯出
  return blobFromImageElement(src)
}

async function saveBlob(blob: Blob, filename: string): Promise<'shared' | 'downloaded' | 'opened'> {
  const file = new File([blob], filename, { type: blob.type || 'image/jpeg' })

  // 手機優先：系統分享／存到相簿（Safari／PWA 對 <a download> 常無效）
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean
    share?: (data: ShareData) => Promise<void>
  }
  if (typeof nav.canShare === 'function' && typeof nav.share === 'function') {
    try {
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: filename })
        return 'shared'
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'shared'
      console.warn('[download] share failed', err)
    }
  }

  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
    // 延後釋放，避免部分瀏覽器還沒開始下載就失效
    setTimeout(() => URL.revokeObjectURL(url), 15_000)
    return 'downloaded'
  } catch (err) {
    console.warn('[download] anchor failed', err)
    // 最後手段：導向 blob（同一分頁），使用者可長按儲存
    window.location.assign(url)
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return 'opened'
  }
}

/** 下載圖片（支援 data URL、Firebase Storage、http(s)；手機改走分享） */
export async function downloadImage(src: string, filename: string): Promise<void> {
  if (!src) throw new Error('沒有可下載的圖片')

  const blob = await resolveBlob(src)
  const ext = guessExt(src, blob.type)
  const safeName = filename.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '-')
  const full = safeName.includes('.') ? safeName : `${safeName}.${ext}`
  await saveBlob(blob, full)
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
