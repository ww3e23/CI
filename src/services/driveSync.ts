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
  cleanedDupFolders?: number
  force?: boolean
  errors: string[]
  clientEmail?: string | null
  folderLayout?: string
}

export type DriveSyncOptions = {
  defectIds?: string[]
  /** 強制對 Drive 真實掃描／補檔（手動「強制補齊」用） */
  force?: boolean
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
  options?: string[] | DriveSyncOptions,
): Promise<{ ok: boolean; result?: DriveSyncResult; error?: string }> {
  const opts: DriveSyncOptions = Array.isArray(options)
    ? { defectIds: options }
    : options ?? {}
  const ready = await ensureFirebaseUser()
  if (!ready.ok) return ready

  try {
    // 先對齊作廢狀態，避免 App 已刪、Firestore 仍 pending 又被上傳到 Drive
    await pushLocalVoidedDefects(projectId)

    const functions = getFunctions(ready.app, 'asia-east1')
    const callable = httpsCallable<
      { projectId: string; defectIds?: string[]; force?: boolean },
      DriveSyncResult
    >(functions, 'syncProjectPhotosToDrive', { timeout: 540_000 })
    const res = await callable({
      projectId,
      ...(opts.defectIds && opts.defectIds.length ? { defectIds: opts.defectIds } : {}),
      ...(opts.force ? { force: true } : {}),
    })
    return { ok: true, result: res.data }
  } catch (err) {
    return { ok: false, error: cleanError(err) }
  }
}

async function callUserDriveSync(
  projectId: string,
  accessToken: string,
  options?: DriveSyncOptions,
): Promise<{ ok: boolean; result?: DriveSyncResult; error?: string }> {
  const ready = await ensureFirebaseUser()
  if (!ready.ok) return ready

  try {
    const functions = getFunctions(ready.app, 'asia-east1')
    const callable = httpsCallable<
      { projectId: string; accessToken: string; defectIds?: string[]; force?: boolean },
      DriveSyncResult
    >(functions, 'syncProjectPhotosToDriveAsUser', { timeout: 540_000 })
    const res = await callable({
      projectId,
      accessToken,
      ...(options?.defectIds && options.defectIds.length
        ? { defectIds: options.defectIds }
        : {}),
      ...(options?.force ? { force: true } : {}),
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
  options?: DriveSyncOptions,
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
    return await callUserDriveSync(projectId, accessToken, { force: true, ...options })
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
 * 不依前端 driveOwnerConnected 旗標擋下——改由後端判斷，避免本機快取過舊而略過自動同步。
 */
export async function reconcileDefectOnDrive(params: {
  projectId: string
  defectId: string
}): Promise<{ ok: boolean; result?: DriveReconcileResult; error?: string }> {
  const project = useAuthStore.getState().projects.find((p) => p.id === params.projectId)
  if (!project?.driveFolderId) {
    return { ok: true, result: { ok: true, skipped: true, reason: 'no-drive-folder' } }
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
 * 後端已綁定擁有者時會對齊該筆缺失資料夾；未綁定則略過。
 */
export async function autoSyncDefectPhotosToDrive(params: {
  projectId: string
  defectId: string
}): Promise<void> {
  const project = useAuthStore.getState().projects.find((p) => p.id === params.projectId)
  if (!project?.driveFolderId) return

  const res = await reconcileDefectOnDrive(params)
  if (!res.ok) {
    console.warn('[drive-auto] 即時對齊失敗', res.error)
    return
  }
  if (res.result?.skipped) {
    console.info('[drive-auto] 略過', res.result.reason)
  }
}

const quietBackfillDone = new Set<string>()

/**
 * 開啟專案後背景補齊雲端硬碟。
 * 已停用自動觸發（改每日批次），保留函式供日後手動／除錯呼叫。
 */
export async function quietBackfillProjectDrive(projectId: string): Promise<void> {
  if (!projectId || quietBackfillDone.has(projectId)) return
  const project = useAuthStore.getState().projects.find((p) => p.id === projectId)
  if (!project?.driveFolderId) return
  // 費用控管：不再於開啟專案時自動全案掃描
  quietBackfillDone.add(projectId)
  console.info('[drive-auto] 開專案背景補齊已停用（改每日批次／手動同步）')
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
 * 不依前端 driveOwnerConnected 旗標擋下——改由後端判斷。
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

    // 優先走擁有者 token（後端）；失敗再退回現場授權
    try {
      const res = await callable({
        projectId: params.projectId,
        defectId: params.defectId,
      })
      return { ok: true, result: res.data }
    } catch (ownerErr) {
      if (!getGoogleOAuthClientId()) {
        return { ok: false, error: cleanError(ownerErr) }
      }
      let accessToken: string
      try {
        accessToken = await requestGoogleDriveAccessToken()
      } catch (err) {
        return {
          ok: false,
          error:
            (err as Error)?.message ||
            cleanError(ownerErr) ||
            '雲端硬碟同步刪除失敗，請請後台確認已綁定擁有者',
        }
      }
      const res = await callable({
        projectId: params.projectId,
        defectId: params.defectId,
        accessToken,
      })
      return { ok: true, result: res.data }
    }
  } catch (err) {
    return { ok: false, error: cleanError(err) }
  }
}
