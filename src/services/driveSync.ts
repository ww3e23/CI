import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseApp, getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase'

export type DriveSyncResult = {
  ok: boolean
  projectId: string
  uploaded: number
  skipped: number
  scanned: number
  errors: string[]
  clientEmail?: string | null
  folderLayout?: string
}

/** 手動把 Storage 既有照片補同步到專案綁定的 Google 雲端硬碟 */
export async function syncProjectPhotosToDrive(
  projectId: string,
): Promise<{ ok: boolean; result?: DriveSyncResult; error?: string }> {
  if (!isFirebaseConfigured()) {
    return { ok: false, error: '尚未設定 Firebase，無法同步雲端硬碟' }
  }
  const app = getFirebaseApp()
  const auth = getFirebaseAuth()
  if (!app || !auth) return { ok: false, error: 'Firebase 尚未就緒' }

  await auth.authStateReady()
  if (!auth.currentUser) {
    return { ok: false, error: '請先重新登入（需要 Firebase 登入狀態才能同步）' }
  }

  try {
    const functions = getFunctions(app, 'asia-east1')
    const callable = httpsCallable<{ projectId: string }, DriveSyncResult>(
      functions,
      'syncProjectPhotosToDrive',
      { timeout: 540_000 },
    )
    const res = await callable({ projectId })
    return { ok: true, result: res.data }
  } catch (err) {
    const anyErr = err as { code?: string; message?: string; details?: unknown }
    const message = anyErr.message || String(err)
    return { ok: false, error: message.replace(/^Firebase:\s*/i, '').replace(/\s*\(.*\)$/, '') }
  }
}
