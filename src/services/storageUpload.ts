import { getDownloadURL, listAll, ref, uploadBytes } from 'firebase/storage'
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

/** 上傳全區棟別配置圖（原始／標註後） */
export async function uploadSitePlanImage(params: {
  projectId: string
  kind: 'source' | 'map'
  dataUrl: string
}): Promise<{ url: string; path: string } | null> {
  if (!isFirebaseConfigured()) return null
  const storage = getFirebaseStorage()
  if (!storage) return null
  if (!params.dataUrl.startsWith('data:')) {
    return { url: params.dataUrl, path: '' }
  }

  const ext = guessExt(params.dataUrl)
  const stamp = Date.now()
  const path = `projects/${params.projectId}/sitePlan/${params.kind}-${stamp}.${ext}`
  const storageRef = ref(storage, path)
  const blob = dataUrlToBlob(params.dataUrl)
  await uploadBytes(storageRef, blob, {
    contentType: blob.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
    customMetadata: {
      projectId: params.projectId,
      kind: `site-plan-${params.kind}`,
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

export type ListedDefectMedia = {
  planUrl?: string
  photoUrls: string[]
}

/**
 * 從 Storage 列出某缺失資料夾內已上傳的圖（plan.*／photo-NN.*）。
 * 用於 Firestore 連結遺失但檔案仍在雲端時的找回。
 */
export async function listDefectMediaFromStorage(params: {
  projectId: string
  defectId: string
}): Promise<ListedDefectMedia | null> {
  if (!isFirebaseConfigured()) return null
  const storage = getFirebaseStorage()
  if (!storage) return null

  const folder = ref(storage, `projects/${params.projectId}/defects/${params.defectId}`)
  let items: Awaited<ReturnType<typeof listAll>>['items']
  try {
    const listed = await listAll(folder)
    items = listed.items
  } catch (err) {
    console.warn('[listDefectMediaFromStorage] listAll failed', params.defectId, err)
    return null
  }
  if (items.length === 0) return { photoUrls: [] }

  const planCandidates: { name: string; url: string }[] = []
  const photoCandidates: { index: number; name: string; url: string }[] = []

  await Promise.all(
    items.map(async (item) => {
      const name = item.name
      let url: string
      try {
        url = await getDownloadURL(item)
      } catch (err) {
        console.warn('[listDefectMediaFromStorage] getDownloadURL failed', name, err)
        return
      }
      const lower = name.toLowerCase()
      if (lower.startsWith('plan.')) {
        planCandidates.push({ name, url })
        return
      }
      const m = lower.match(/^photo-(\d+)\./)
      if (m) {
        photoCandidates.push({ index: Number(m[1]), name, url })
      }
    }),
  )

  planCandidates.sort((a, b) => a.name.localeCompare(b.name))
  photoCandidates.sort((a, b) => a.index - b.index || a.name.localeCompare(b.name))

  return {
    planUrl: planCandidates[0]?.url,
    photoUrls: photoCandidates.map((p) => p.url),
  }
}

/** 限制並行數 */
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function runOne(): Promise<void> {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await worker(items[index]!)
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1))
  await Promise.all(Array.from({ length: n }, () => runOne()))
  return results
}

/**
 * 批次為「本機／Firestore 沒有可用圖」的缺失掃描 Storage。
 * 回傳每個有找到檔案的 defectId → 媒體 URL。
 */
export async function recoverDefectMediaMapFromStorage(params: {
  projectId: string
  defectIds: string[]
  concurrency?: number
}): Promise<Map<string, ListedDefectMedia>> {
  const out = new Map<string, ListedDefectMedia>()
  const ids = [...new Set(params.defectIds.filter(Boolean))]
  if (ids.length === 0) return out

  await mapPool(ids, params.concurrency ?? 5, async (defectId) => {
    const listed = await listDefectMediaFromStorage({
      projectId: params.projectId,
      defectId,
    })
    if (!listed) return
    if (!listed.planUrl && listed.photoUrls.length === 0) return
    out.set(defectId, listed)
  })
  return out
}
