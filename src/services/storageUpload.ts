import { getDownloadURL, ref, uploadString } from 'firebase/storage'
import { getFirebaseStorage, isFirebaseConfigured } from '../lib/firebase'

function guessExt(dataUrl: string): string {
  if (dataUrl.startsWith('data:image/png')) return 'png'
  if (dataUrl.startsWith('data:image/webp')) return 'webp'
  return 'jpg'
}

/** 將 data URL 上傳到 Firebase Storage，回傳可公開讀取的下載網址（需登入規則另計） */
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
  if (!params.dataUrl.startsWith('data:')) {
    // 已是遠端 URL，不重複上傳
    return { url: params.dataUrl, path: '' }
  }

  const ext = guessExt(params.dataUrl)
  const name =
    params.kind === 'plan'
      ? `plan.${ext}`
      : `photo-${String(params.index ?? 0).padStart(2, '0')}.${ext}`
  const path = `projects/${params.projectId}/defects/${params.defectId}/${name}`
  const storageRef = ref(storage, path)
  await uploadString(storageRef, params.dataUrl, 'data_url', {
    contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
    customMetadata: {
      projectId: params.projectId,
      defectId: params.defectId,
      kind: params.kind,
    },
  })
  const url = await getDownloadURL(storageRef)
  return { url, path }
}
