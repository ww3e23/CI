import type { Defect } from '../types'

const LOCAL_PENDING = '[local-pending-upload]'

/** 可顯示／打包的圖片網址（排除上傳中占位與空白） */
export function isUsableMediaUrl(url?: string | null): url is string {
  const v = String(url || '').trim()
  if (!v) return false
  if (v === LOCAL_PENDING) return false
  return (
    v.startsWith('http://') ||
    v.startsWith('https://') ||
    v.startsWith('data:') ||
    v.startsWith('blob:')
  )
}

export function hasUploadableLocalMedia(defect: Defect): boolean {
  return (
    Boolean(defect.planPhotoDataUrl?.startsWith('data:')) ||
    (defect.photoDataUrls ?? []).some((p) => p.startsWith('data:'))
  )
}

export function hasRemoteOrLocalPhoto(defect: Defect): boolean {
  if (isUsableMediaUrl(defect.planPhotoDataUrl)) return true
  return (defect.photoDataUrls ?? []).some((p) => isUsableMediaUrl(p))
}
