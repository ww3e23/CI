import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseApp, getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase'
import {
  getGoogleOAuthClientId,
  requestGoogleDriveAccessToken,
  requestGoogleDriveAuthCode,
} from '../lib/googleDriveAuth'
import { useAuthStore } from '../store/useAuthStore'
import { useProjectStore } from '../store/useProjectStore'
import { syncDefect } from './cloudSync'

export type DriveSyncResult = {
  ok: boolean
  projectId: string
  uploaded: number
  skipped: number
  scanned: number
  cleanedVoided?: number
  errors: string[]
  clientEmail?: string | null
  folderLayout?: string
}

/** 同步 Drive 前，先把本機已刪除（作廢）的缺失寫回 Firestore，避免幽靈缺失又被上傳 */
async function pushLocalVoidedDefects(projectId: string): Promise<number> {
  const voided = useProjectStore.getState().defects.filter((d) => d.status === 'voided')
  if (voided.length === 0) return 0
  let n = 0
  await Promise.all(
    voided.map(async (d) => {
      try {
        const ok = await syncDefect(projectId, d)
        if (ok) n += 1
      } catch {
        /* ignore single failure */
      }
    }),
  )
  return n
}

export type DriveOwnerConnectResult = {
  ok: boolean
  projectId: string
  email?: string | null
  reusedRefreshToken?: boolean
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

function cleanError(err: unknown): string {
  const anyErr = err as { message?: string }
  const message = anyErr.message || String(err)
  return message.replace(/^Firebase:\s*/i, '').replace(/\s*\(.*\)$/, '')
}

/** 後台：綁定專案雲端硬碟擁有者（彈一次 Google，之後現場免登） */
export async function connectProjectDriveOwner(
  projectId: string,
): Promise<{ ok: boolean; result?: DriveOwnerConnectResult; error?: string }> {
  if (!getGoogleOAuthClientId()) {
    return {
      ok: false,
      error:
        '尚未設定 Google OAuth 用戶端。請到 GCP 建立「網頁應用程式」用戶端，並把用戶端 ID 設成 VITE_GOOGLE_OAUTH_CLIENT_ID 後重新部署。',
    }
  }

  const ready = await ensureFirebaseUser()
  if (!ready.ok) return ready

  try {
    const code = await requestGoogleDriveAuthCode()
    const functions = getFunctions(ready.app, 'asia-east1')
    const callable = httpsCallable<{ projectId: string; code: string }, DriveOwnerConnectResult>(
      functions,
      'connectProjectDriveOwner',
      { timeout: 60_000 },
    )
    const res = await callable({ projectId, code })
    const email = res.data.email || null
    if (email || res.data.ok) {
      const projects = useAuthStore.getState().projects
      const project = projects.find((p) => p.id === projectId)
      if (project) {
        useAuthStore.getState().upsertProject({
          ...project,
          driveOwnerConnected: true,
          driveOwnerEmail: email || project.driveOwnerEmail,
        })
      }
    }
    return { ok: true, result: res.data }
  } catch (err) {
    return { ok: false, error: cleanError(err) }
  }
}

/** 後台：解除擁有者綁定 */
export async function disconnectProjectDriveOwner(
  projectId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ready = await ensureFirebaseUser()
  if (!ready.ok) return ready
  try {
    const functions = getFunctions(ready.app, 'asia-east1')
    const callable = httpsCallable<{ projectId: string }, { ok: boolean }>(
      functions,
      'disconnectProjectDriveOwner',
    )
    await callable({ projectId })
    const project = useAuthStore.getState().projects.find((p) => p.id === projectId)
    if (project) {
      useAuthStore.getState().upsertProject({
        ...project,
        driveOwnerConnected: false,
        driveOwnerEmail: undefined,
      })
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: cleanError(err) }
  }
}

/**
 * 現場／後台同步：後端用「已綁定擁有者」寫入雲端硬碟，不彈 Google。
 * 若尚未綁定擁有者，則僅適用共用雲端硬碟的服務帳戶路徑。
 */
export async function syncProjectPhotosToDrive(
  projectId: string,
  defectIds?: string[],
): Promise<{ ok: boolean; result?: DriveSyncResult; error?: string }> {
  const ready = await ensureFirebaseUser()
  if (!ready.ok) return ready

  try {
    // 先對齊作廢狀態，避免 App 已刪、Firestore 仍 pending 又被上傳到 Drive
    await pushLocalVoidedDefects(projectId)

    const functions = getFunctions(ready.app, 'asia-east1')
    const callable = httpsCallable<
      { projectId: string; defectIds?: string[] },
      DriveSyncResult
    >(functions, 'syncProjectPhotosToDrive', { timeout: 540_000 })
    const res = await callable({
      projectId,
      ...(defectIds && defectIds.length ? { defectIds } : {}),
    })
    return { ok: true, result: res.data }
  } catch (err) {
    return { ok: false, error: cleanError(err) }
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
    return { ok: false, error: cleanError(err) }
  }
}

/**
 * 後台備援：當場用管理者自己的 Google 帳號同步（不寫入長期擁有者）。
 * 一般請改用「綁定雲端硬碟擁有者」+「同步到雲端硬碟」。
 */
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
    await pushLocalVoidedDefects(projectId)
    const accessToken = await requestGoogleDriveAccessToken()
    return await callUserDriveSync(projectId, accessToken)
  } catch (err) {
    return { ok: false, error: cleanError(err) }
  }
}

export type DriveReconcileResult = {
  ok: boolean
  skipped?: boolean
  reason?: string
  action?: 'trashed' | 'synced' | 'skipped'
  renamed?: boolean
  moved?: boolean
  uploaded?: number
  removed?: number
  folderId?: string | null
}

/**
 * 單筆缺失即時對齊雲端硬碟（新增／編輯／刪除後用）。
 * 已綁定擁有者時不彈 Google：改名、搬資料夾、補傳、清掉已刪照片。
 */
export async function reconcileDefectOnDrive(params: {
  projectId: string
  defectId: string
}): Promise<{ ok: boolean; result?: DriveReconcileResult; error?: string }> {
  const project = useAuthStore.getState().projects.find((p) => p.id === params.projectId)
  if (!project?.driveFolderId) {
    return { ok: true, result: { ok: true, skipped: true, reason: 'no-drive-folder' } }
  }
  if (!project.driveOwnerConnected) {
    return { ok: true, result: { ok: true, skipped: true, reason: 'drive-owner-not-connected' } }
  }

  const ready = await ensureFirebaseUser()
  if (!ready.ok) return ready

  try {
    const functions = getFunctions(ready.app, 'asia-east1')
    const callable = httpsCallable<
      { projectId: string; defectId: string },
      DriveReconcileResult
    >(functions, 'reconcileDefectOnDrive', { timeout: 180_000 })
    const res = await callable({
      projectId: params.projectId,
      defectId: params.defectId,
    })
    return { ok: true, result: res.data }
  } catch (err) {
    return { ok: false, error: cleanError(err) }
  }
}

/**
 * 拍照上傳／編輯後背景自動同步。
 * 已綁定擁有者時：對齊該筆缺失的 Drive 資料夾（不彈 Google）。
 */
export async function autoSyncDefectPhotosToDrive(params: {
  projectId: string
  defectId: string
}): Promise<void> {
  const project = useAuthStore.getState().projects.find((p) => p.id === params.projectId)
  if (!project?.driveFolderId) return

  if (project.driveOwnerConnected) {
    const res = await reconcileDefectOnDrive(params)
    if (!res.ok) console.warn('[drive-auto] 即時對齊失敗', res.error)
    return
  }

  // 尚未綁定擁有者：略過（避免現場每人被逼登 Google）
  console.info('[drive-auto] 專案尚未綁定雲端硬碟擁有者，略過自動同步')
}

export type DriveDeleteResult = {
  ok: boolean
  skipped?: boolean
  reason?: string
  trashedFolder?: boolean
  trashedFiles?: number
}

/**
 * 刪除缺失後，同步把雲端硬碟對應資料夾移到垃圾桶。
 * 已綁定擁有者時不彈 Google；否則才退回個人授權。
 */
export async function deleteDefectPhotosFromDrive(params: {
  projectId: string
  defectId: string
}): Promise<{ ok: boolean; result?: DriveDeleteResult; error?: string }> {
  const project = useAuthStore.getState().projects.find((p) => p.id === params.projectId)
  if (!project?.driveFolderId) {
    return { ok: true, result: { ok: true, skipped: true, reason: 'no-drive-folder' } }
  }

  const ready = await ensureFirebaseUser()
  if (!ready.ok) return ready

  try {
    const functions = getFunctions(ready.app, 'asia-east1')
    const callable = httpsCallable<
      { projectId: string; defectId: string; accessToken?: string },
      DriveDeleteResult
    >(functions, 'deleteDefectPhotosFromDriveAsUser', { timeout: 120_000 })

    if (project.driveOwnerConnected) {
      const res = await callable({
        projectId: params.projectId,
        defectId: params.defectId,
      })
      return { ok: true, result: res.data }
    }

    if (!getGoogleOAuthClientId()) {
      return {
        ok: false,
        error: '此專案尚未綁定雲端硬碟擁有者，且未設定 Google OAuth，無法同步刪除',
      }
    }

    let accessToken: string
    try {
      accessToken = await requestGoogleDriveAccessToken()
    } catch (err) {
      return {
        ok: false,
        error:
          (err as Error)?.message ||
          '需要 Google 授權才能同步刪除。請請後台管理者先完成「綁定雲端硬碟擁有者」。',
      }
    }

    const res = await callable({
      projectId: params.projectId,
      defectId: params.defectId,
      accessToken,
    })
    return { ok: true, result: res.data }
  } catch (err) {
    return { ok: false, error: cleanError(err) }
  }
}
