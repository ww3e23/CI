import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { onObjectFinalized } from 'firebase-functions/v2/storage'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { Readable } from 'node:stream'
import { google } from 'googleapis'
import {
  assertSharedDriveFolder,
  buildDriveFileName,
  buildItemFolderName,
  ensureDefectFolderPath,
  getDriveClient,
  listFolderFiles,
  type DriveClient,
} from './driveFolders'

initializeApp()

type ChecklistItemRow = {
  id: string
  description: string
  sortOrder: number
  categoryId: string
}

type DefectRow = {
  id: string
  status?: string
  buildingName?: string
  floor?: string
  unitCode?: string
  categoryId?: string
  categoryName?: string
  checklistItemId?: string
  defectNumber?: number
  description?: string
  planPhotoDataUrl?: string
  photoDataUrls?: string[]
}

async function loadChecklistItems(projectId: string): Promise<Map<string, ChecklistItemRow>> {
  const snap = await getFirestore().collection(`projects/${projectId}/checklistItems`).get()
  const map = new Map<string, ChecklistItemRow>()
  for (const doc of snap.docs) {
    const d = doc.data()
    map.set(doc.id, {
      id: doc.id,
      description: String(d.description ?? ''),
      sortOrder: Number(d.sortOrder ?? 0),
      categoryId: String(d.categoryId ?? ''),
    })
  }
  return map
}

async function resolveLeafFolder(
  drive: DriveClient,
  rootFolderId: string,
  defect: DefectRow,
  items: Map<string, ChecklistItemRow>,
): Promise<string> {
  const item = defect.checklistItemId ? items.get(defect.checklistItemId) : undefined
  const itemFolderName = buildItemFolderName({
    itemSortOrder: item?.sortOrder,
    itemDescription: item?.description,
    defectNumber: Number(defect.defectNumber ?? 0),
    defectDescription: String(defect.description ?? ''),
  })
  return ensureDefectFolderPath(drive, rootFolderId, {
    buildingName: String(defect.buildingName ?? '未指定棟別'),
    floor: String(defect.floor ?? '未指定樓層'),
    unitCode: String(defect.unitCode ?? '未指定戶別'),
    categoryName: String(defect.categoryName ?? '未指定大項'),
    itemFolderName,
  })
}

async function uploadBufferToDrive(params: {
  drive: DriveClient
  folderId: string
  fileName: string
  sourcePath: string
  buffer: Buffer
  contentType: string
}): Promise<string> {
  const res = await params.drive.files.create({
    requestBody: {
      name: params.fileName,
      parents: [params.folderId],
      appProperties: {
        sourcePath: params.sourcePath,
      },
    },
    media: {
      mimeType: params.contentType,
      body: Readable.from(params.buffer),
    },
    fields: 'id,webViewLink',
    supportsAllDrives: true,
  })
  if (!res.data.id) throw new Error('Drive 建立檔案失敗')
  return res.data.id
}

/**
 * Storage 上傳完成後自動鏡像（分棟／樓／戶／大項／小項資料夾）
 * 路徑：projects/{projectId}/defects/{defectId}/{filename}
 */
export const mirrorDefectPhotoToDrive = onObjectFinalized(
  {
    region: 'us-east1',
    memory: '512MiB',
    timeoutSeconds: 120,
  },
  async (event) => {
    const object = event.data
    const filePath = object.name
    if (!filePath) return

    const parts = filePath.split('/')
    if (parts.length < 5 || parts[0] !== 'projects' || parts[2] !== 'defects') {
      logger.info('skip non-defect path', filePath)
      return
    }

    const projectId = parts[1]
    const defectId = parts[3]
    const storageFileName = parts.slice(4).join('_')

    const projectSnap = await getFirestore().doc(`projects/${projectId}`).get()
    const driveFolderId = projectSnap.get('driveFolderId') as string | undefined
    if (!driveFolderId) {
      logger.info('project has no driveFolderId', projectId)
      return
    }

    const defectSnap = await getFirestore().doc(`projects/${projectId}/defects/${defectId}`).get()
    if (!defectSnap.exists) {
      logger.warn('defect missing', defectId)
      return
    }
    const defect = { id: defectId, ...(defectSnap.data() as Omit<DefectRow, 'id'>) }
    if (defect.status === 'voided') {
      logger.info('skip voided defect', defectId)
      return
    }

    const { drive, clientEmail } = await getDriveClient()
    const items = await loadChecklistItems(projectId)
    let folderId: string
    try {
      folderId = await resolveLeafFolder(drive, driveFolderId, defect, items)
    } catch (err) {
      logger.error('ensure folder failed', { err, clientEmail, driveFolderId })
      throw err
    }

    const existing = await listFolderFiles(drive, folderId)
    const driveFileName = buildDriveFileName(Number(defect.defectNumber ?? 0), storageFileName)
    if (existing.some((f) => f.sourcePath === filePath || f.name === driveFileName)) {
      logger.info('already on drive', filePath)
      return
    }

    const bucket = getStorage().bucket(object.bucket)
    const [buffer] = await bucket.file(filePath).download()
    const contentType = object.contentType || 'image/jpeg'
    const fileId = await uploadBufferToDrive({
      drive,
      folderId,
      fileName: driveFileName,
      sourcePath: filePath,
      buffer,
      contentType,
    })

    await getFirestore().doc(`projects/${projectId}/defects/${defectId}`).set(
      {
        driveLastFileId: fileId,
        driveSyncedAt: new Date().toISOString(),
      },
      { merge: true },
    )

    logger.info('mirrored to drive', { projectId, defectId, fileId, folderId })
  },
)

async function runPhotoSync(params: {
  projectId: string
  driveFolderId: string
  drive: DriveClient
  actorLabel?: string | null
  requireSharedDrive?: boolean
}) {
  const { projectId, driveFolderId, drive, actorLabel, requireSharedDrive } = params

  if (requireSharedDrive) {
    try {
      await assertSharedDriveFolder(drive, driveFolderId, actorLabel ?? null)
    } catch (err) {
      const msg = String((err as Error)?.message ?? err)
      throw new HttpsError(
        'failed-precondition',
        `${msg}\n\n若公司無法使用共用雲端硬碟，請改按「用我的 Google 帳號同步」。`,
      )
    }
  }

  const items = await loadChecklistItems(projectId)
  const defectsSnap = await getFirestore().collection(`projects/${projectId}/defects`).get()
  const bucket = getStorage().bucket()

  let uploaded = 0
  let skipped = 0
  let scanned = 0
  const errors: string[] = []
  const folderCache = new Map<string, string>()

  for (const doc of defectsSnap.docs) {
    const defect: DefectRow = { id: doc.id, ...(doc.data() as Omit<DefectRow, 'id'>) }
    if (defect.status === 'voided') continue

    const prefix = `projects/${projectId}/defects/${defect.id}/`
    let files: Array<{ name: string; contentType?: string }> = []
    try {
      const [listed] = await bucket.getFiles({ prefix })
      files = listed
        .filter((f) => f.name && !f.name.endsWith('/'))
        .map((f) => ({
          name: f.name,
          contentType: f.metadata?.contentType,
        }))
    } catch (err) {
      errors.push(`讀取 Storage 失敗 ${defect.id}: ${String(err)}`)
      continue
    }

    if (files.length === 0) continue

    const cacheKey = [
      defect.buildingName,
      defect.floor,
      defect.unitCode,
      defect.categoryName,
      defect.checklistItemId || defect.defectNumber,
    ].join('|')

    let folderId = folderCache.get(cacheKey)
    if (!folderId) {
      try {
        folderId = await resolveLeafFolder(drive, driveFolderId, defect, items)
        folderCache.set(cacheKey, folderId)
      } catch (err) {
        const msg = String((err as Error)?.message ?? err)
        errors.push(`建立資料夾失敗（#${defect.defectNumber}）: ${msg}`)
        if (/storage quota/i.test(msg)) {
          throw new HttpsError(
            'failed-precondition',
            '無法寫入此雲端硬碟資料夾（服務帳戶無個人容量）。請改按「用我的 Google 帳號同步」。',
          )
        }
        continue
      }
    }

    let existing: Awaited<ReturnType<typeof listFolderFiles>>
    try {
      existing = await listFolderFiles(drive, folderId)
    } catch (err) {
      errors.push(`讀取 Drive 資料夾失敗: ${String(err)}`)
      continue
    }
    const bySource = new Set(existing.map((f) => f.sourcePath).filter(Boolean) as string[])
    const byName = new Set(existing.map((f) => f.name))

    for (const file of files) {
      scanned += 1
      const storageFileName = file.name.slice(prefix.length) || file.name
      const driveFileName = buildDriveFileName(Number(defect.defectNumber ?? 0), storageFileName)
      if (bySource.has(file.name) || byName.has(driveFileName)) {
        skipped += 1
        continue
      }
      try {
        const [buffer] = await bucket.file(file.name).download()
        const fileId = await uploadBufferToDrive({
          drive,
          folderId,
          fileName: driveFileName,
          sourcePath: file.name,
          buffer,
          contentType: file.contentType || 'image/jpeg',
        })
        bySource.add(file.name)
        byName.add(driveFileName)
        uploaded += 1
        await getFirestore().doc(`projects/${projectId}/defects/${defect.id}`).set(
          {
            driveLastFileId: fileId,
            driveSyncedAt: new Date().toISOString(),
          },
          { merge: true },
        )
      } catch (err) {
        const msg = String((err as Error)?.message ?? err)
        if (/storage quota/i.test(msg)) {
          throw new HttpsError(
            'failed-precondition',
            '服務帳戶無法寫入「我的雲端硬碟」。請改按「用我的 Google 帳號同步」（使用你自己的 Google 容量）。',
          )
        }
        errors.push(`上傳失敗 ${driveFileName}: ${msg}`)
      }
    }
  }

  logger.info('manual drive sync done', {
    projectId,
    uploaded,
    skipped,
    scanned,
    errorCount: errors.length,
    actorLabel,
  })

  return {
    ok: true,
    projectId,
    uploaded,
    skipped,
    scanned,
    errors: errors.slice(0, 12),
    clientEmail: actorLabel ?? null,
    folderLayout: '棟別 / 樓層 / 戶別 / 大項 / 編號_小項',
  }
}

function requireDriveFolderId(value: unknown): string {
  if (!value || typeof value !== 'string') {
    throw new HttpsError(
      'failed-precondition',
      '此專案尚未綁定 Google 雲端硬碟資料夾，請先在後台貼上資料夾網址並儲存',
    )
  }
  return value
}

/** 服務帳戶同步：僅適用共用雲端硬碟 */
export const syncProjectPhotosToDrive = onCall(
  {
    region: 'asia-east1',
    memory: '1GiB',
    timeoutSeconds: 540,
    cors: true,
    invoker: 'public',
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', '請先登入後再同步雲端硬碟')
    }
    const projectId = String(request.data?.projectId ?? '').trim()
    if (!projectId) throw new HttpsError('invalid-argument', '缺少 projectId')

    const projectSnap = await getFirestore().doc(`projects/${projectId}`).get()
    if (!projectSnap.exists) throw new HttpsError('not-found', '找不到此專案')
    const driveFolderId = requireDriveFolderId(projectSnap.get('driveFolderId'))

    const { drive, clientEmail } = await getDriveClient()
    return runPhotoSync({
      projectId,
      driveFolderId,
      drive,
      actorLabel: clientEmail,
      requireSharedDrive: true,
    })
  },
)

/** 使用者 OAuth 同步：適用「我的雲端硬碟」 */
export const syncProjectPhotosToDriveAsUser = onCall(
  {
    region: 'asia-east1',
    memory: '1GiB',
    timeoutSeconds: 540,
    cors: true,
    invoker: 'public',
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', '請先登入後再同步雲端硬碟')
    }

    const projectId = String(request.data?.projectId ?? '').trim()
    const accessToken = String(request.data?.accessToken ?? '').trim()
    if (!projectId) throw new HttpsError('invalid-argument', '缺少 projectId')
    if (!accessToken) throw new HttpsError('invalid-argument', '缺少 Google 授權')

    const projectSnap = await getFirestore().doc(`projects/${projectId}`).get()
    if (!projectSnap.exists) throw new HttpsError('not-found', '找不到此專案')
    const driveFolderId = requireDriveFolderId(projectSnap.get('driveFolderId'))

    const oauth2 = new google.auth.OAuth2()
    oauth2.setCredentials({ access_token: accessToken })
    const drive = google.drive({ version: 'v3', auth: oauth2 })

    try {
      await drive.files.get({
        fileId: driveFolderId,
        fields: 'id,name',
        supportsAllDrives: true,
      })
    } catch (err) {
      throw new HttpsError(
        'permission-denied',
        `無法存取綁定的雲端硬碟資料夾。請用有該資料夾權限的 Google 帳號授權。（${String(
          (err as Error)?.message ?? err,
        )}）`,
      )
    }

    return runPhotoSync({
      projectId,
      driveFolderId,
      drive,
      actorLabel: 'user-oauth',
      requireSharedDrive: false,
    })
  },
)
