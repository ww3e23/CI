import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseApp, getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase'
import {
  getGoogleOAuthClientId,
  requestGoogleDriveAccessToken,
  requestGoogleDriveAccessTokenSilent,
} from '../lib/googleDriveAuth'
import { useAuthStore } from '../store/useAuthStore'

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

async function ensureFirebaseUser() {
  if (!isFirebaseConfigured()) {
    return { ok: false as const, error: '尚未設定 Firebase，無法同步雲端硬碟' }
  }
  const app = getFirebaseApp()
  const auth = getFirebaseAuth()
  if (!app || !auth) return { ok: false as const, error: 'Firebase 尚未就緒' }
  await auth.authStateReady()
  if (!auth.currentUser) {
    return { ok: false as const, error: '請先重新登入（需要 Firebase 登入狀態才能同步）' }
  }
  return { ok: true as const, app }
}

/** 服務帳戶同步（僅共用雲端硬碟） */
export async function syncProjectPhotosToDrive(
  projectId: string,
): Promise<{ ok: boolean; result?: DriveSyncResult; error?: string }> {
  const ready = await ensureFirebaseUser()
  if (!ready.ok) return ready

  try {
    const functions = getFunctions(ready.app, 'asia-east1')
    const callable = httpsCallable<{ projectId: string }, DriveSyncResult>(
      functions,
      'syncProjectPhotosToDrive',
      { timeout: 540_000 },
    )
    const res = await callable({ projectId })
    return { ok: true, result: res.data }
  } catch (err) {
    const anyErr = err as { message?: string }
    const message = anyErr.message || String(err)
    return { ok: false, error: message.replace(/^Firebase:\s*/i, '').replace(/\s*\(.*\)$/, '') }
  }
}

async function callUserDriveSync(
  projectId: string,
  accessToken: string,
  defectIds?: string[],
): Promise<{ ok: boolean; result?: DriveSyncResult; error?: string }> {
  const ready = await ensureFirebaseUser()
  if (!ready.ok) return ready

  try {
    const functions = getFunctions(ready.app, 'asia-east1')
    const callable = httpsCallable<
      { projectId: string; accessToken: string; defectIds?: string[] },
      DriveSyncResult
    >(functions, 'syncProjectPhotosToDriveAsUser', { timeout: 540_000 })
    const res = await callable({
      projectId,
      accessToken,
      ...(defectIds && defectIds.length ? { defectIds } : {}),
    })
    return { ok: true, result: res.data }
  } catch (err) {
    const anyErr = err as { message?: string }
    const message = anyErr.message || String(err)
    return { ok: false, error: message.replace(/^Firebase:\s*/i, '').replace(/\s*\(.*\)$/, '') }
  }
}

/** 用登入者的 Google 帳號同步（適用「我的雲端硬碟」） */
export async function syncProjectPhotosToDriveAsUser(
  projectId: string,
): Promise<{ ok: boolean; result?: DriveSyncResult; error?: string }> {
  if (!getGoogleOAuthClientId()) {
    return {
      ok: false,
      error:
        '尚未設定 Google OAuth 用戶端。請到 GCP 建立「網頁應用程式」用戶端，並把用戶端 ID 設成 VITE_GOOGLE_OAUTH_CLIENT_ID 後重新部署。',
    }
  }

  try {
    const accessToken = await requestGoogleDriveAccessToken()
    return await callUserDriveSync(projectId, accessToken)
  } catch (err) {
    const anyErr = err as { message?: string }
    const message = anyErr.message || String(err)
    return { ok: false, error: message.replace(/^Firebase:\s*/i, '').replace(/\s*\(.*\)$/, '') }
  }
}

/**
 * 拍照上傳後背景自動同步到「我的雲端硬碟」。
 * 不彈授權窗：需先前按過「用我的 Google 帳號同步」。失敗時靜默略過。
 */
export async function autoSyncDefectPhotosToDrive(params: {
  projectId: string
  defectId: string
}): Promise<void> {
  const project = useAuthStore.getState().projects.find((p) => p.id === params.projectId)
  if (!project?.driveFolderId) return
  if (!getGoogleOAuthClientId()) return

  const accessToken = await requestGoogleDriveAccessTokenSilent()
  if (!accessToken) {
    console.info('[drive-auto] 尚無 Google 授權快取，略過自動同步（請先按「用我的 Google 帳號同步」一次）')
    return
  }

  const res = await callUserDriveSync(params.projectId, accessToken, [params.defectId])
  if (!res.ok) {
    console.warn('[drive-auto] 自動同步失敗', res.error)
  }
}
