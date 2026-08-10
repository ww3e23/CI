import type { Defect } from '../types'

export function hasUploadableLocalMedia(defect: Defect): boolean {
  return (
    Boolean(defect.planPhotoDataUrl?.startsWith('data:')) ||
    (defect.photoDataUrls ?? []).some((p) => p.startsWith('data:'))
  )
}

export function hasRemoteOrLocalPhoto(defect: Defect): boolean {
  const plan = defect.planPhotoDataUrl
  if (plan && (plan.startsWith('http') || plan.startsWith('data:'))) return true
  return (defect.photoDataUrls ?? []).some(
    (p) => p.startsWith('http') || p.startsWith('data:'),
  )
}
