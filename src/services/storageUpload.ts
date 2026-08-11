import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { getFirebaseStorage, isFirebaseConfigured } from '../lib/firebase'

function guessExt(dataUrl: string): string {
  if (dataUrl.startsWith('data:image/png')) return 'png'
  if (dataUrl.startsWith('data:image/webp')) return 'webp'
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

function guessExtFromContentType(contentType: string | null | undefined, fallbackUrl?: string): string {
  const ct = String(contentType ?? '').toLowerCase()
  if (ct.includes('png')) return 'png'
  if (ct.includes('webp')) return 'webp'
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg'
  const path = String(fallbackUrl ?? '').split('?')[0].toLowerCase()
  if (path.endsWith('.png')) return 'png'
  if (path.endsWith('.webp')) return 'webp'
  return 'jpg'
}

/** 將 data URL／http(s) 圖上傳到 Firebase Storage（http 預設位置圖也要物化，Drive 才能同步） */
export async function uploadDataUrl(params: {
  projectId: string
  defectId: string
  kind: 'plan' | 'photo'
  index?: number
  dataUrl: string
}): Promise<{ url: string; path: string } | null> {
  if (!isFirebaseConfigured()) return null
  const storage = getFirebaseStorage()
  if (!storage) return null

  let blob: Blob
  let ext: string
  if (params.dataUrl.startsWith('data:')) {
    ext = guessExt(params.dataUrl)
    blob = dataUrlToBlob(params.dataUrl)
  } else if (/^https?:\/\//i.test(params.dataUrl)) {
    // 已在本缺失 Storage 路徑下則不必重傳
    const alreadyHere = params.dataUrl.includes(
      `/projects%2F${params.projectId}%2Fdefects%2F${params.defectId}%2F`,
    ) || params.dataUrl.includes(
      `/projects/${params.projectId}/defects/${params.defectId}/`,
    )
    if (alreadyHere) {
      return { url: params.dataUrl, path: '' }
    }
    try {
      const res = await fetch(params.dataUrl)
      if (!res.ok) throw new Error(`fetch ${res.status}`)
      blob = await res.blob()
      ext = guessExtFromContentType(blob.type || res.headers.get('content-type'), params.dataUrl)
    } catch (err) {
      console.warn('[uploadDataUrl] remote fetch failed, keep url', err)
      return { url: params.dataUrl, path: '' }
    }
  } else {
    return { url: params.dataUrl, path: '' }
  }

  const name =
    params.kind === 'plan'
      ? `plan.${ext}`
      : `photo-${String(params.index ?? 0).padStart(2, '0')}.${ext}`
  const path = `projects/${params.projectId}/defects/${params.defectId}/${name}`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, blob, {
    contentType: blob.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
    customMetadata: {
      projectId: params.projectId,
      defectId: params.defectId,
      kind: params.kind,
    },
  })
  const url = await getDownloadURL(storageRef)
  return { url, path }
}

/** 上傳某戶預設位置圖（圖面） */
export async function uploadUnitPlanImage(params: {
  projectId: string
  unitId: string
  dataUrl: string
}): Promise<{ url: string; path: string } | null> {
  if (!isFirebaseConfigured()) return null
  const storage = getFirebaseStorage()
  if (!storage) return null
  if (!params.dataUrl.startsWith('data:')) {
    return { url: params.dataUrl, path: '' }
  }

  const ext = guessExt(params.dataUrl)
  const path = `projects/${params.projectId}/units/${params.unitId}/plan.${ext}`
  const storageRef = ref(storage, path)
  const blob = dataUrlToBlob(params.dataUrl)
  await uploadBytes(storageRef, blob, {
    contentType: blob.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
    customMetadata: {
      projectId: params.projectId,
      unitId: params.unitId,
      kind: 'unit-plan',
    },
  })
  const url = await getDownloadURL(storageRef)
  return { url, path }
}

/** 平行上傳多張圖 */
export async function uploadDefectImages(params: {
  projectId: string
  defectId: string
  planPhotoDataUrl?: string
  photoDataUrls?: string[]
}): Promise<{ planUrl?: string; photoUrls: string[] }> {
  const photos = params.photoDataUrls ?? []
  const tasks: Promise<{ slot: 'plan' | number; url: string }>[] = []

  if (params.planPhotoDataUrl) {
    tasks.push(
      uploadDataUrl({
        projectId: params.projectId,
        defectId: params.defectId,
        kind: 'plan',
        dataUrl: params.planPhotoDataUrl,
      }).then((up) => ({
        slot: 'plan' as const,
        url: up?.url ?? params.planPhotoDataUrl!,
      })),
    )
  }

  photos.forEach((src, index) => {
    tasks.push(
      uploadDataUrl({
        projectId: params.projectId,
        defectId: params.defectId,
        kind: 'photo',
        index,
        dataUrl: src,
      }).then((up) => ({
        slot: index,
        url: up?.url ?? src,
      })),
    )
  })

  const results = await Promise.all(tasks)
  let planUrl: string | undefined
  const photoUrls = [...photos]
  for (const r of results) {
    if (r.slot === 'plan') planUrl = r.url
    else photoUrls[r.slot] = r.url
  }
  return { planUrl, photoUrls }
}
