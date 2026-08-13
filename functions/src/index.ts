import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { onObjectFinalized } from 'firebase-functions/v2/storage'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions'
import type { DocumentData } from 'firebase-admin/firestore'
import { Readable } from 'node:stream'
import { google } from 'googleapis'
import {
  assertSharedDriveFolder,
  buildDriveFileName,
  buildItemFolderName,
  buildItemFolderNameCandidates,
  dedupeFolderFilesByLogicalName,
  driveFileLogicalKey,
  ensureCategoryFolderPath,
  ensureDefectFolderPath,
  findAllDefectLeafFolders,
  findDefectFolderPath,
  getDriveClient,
  getDriveItemMeta,
  listFolderFiles,
  moveDriveItem,
  renameDriveItem,
  trashDriveItem,
  type DriveClient,
} from './driveFolders'
import {
  clearDriveOwner,
  createOAuth2Client,
  exchangeAuthCode,
  getDriveClientFromOwner,
  googleOAuthClientSecret,
  loadDriveOwner,
  saveDriveOwner,
  tryGetDriveClientFromOwner,
} from './driveOwnerAuth'

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
  area?: string
  checklistItemId?: string
  defectNumber?: number
  description?: string
  planPhotoDataUrl?: string
  photoDataUrls?: string[]
  driveLeafFolderId?: string
  driveLastFileId?: string
  driveSyncedAt?: string
  /** 上次成功同步時的內容指紋；相同則不再重存 */
  driveContentKey?: string
}

/** 用來判斷「內容沒變就不要再寫 Drive」 */
function buildDriveContentKey(defect: DefectRow): string {
  const photos = Array.isArray(defect.photoDataUrls)
    ? defect.photoDataUrls.map((p) => String(p || '').trim()).filter(Boolean)
    : []
  return [
    String(defect.status ?? ''),
    String(defect.defectNumber ?? 0),
    String(defect.buildingName ?? ''),
    String(defect.floor ?? ''),
    String(defect.unitCode ?? ''),
    String(defect.categoryName ?? ''),
    String(defect.checklistItemId ?? ''),
    String(defect.area ?? ''),
    String(defect.description ?? ''),
    String(defect.planPhotoDataUrl ?? '').trim(),
    photos.join('|'),
  ].join('\n')
}

function driveFileAlreadyPresent(
  bySource: Set<string>,
  byName: Set<string>,
  sourcePath: string,
  driveFileName: string,
): boolean {
  if (bySource.has(sourcePath) || byName.has(driveFileName)) return true
  // 檔名主體相同也視為已存在（避免 plan.jpg / plan-remote.jpg 重複存）
  const stem = driveFileName.replace(/\.[^.]+$/, '').toLowerCase()
  for (const name of byName) {
    const n = name.replace(/\.[^.]+$/, '').toLowerCase()
    if (n === stem) return true
    // #12_plan 與 #12_plan-remote 視為同一張
    if (stem.replace(/-remote$/, '') === n.replace(/-remote$/, '')) return true
  }
  return false
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
  projectId?: string,
): Promise<string> {
  const item = defect.checklistItemId ? items.get(defect.checklistItemId) : undefined
  const itemFolderName = buildItemFolderName({
    itemSortOrder: item?.sortOrder,
    itemDescription: item?.description,
    defectNumber: Number(defect.defectNumber ?? 0),
    defectDescription: String(defect.description ?? ''),
    categoryName: String(defect.categoryName ?? ''),
    area: String(defect.area ?? ''),
  })
  return ensureDefectFolderPath(drive, rootFolderId, {
    buildingName: String(defect.buildingName ?? '未指定棟別'),
    floor: String(defect.floor ?? '未指定樓層'),
    unitCode: String(defect.unitCode ?? '未指定戶別'),
    categoryName: String(defect.categoryName ?? '未指定大項'),
    itemFolderName,
    defectId: defect.id,
    projectId,
  })
}

async function trashDefectDriveData(params: {
  drive: DriveClient
  rootFolderId: string
  defect: DefectRow
  items: Map<string, ChecklistItemRow>
}): Promise<{ trashedFolder: boolean; trashedFiles: number }> {
  const { drive, rootFolderId, defect, items } = params
  let trashedFolder = false
  let trashedFiles = 0

  const item = defect.checklistItemId ? items.get(defect.checklistItemId) : undefined
  const candidates = buildItemFolderNameCandidates({
    itemSortOrder: item?.sortOrder,
    itemDescription: item?.description,
    defectNumber: Number(defect.defectNumber ?? 0),
    defectDescription: String(defect.description ?? ''),
    categoryName: String(defect.categoryName ?? ''),
    area: String(defect.area ?? ''),
  })

  const folderIds = new Set<string>()
  const knownFolderId = String(defect.driveLeafFolderId || '').trim()
  if (knownFolderId) folderIds.add(knownFolderId)

  try {
    const found = await findAllDefectLeafFolders(drive, rootFolderId, {
      buildingName: String(defect.buildingName ?? '未指定棟別'),
      floor: String(defect.floor ?? '未指定樓層'),
      unitCode: String(defect.unitCode ?? '未指定戶別'),
      categoryName: String(defect.categoryName ?? '未指定大項'),
      itemFolderNames: candidates,
      defectId: defect.id,
      defectNumber: Number(defect.defectNumber ?? 0),
    })
    for (const id of found) folderIds.add(id)
  } catch (err) {
    logger.warn('findAllDefectLeafFolders failed', { defectId: defect.id, err })
    // 後援：至少找一個
    try {
      const one = await findDefectFolderPath(drive, rootFolderId, {
        buildingName: String(defect.buildingName ?? '未指定棟別'),
        floor: String(defect.floor ?? '未指定樓層'),
        unitCode: String(defect.unitCode ?? '未指定戶別'),
        categoryName: String(defect.categoryName ?? '未指定大項'),
        itemFolderNames: candidates,
        defectId: defect.id,
      })
      if (one) folderIds.add(one)
    } catch {
      /* ignore */
    }
  }

  for (const folderId of folderIds) {
    try {
      const files = await listFolderFiles(drive, folderId)
      for (const f of files) {
        try {
          await trashDriveItem(drive, f.id)
          trashedFiles += 1
        } catch (err) {
          logger.warn('trash file failed', { fileId: f.id, err })
        }
      }
      await trashDriveItem(drive, folderId)
      trashedFolder = true
    } catch (err) {
      logger.warn('trash folder failed', { folderId, err })
    }
  }

  if (!trashedFolder) {
    const lastFile = String(defect.driveLastFileId || '').trim()
    if (lastFile) {
      try {
        await trashDriveItem(drive, lastFile)
        trashedFiles += 1
      } catch {
        /* ignore */
      }
    }
  }

  return { trashedFolder, trashedFiles }
}

async function uploadBufferToDrive(params: {
  drive: DriveClient
  folderId: string
  fileName: string
  sourcePath: string
  buffer: Buffer
  contentType: string
}): Promise<string> {
  // 上傳前再掃一次，縮小與其他觸發器的競態視窗
  const existing = await listFolderFiles(params.drive, params.folderId)
  const bySource = new Set(existing.map((f) => f.sourcePath).filter(Boolean) as string[])
  const byName = new Set(existing.map((f) => f.name))
  if (driveFileAlreadyPresent(bySource, byName, params.sourcePath, params.fileName)) {
    const logical = driveFileLogicalKey(params.fileName)
    const hit =
      existing.find((f) => f.sourcePath === params.sourcePath) ||
      existing.find((f) => f.name === params.fileName) ||
      existing.find((f) => driveFileLogicalKey(f.name) === logical)
    if (hit?.id) return hit.id
  }

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

  // 即使競態下多建了一份，立刻把同邏輯主體的多餘檔清掉
  const deduped = await dedupeFolderFilesByLogicalName(params.drive, params.folderId)
  const logical = driveFileLogicalKey(params.fileName)
  const keep =
    deduped.files.find((f) => f.sourcePath === params.sourcePath) ||
    deduped.files.find((f) => driveFileLogicalKey(f.name) === logical) ||
    deduped.files.find((f) => f.id === res.data.id)
  return keep?.id || res.data.id
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim())
}

/** 缺失文件上的遠端圖（預設位置圖等尚未物化進 Storage） */
function collectRemoteMedia(defect: DefectRow): Array<{
  kind: 'plan' | 'photo'
  index: number
  url: string
  sourcePath: string
  fileName: string
}> {
  const out: Array<{
    kind: 'plan' | 'photo'
    index: number
    url: string
    sourcePath: string
    fileName: string
  }> = []
  if (isHttpUrl(defect.planPhotoDataUrl)) {
    const url = defect.planPhotoDataUrl.trim()
    out.push({
      kind: 'plan',
      index: 0,
      url,
      sourcePath: `remote:plan:${url}`,
      fileName: 'plan-remote.jpg',
    })
  }
  const photos = Array.isArray(defect.photoDataUrls) ? defect.photoDataUrls : []
  photos.forEach((raw, index) => {
    if (!isHttpUrl(raw)) return
    const url = raw.trim()
    out.push({
      kind: 'photo',
      index,
      url,
      sourcePath: `remote:photo-${index}:${url}`,
      fileName: `photo-${String(index).padStart(2, '0')}-remote.jpg`,
    })
  })
  return out
}

async function fetchRemoteImage(
  url: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) {
      logger.warn('fetch remote image failed', { url, status: res.status })
      return null
    }
    const contentType = res.headers.get('content-type') || 'image/jpeg'
    const ab = await res.arrayBuffer()
    return { buffer: Buffer.from(ab), contentType }
  } catch (err) {
    logger.warn('fetch remote image error', { url, err })
    return null
  }
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
    secrets: [googleOAuthClientSecret],
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

    // 已綁定擁有者時，由 Firestore onDefectWrittenAutoDrive 統一寫入，
    // 避免 Storage mirror + Firestore reconcile + 客戶端 callable 三路競態同名檔×2～3。
    if (projectSnap.get('driveOwnerConnected')) {
      logger.info('skip mirror: owner auto-drive owns sync', { projectId, defectId, filePath })
      return
    }

    // 上傳常早於 Firestore 寫入：短暫重試避免整筆跳過
    let defectSnap = await getFirestore().doc(`projects/${projectId}/defects/${defectId}`).get()
    if (!defectSnap.exists) {
      for (const waitMs of [800, 1600, 3200]) {
        await sleep(waitMs)
        defectSnap = await getFirestore().doc(`projects/${projectId}/defects/${defectId}`).get()
        if (defectSnap.exists) break
      }
    }
    if (!defectSnap.exists) {
      logger.warn('defect missing after retry', defectId)
      return
    }
    const defect = { id: defectId, ...(defectSnap.data() as Omit<DefectRow, 'id'>) }
    if (defect.status === 'voided') {
      logger.info('skip voided defect', defectId)
      return
    }

    const ownerDrive = await tryGetDriveClientFromOwner({
      projectId,
      clientSecret: googleOAuthClientSecret.value(),
    })
    const { drive, clientEmail } = ownerDrive
      ? { drive: ownerDrive.drive, clientEmail: ownerDrive.email }
      : await getDriveClient()
    const items = await loadChecklistItems(projectId)
    let folderId: string
    try {
      folderId = await resolveLeafFolder(drive, driveFolderId, defect, items, projectId)
    } catch (err) {
      logger.error('ensure folder failed', { err, clientEmail, driveFolderId })
      throw err
    }

    const listed = await listFolderFiles(drive, folderId)
    const deduped = await dedupeFolderFilesByLogicalName(drive, folderId, listed)
    const existing = deduped.files
    const driveFileName = buildDriveFileName(Number(defect.defectNumber ?? 0), storageFileName)
    const bySource = new Set(existing.map((f) => f.sourcePath).filter(Boolean) as string[])
    const byName = new Set(existing.map((f) => f.name))
    if (driveFileAlreadyPresent(bySource, byName, filePath, driveFileName)) {
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
        driveLeafFolderId: folderId,
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
  /** 若指定則只同步這些缺失（拍照後自動上傳用） */
  defectIds?: string[]
  /**
   * 強制補齊：忽略 Firestore「已同步」捷徑，真的對 Drive 掃描／補檔。
   * 手動按鈕應傳 true；背景安靜補齊可 false（但仍會驗證葉層資料夾是否還在）。
   */
  force?: boolean
}) {
  const {
    projectId,
    driveFolderId,
    drive,
    actorLabel,
    requireSharedDrive,
    defectIds,
    force = false,
  } = params
  const defectIdFilter =
    defectIds && defectIds.length > 0 ? new Set(defectIds.map((id) => String(id))) : null

  if (requireSharedDrive) {
    try {
      await assertSharedDriveFolder(drive, driveFolderId, actorLabel ?? null)
    } catch (err) {
      const msg = String((err as Error)?.message ?? err)
      throw new HttpsError(
        'failed-precondition',
        `${msg}\n\n若公司無法使用共用雲端硬碟，請後台先「綁定雲端硬碟擁有者」。`,
      )
    }
  }

  const items = await loadChecklistItems(projectId)
  const defectsSnap = await getFirestore().collection(`projects/${projectId}/defects`).get()
  const bucket = getStorage().bucket()

  let uploaded = 0
  let skipped = 0
  let scanned = 0
  let cleanedVoided = 0
  let cleanedDupFolders = 0
  const errors: string[] = []
  const folderCache = new Map<string, string>()

  for (const doc of defectsSnap.docs) {
    if (defectIdFilter && !defectIdFilter.has(doc.id)) continue
    const defect: DefectRow = { id: doc.id, ...(doc.data() as Omit<DefectRow, 'id'>) }

    // 已刪除（作廢）的缺失：不上傳，並清掉雲端硬碟葉層資料夾（避免測試照片殘留）
    if (defect.status === 'voided') {
      try {
        const result = await trashDefectDriveData({
          drive,
          rootFolderId: driveFolderId,
          defect,
          items,
        })
        if (result.trashedFolder || result.trashedFiles > 0) {
          cleanedVoided += 1
          await getFirestore().doc(`projects/${projectId}/defects/${defect.id}`).set(
            {
              driveLeafFolderId: null,
              driveLastFileId: null,
              driveContentKey: null,
              driveSyncedAt: null,
              driveDeletedAt: new Date().toISOString(),
            },
            { merge: true },
          )
        }
      } catch (err) {
        logger.warn('cleanup voided drive folder failed', {
          projectId,
          defectId: defect.id,
          err,
        })
      }
      continue
    }

    const contentKey = buildDriveContentKey(defect)
    const knownLeafId = String(defect.driveLeafFolderId || '').trim()

    // 非強制：內容指紋相同且葉層資料夾「真的還在 Drive」才可略過。
    // 不可只信 Firestore 標記——使用者手動清空雲端硬碟後標記仍在。
    if (
      !force &&
      knownLeafId &&
      String(defect.driveContentKey || '') === contentKey &&
      String(defect.driveSyncedAt || '')
    ) {
      const meta = await getDriveItemMeta(drive, knownLeafId)
      if (meta) {
        skipped += 1
        continue
      }
      // 葉層已刪／在垃圾桶 → 清掉假標記，下面重建並重傳
      await getFirestore().doc(`projects/${projectId}/defects/${defect.id}`).set(
        {
          driveLeafFolderId: null,
          driveLastFileId: null,
          driveContentKey: null,
          driveSyncedAt: null,
        },
        { merge: true },
      )
      defect.driveLeafFolderId = undefined
      defect.driveLastFileId = undefined
      defect.driveContentKey = undefined
      defect.driveSyncedAt = undefined
    }

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

    const remoteMedia = files.length === 0 ? collectRemoteMedia(defect) : []
    if (files.length === 0 && remoteMedia.length === 0) continue

    // 一筆缺失一個葉層資料夾；不可只用 checklistItemId（同小項多編號會被併進同一資料夾）
    const cacheKey = [
      defect.buildingName,
      defect.floor,
      defect.unitCode,
      defect.categoryName,
      defect.id,
      defect.defectNumber,
      defect.description,
    ].join('|')

    let folderId = folderCache.get(cacheKey)
    if (!folderId) {
      try {
        // 強制：若舊葉層 ID 還在，先確認；已刪則走重建路徑
        if (force && knownLeafId) {
          const meta = await getDriveItemMeta(drive, knownLeafId)
          if (!meta) {
            await getFirestore().doc(`projects/${projectId}/defects/${defect.id}`).set(
              {
                driveLeafFolderId: null,
                driveLastFileId: null,
                driveContentKey: null,
                driveSyncedAt: null,
              },
              { merge: true },
            )
          }
        }
        folderId = await resolveLeafFolder(drive, driveFolderId, defect, items, projectId)
        folderCache.set(cacheKey, folderId)

        // 強制補齊時清掉同編號／舊名（如「#8 未命名缺失」）重複葉層
        if (force) {
          try {
            const item = defect.checklistItemId ? items.get(defect.checklistItemId) : undefined
            const extras = await findAllDefectLeafFolders(drive, driveFolderId, {
              buildingName: String(defect.buildingName ?? '未指定棟別'),
              floor: String(defect.floor ?? '未指定樓層'),
              unitCode: String(defect.unitCode ?? '未指定戶別'),
              categoryName: String(defect.categoryName ?? '未指定大項'),
              itemFolderNames: buildItemFolderNameCandidates({
                itemSortOrder: item?.sortOrder,
                itemDescription: item?.description,
                defectNumber: Number(defect.defectNumber ?? 0),
                defectDescription: String(defect.description ?? ''),
                categoryName: String(defect.categoryName ?? ''),
                area: String(defect.area ?? ''),
              }),
              defectId: defect.id,
              defectNumber: Number(defect.defectNumber ?? 0),
            })
            for (const extraId of extras) {
              if (extraId === folderId) continue
              try {
                await trashDriveItem(drive, extraId)
                cleanedDupFolders += 1
              } catch (err) {
                logger.warn('trash duplicate leaf on force sync failed', { extraId, err })
              }
            }
          } catch (err) {
            logger.warn('dedupe on force sync failed', { defectId: defect.id, err })
          }
        }
      } catch (err) {
        const msg = String((err as Error)?.message ?? err)
        errors.push(`建立資料夾失敗（#${defect.defectNumber}）: ${msg}`)
        if (/storage quota/i.test(msg)) {
          throw new HttpsError(
            'failed-precondition',
            '無法寫入此雲端硬碟資料夾（服務帳戶無個人容量）。請後台先「綁定雲端硬碟擁有者」。',
          )
        }
        continue
      }
    }

    let existing: Awaited<ReturnType<typeof listFolderFiles>>
    try {
      const listed = await listFolderFiles(drive, folderId)
      const deduped = await dedupeFolderFilesByLogicalName(drive, folderId, listed)
      existing = deduped.files
      if (deduped.removed > 0) {
        logger.info('deduped drive files', {
          projectId,
          defectId: defect.id,
          removed: deduped.removed,
        })
      }
    } catch (err) {
      // 葉層剛被刪／權限異常：清標記後下輪再試；本輪記錯
      errors.push(`讀取 Drive 資料夾失敗: ${String(err)}`)
      await getFirestore().doc(`projects/${projectId}/defects/${defect.id}`).set(
        {
          driveLeafFolderId: null,
          driveLastFileId: null,
          driveContentKey: null,
          driveSyncedAt: null,
        },
        { merge: true },
      )
      folderCache.delete(cacheKey)
      continue
    }
    const bySource = new Set(existing.map((f) => f.sourcePath).filter(Boolean) as string[])
    const byName = new Set(existing.map((f) => f.name))

    for (const file of files) {
      scanned += 1
      const storageFileName = file.name.slice(prefix.length) || file.name
      const driveFileName = buildDriveFileName(Number(defect.defectNumber ?? 0), storageFileName)
      if (driveFileAlreadyPresent(bySource, byName, file.name, driveFileName)) {
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
            driveLeafFolderId: folderId,
            driveSyncedAt: new Date().toISOString(),
            driveContentKey: contentKey,
          },
          { merge: true },
        )
      } catch (err) {
        const msg = String((err as Error)?.message ?? err)
        if (/storage quota/i.test(msg)) {
          throw new HttpsError(
            'failed-precondition',
            '服務帳戶無法寫入「我的雲端硬碟」。請後台先「綁定雲端硬碟擁有者」。',
          )
        }
        errors.push(`上傳失敗 ${driveFileName}: ${msg}`)
      }
    }

    // Storage 空但 Firestore 有 http 圖（常見：只用戶別預設位置圖）
    for (const remote of remoteMedia) {
      scanned += 1
      const driveFileName = buildDriveFileName(
        Number(defect.defectNumber ?? 0),
        remote.fileName,
      )
      if (driveFileAlreadyPresent(bySource, byName, remote.sourcePath, driveFileName)) {
        skipped += 1
        continue
      }
      try {
        const fetched = await fetchRemoteImage(remote.url)
        if (!fetched) {
          errors.push(`下載遠端圖失敗 #${defect.defectNumber} ${remote.fileName}`)
          continue
        }
        const fileId = await uploadBufferToDrive({
          drive,
          folderId,
          fileName: driveFileName,
          sourcePath: remote.sourcePath,
          buffer: fetched.buffer,
          contentType: fetched.contentType,
        })
        bySource.add(remote.sourcePath)
        byName.add(driveFileName)
        uploaded += 1
        await getFirestore().doc(`projects/${projectId}/defects/${defect.id}`).set(
          {
            driveLastFileId: fileId,
            driveLeafFolderId: folderId,
            driveSyncedAt: new Date().toISOString(),
            driveContentKey: contentKey,
          },
          { merge: true },
        )
      } catch (err) {
        const msg = String((err as Error)?.message ?? err)
        if (/storage quota/i.test(msg)) {
          throw new HttpsError(
            'failed-precondition',
            '服務帳戶無法寫入「我的雲端硬碟」。請後台先「綁定雲端硬碟擁有者」。',
          )
        }
        errors.push(`遠端圖上傳失敗 ${driveFileName}: ${msg}`)
      }
    }

    // 本次沒有新上傳也標成已同步，之後就略過
    if (files.length + remoteMedia.length > 0) {
      await getFirestore().doc(`projects/${projectId}/defects/${defect.id}`).set(
        {
          driveLeafFolderId: folderId,
          driveSyncedAt: new Date().toISOString(),
          driveContentKey: contentKey,
        },
        { merge: true },
      )
    }
  }

  logger.info('manual drive sync done', {
    projectId,
    force,
    uploaded,
    skipped,
    scanned,
    cleanedVoided,
    cleanedDupFolders,
    errorCount: errors.length,
    actorLabel,
  })

  return {
    ok: true,
    projectId,
    uploaded,
    skipped,
    scanned,
    cleanedVoided,
    cleanedDupFolders,
    force,
    errors: errors.slice(0, 12),
    clientEmail: actorLabel ?? null,
    folderLayout: '棟別 / 樓層 / 戶別 / 大項 / #編號 小項名稱 備註',
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

/**
 * 同步照片到雲端硬碟。
 * 優先使用「專案擁有者」refresh token（現場免登 Google）；
 * 否則退回服務帳戶（僅共用雲端硬碟）。
 */
export const syncProjectPhotosToDrive = onCall(
  {
    region: 'asia-east1',
    memory: '1GiB',
    timeoutSeconds: 540,
    cors: true,
    invoker: 'public',
    secrets: [googleOAuthClientSecret],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', '請先登入後再同步雲端硬碟')
    }
    const projectId = String(request.data?.projectId ?? '').trim()
    if (!projectId) throw new HttpsError('invalid-argument', '缺少 projectId')
    const rawDefectIds = request.data?.defectIds
    const defectIds = Array.isArray(rawDefectIds)
      ? rawDefectIds.map((id: unknown) => String(id ?? '').trim()).filter(Boolean)
      : undefined
    const force = Boolean(request.data?.force)

    const projectSnap = await getFirestore().doc(`projects/${projectId}`).get()
    if (!projectSnap.exists) throw new HttpsError('not-found', '找不到此專案')
    const driveFolderId = requireDriveFolderId(projectSnap.get('driveFolderId'))

    const ownerDrive = await tryGetDriveClientFromOwner({
      projectId,
      clientSecret: googleOAuthClientSecret.value(),
    })
    if (ownerDrive) {
      return runPhotoSync({
        projectId,
        driveFolderId,
        drive: ownerDrive.drive,
        actorLabel: ownerDrive.email ? `owner:${ownerDrive.email}` : 'owner-oauth',
        requireSharedDrive: false,
        defectIds,
        force,
      })
    }

    const { drive, clientEmail } = await getDriveClient()
    return runPhotoSync({
      projectId,
      driveFolderId,
      drive,
      actorLabel: clientEmail,
      requireSharedDrive: true,
      defectIds,
      force,
    })
  },
)

/** 後台：用授權碼綁定專案雲端硬碟擁有者（只需一次） */
export const connectProjectDriveOwner = onCall(
  {
    region: 'asia-east1',
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: true,
    invoker: 'public',
    secrets: [googleOAuthClientSecret],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', '請先登入後再綁定雲端硬碟')
    }
    const projectId = String(request.data?.projectId ?? '').trim()
    const code = String(request.data?.code ?? '').trim()
    if (!projectId) throw new HttpsError('invalid-argument', '缺少 projectId')
    if (!code) throw new HttpsError('invalid-argument', '缺少 Google 授權碼')

    const projectSnap = await getFirestore().doc(`projects/${projectId}`).get()
    if (!projectSnap.exists) throw new HttpsError('not-found', '找不到此專案')
    const driveFolderId = requireDriveFolderId(projectSnap.get('driveFolderId'))

    let exchanged: Awaited<ReturnType<typeof exchangeAuthCode>>
    try {
      exchanged = await exchangeAuthCode({
        code,
        clientSecret: googleOAuthClientSecret.value(),
      })
    } catch (err) {
      throw new HttpsError(
        'invalid-argument',
        `Google 授權碼兌換失敗：${String((err as Error)?.message ?? err)}`,
      )
    }

    const existing = await loadDriveOwner(projectId)
    const refreshToken = exchanged.refreshToken || existing?.refreshToken || null
    if (!refreshToken) {
      throw new HttpsError(
        'failed-precondition',
        '未取得長期授權（refresh token）。請到 https://myaccount.google.com/permissions 移除此應用程式存取權後，再按一次「綁定雲端硬碟擁有者」。',
      )
    }

    const oauth2 = createOAuth2Client(googleOAuthClientSecret.value())
    oauth2.setCredentials(
      exchanged.accessToken
        ? { access_token: exchanged.accessToken, refresh_token: refreshToken }
        : { refresh_token: refreshToken },
    )
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
        `授權的 Google 帳號無法存取綁定資料夾。請用擁有／可編輯該資料夾的帳號授權。（${String(
          (err as Error)?.message ?? err,
        )}）`,
      )
    }

    await saveDriveOwner(projectId, {
      refreshToken,
      email: exchanged.email || existing?.email || null,
      connectedAt: new Date().toISOString(),
      connectedByUid: request.auth.uid,
      connectedByEmail: request.auth.token.email ? String(request.auth.token.email) : null,
    })

    return {
      ok: true,
      projectId,
      email: exchanged.email || existing?.email || null,
      reusedRefreshToken: !exchanged.refreshToken,
    }
  },
)

/** 後台：解除專案雲端硬碟擁有者綁定 */
export const disconnectProjectDriveOwner = onCall(
  {
    region: 'asia-east1',
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: true,
    invoker: 'public',
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', '請先登入')
    }
    const projectId = String(request.data?.projectId ?? '').trim()
    if (!projectId) throw new HttpsError('invalid-argument', '缺少 projectId')
    await clearDriveOwner(projectId)
    return { ok: true, projectId }
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
    const rawDefectIds = request.data?.defectIds
    const defectIds = Array.isArray(rawDefectIds)
      ? rawDefectIds.map((id: unknown) => String(id ?? '').trim()).filter(Boolean)
      : undefined
    const force = Boolean(request.data?.force)

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
        `無法存取綁定的雲端硬碟資料夾。請確認：① 授權的是「擁有／可編輯該資料夾」的同一個 Google 帳號；② OAuth 範圍含完整 Drive（非僅 drive.file）。（${String(
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
      defectIds,
      force,
    })
  },
)

/** 刪除缺失時，把對應雲端硬碟葉層資料夾（與檔案）移到垃圾桶 */
export const deleteDefectPhotosFromDriveAsUser = onCall(
  {
    region: 'asia-east1',
    memory: '512MiB',
    timeoutSeconds: 120,
    cors: true,
    invoker: 'public',
    secrets: [googleOAuthClientSecret],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', '請先登入後再同步刪除雲端硬碟')
    }

    const projectId = String(request.data?.projectId ?? '').trim()
    const defectId = String(request.data?.defectId ?? '').trim()
    const accessToken = String(request.data?.accessToken ?? '').trim()
    if (!projectId) throw new HttpsError('invalid-argument', '缺少 projectId')
    if (!defectId) throw new HttpsError('invalid-argument', '缺少 defectId')

    const projectSnap = await getFirestore().doc(`projects/${projectId}`).get()
    if (!projectSnap.exists) throw new HttpsError('not-found', '找不到此專案')
    const driveFolderId = projectSnap.get('driveFolderId') as string | undefined
    if (!driveFolderId) {
      return {
        ok: true,
        skipped: true,
        reason: 'project-has-no-drive-folder',
        trashedFolder: false,
        trashedFiles: 0,
      }
    }

    const defectSnap = await getFirestore().doc(`projects/${projectId}/defects/${defectId}`).get()
    if (!defectSnap.exists) throw new HttpsError('not-found', '找不到此缺失')
    const defect = { id: defectId, ...(defectSnap.data() as Omit<DefectRow, 'id'>) }

    let drive: DriveClient
    if (accessToken) {
      const oauth2 = new google.auth.OAuth2()
      oauth2.setCredentials({ access_token: accessToken })
      drive = google.drive({ version: 'v3', auth: oauth2 })
    } else {
      const owner = await getDriveClientFromOwner({
        projectId,
        clientSecret: googleOAuthClientSecret.value(),
      })
      drive = owner.drive
    }

    try {
      await drive.files.get({
        fileId: driveFolderId,
        fields: 'id,name',
        supportsAllDrives: true,
      })
    } catch (err) {
      throw new HttpsError(
        'permission-denied',
        `無法存取綁定的雲端硬碟資料夾，無法同步刪除。（${String((err as Error)?.message ?? err)}）`,
      )
    }

    const items = await loadChecklistItems(projectId)
    const result = await trashDefectDriveData({
      drive,
      rootFolderId: driveFolderId,
      defect,
      items,
    })

    await getFirestore().doc(`projects/${projectId}/defects/${defectId}`).set(
      {
        driveLeafFolderId: null,
        driveLastFileId: null,
        driveDeletedAt: new Date().toISOString(),
      },
      { merge: true },
    )

    logger.info('trashed defect drive folder', {
      projectId,
      defectId,
      ...result,
    })

    return {
      ok: true,
      skipped: false,
      ...result,
    }
  },
)

async function resolveDesiredLeafName(
  defect: DefectRow,
  items: Map<string, ChecklistItemRow>,
): Promise<string> {
  const item = defect.checklistItemId ? items.get(defect.checklistItemId) : undefined
  return buildItemFolderName({
    itemSortOrder: item?.sortOrder,
    itemDescription: item?.description,
    defectNumber: Number(defect.defectNumber ?? 0),
    defectDescription: String(defect.description ?? ''),
    categoryName: String(defect.categoryName ?? ''),
    area: String(defect.area ?? ''),
  })
}

/**
 * 單筆缺失對齊雲端硬碟：
 * - 已作廢 → 刪資料夾
 * - 否則改名／搬到正確路徑，並補傳／清掉多餘照片
 */
async function reconcileOneDefectOnDrive(params: {
  projectId: string
  driveFolderId: string
  drive: DriveClient
  defect: DefectRow
  items: Map<string, ChecklistItemRow>
}): Promise<{
  ok: boolean
  action: 'trashed' | 'synced' | 'skipped'
  renamed?: boolean
  moved?: boolean
  uploaded?: number
  removed?: number
  folderId?: string | null
  reason?: string
}> {
  const { projectId, driveFolderId, drive, defect, items } = params
  const contentKey = buildDriveContentKey(defect)

  if (defect.status === 'voided') {
    const result = await trashDefectDriveData({
      drive,
      rootFolderId: driveFolderId,
      defect,
      items,
    })
    await getFirestore().doc(`projects/${projectId}/defects/${defect.id}`).set(
      {
        driveLeafFolderId: null,
        driveLastFileId: null,
        driveDeletedAt: new Date().toISOString(),
        driveContentKey: contentKey,
      },
      { merge: true },
    )
    return {
      ok: true,
      action: 'trashed',
      removed: result.trashedFiles + (result.trashedFolder ? 1 : 0),
      folderId: null,
    }
  }

  const desiredName = await resolveDesiredLeafName(defect, items)
  let folderId = String(defect.driveLeafFolderId || '').trim() || null

  // 內容指紋相同且葉層資料夾仍在 → 直接略過，不再重存
  if (
    folderId &&
    String(defect.driveContentKey || '') === contentKey &&
    String(defect.driveSyncedAt || '')
  ) {
    const meta = await getDriveItemMeta(drive, folderId)
    if (meta) {
      return {
        ok: true,
        action: 'skipped',
        reason: 'unchanged-content',
        folderId,
        uploaded: 0,
        removed: 0,
      }
    }
    folderId = null
  }

  const categoryId = await ensureCategoryFolderPath(drive, driveFolderId, {
    buildingName: String(defect.buildingName ?? '未指定棟別'),
    floor: String(defect.floor ?? '未指定樓層'),
    unitCode: String(defect.unitCode ?? '未指定戶別'),
    categoryName: String(defect.categoryName ?? '未指定大項'),
  })

  let renamed = false
  let moved = false

  if (folderId) {
    const meta = await getDriveItemMeta(drive, folderId)
    if (!meta) {
      folderId = null
    } else {
      const parentId = meta.parents[0] || ''
      if (parentId && parentId !== categoryId) {
        await moveDriveItem(drive, folderId, categoryId, parentId)
        moved = true
      }
      if (meta.name !== desiredName) {
        await renameDriveItem(drive, folderId, desiredName)
        renamed = true
      }
    }
  }

  if (!folderId) {
    folderId = await ensureDefectFolderPath(drive, driveFolderId, {
      buildingName: String(defect.buildingName ?? '未指定棟別'),
      floor: String(defect.floor ?? '未指定樓層'),
      unitCode: String(defect.unitCode ?? '未指定戶別'),
      categoryName: String(defect.categoryName ?? '未指定大項'),
      itemFolderName: desiredName,
      defectId: defect.id,
      projectId,
    })
  } else {
    // 既有葉層：清掉同名／同編號的重複資料夾
    try {
      const item = defect.checklistItemId ? items.get(defect.checklistItemId) : undefined
      const extras = await findAllDefectLeafFolders(drive, driveFolderId, {
        buildingName: String(defect.buildingName ?? '未指定棟別'),
        floor: String(defect.floor ?? '未指定樓層'),
        unitCode: String(defect.unitCode ?? '未指定戶別'),
        categoryName: String(defect.categoryName ?? '未指定大項'),
        itemFolderNames: buildItemFolderNameCandidates({
          itemSortOrder: item?.sortOrder,
          itemDescription: item?.description,
          defectNumber: Number(defect.defectNumber ?? 0),
          defectDescription: String(defect.description ?? ''),
          categoryName: String(defect.categoryName ?? ''),
          area: String(defect.area ?? ''),
        }),
        defectId: defect.id,
        defectNumber: Number(defect.defectNumber ?? 0),
      })
      for (const extraId of extras) {
        if (extraId === folderId) continue
        try {
          await trashDriveItem(drive, extraId)
        } catch (err) {
          logger.warn('trash duplicate leaf failed', { extraId, err })
        }
      }
    } catch (err) {
      logger.warn('dedupe leaf folders failed', { defectId: defect.id, err })
    }
  }

  const prefix = `projects/${projectId}/defects/${defect.id}/`
  const bucket = getStorage().bucket()
  const [listed] = await bucket.getFiles({ prefix })
  const storageFiles = listed.filter((f) => f.name && !f.name.endsWith('/'))
  const storagePaths = new Set(storageFiles.map((f) => f.name))
  const remoteMedia = collectRemoteMedia(defect)
  const remoteSourcePaths = new Set(remoteMedia.map((r) => r.sourcePath))

  const existingListed = await listFolderFiles(drive, folderId)
  // 先清同名／同主體重複檔（歷史競態堆出來的 #59_photo-00.jpg × N）
  const deduped = await dedupeFolderFilesByLogicalName(drive, folderId, existingListed)
  const existing = deduped.files
  let uploaded = 0
  let removed = deduped.removed
  let lastFileId: string | null = String(defect.driveLastFileId || '').trim() || null

  // 只清「確定過期」的檔；無 sourcePath 的舊檔不刪，避免誤刪後又重存
  for (const f of existing) {
    if (!f.sourcePath) continue
    if (storagePaths.has(f.sourcePath)) continue
    if (f.sourcePath.startsWith('remote:')) {
      // Storage 已有實體檔 → remote 備份可清；remote 仍對應目前 URL 且無 Storage 則保留
      if (storageFiles.length === 0 && remoteSourcePaths.has(f.sourcePath)) continue
    }
    try {
      await trashDriveItem(drive, f.id)
      removed += 1
    } catch (err) {
      logger.warn('trash obsolete drive file failed', { fileId: f.id, err })
    }
  }

  const afterTrash = removed > deduped.removed ? await listFolderFiles(drive, folderId) : existing
  const bySource = new Set(afterTrash.map((f) => f.sourcePath).filter(Boolean) as string[])
  const byName = new Set(afterTrash.map((f) => f.name))

  for (const file of storageFiles) {
    const storageFileName = file.name.slice(prefix.length) || file.name
    const driveFileName = buildDriveFileName(Number(defect.defectNumber ?? 0), storageFileName)
    if (driveFileAlreadyPresent(bySource, byName, file.name, driveFileName)) continue
    const [buffer] = await file.download()
    const fileId = await uploadBufferToDrive({
      drive,
      folderId,
      fileName: driveFileName,
      sourcePath: file.name,
      buffer,
      contentType: file.metadata?.contentType || 'image/jpeg',
    })
    uploaded += 1
    lastFileId = fileId
    bySource.add(file.name)
    byName.add(driveFileName)
  }

  // Storage 尚無檔時，把 Firestore 上的 http 預設圖補上 Drive（已有同類檔則略過）
  if (storageFiles.length === 0) {
    for (const remote of remoteMedia) {
      const driveFileName = buildDriveFileName(
        Number(defect.defectNumber ?? 0),
        remote.fileName,
      )
      if (driveFileAlreadyPresent(bySource, byName, remote.sourcePath, driveFileName)) {
        continue
      }
      const fetched = await fetchRemoteImage(remote.url)
      if (!fetched) continue
      const fileId = await uploadBufferToDrive({
        drive,
        folderId,
        fileName: driveFileName,
        sourcePath: remote.sourcePath,
        buffer: fetched.buffer,
        contentType: fetched.contentType,
      })
      uploaded += 1
      lastFileId = fileId
      bySource.add(remote.sourcePath)
      byName.add(driveFileName)
    }
  }

  // 無變更就不要反覆寫 Firestore（避免又觸發同步）
  const unchanged =
    uploaded === 0 && removed === 0 && !renamed && !moved && String(defect.driveContentKey || '') === contentKey
  if (!unchanged) {
    await getFirestore().doc(`projects/${projectId}/defects/${defect.id}`).set(
      {
        driveLeafFolderId: folderId,
        driveLastFileId: lastFileId,
        driveSyncedAt: new Date().toISOString(),
        driveContentKey: contentKey,
      },
      { merge: true },
    )
  } else if (!defect.driveSyncedAt || !defect.driveContentKey) {
    await getFirestore().doc(`projects/${projectId}/defects/${defect.id}`).set(
      {
        driveLeafFolderId: folderId,
        driveLastFileId: lastFileId,
        driveSyncedAt: defect.driveSyncedAt || new Date().toISOString(),
        driveContentKey: contentKey,
      },
      { merge: true },
    )
  }

  return {
    ok: true,
    action: unchanged ? 'skipped' : 'synced',
    reason: unchanged ? 'already-on-drive' : undefined,
    renamed,
    moved,
    uploaded,
    removed,
    folderId,
  }
}

/** 僅 drive／同步雜訊欄位變更時略過，避免已存過的內容反覆重寫 */
function onlyDriveMetaChanged(
  before: DocumentData | undefined,
  after: DocumentData | undefined,
): boolean {
  if (!before || !after) return false
  const ignore = new Set([
    'driveLeafFolderId',
    'driveLastFileId',
    'driveSyncedAt',
    'driveDeletedAt',
    'driveContentKey',
    'driveActivityAt',
    'syncState',
    'updatedAt',
    'clientUpdatedAt',
  ])
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const k of keys) {
    if (ignore.has(k)) continue
    if (JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null)) {
      return false
    }
  }
  return true
}

/**
 * 缺失新增／修改／作廢時：只標記「待批次同步」，不再即時寫入 Drive。
 * 即時對齊會讓 Functions 費用隨拍照量暴衝；改由每日排程／手動強制補齊處理。
 */
export const onDefectWrittenAutoDrive = onDocumentWritten(
  {
    document: 'projects/{projectId}/defects/{defectId}',
    region: 'asia-east1',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (event) => {
    const projectId = String(event.params.projectId || '')
    const defectId = String(event.params.defectId || '')
    if (!projectId || !defectId) return

    const before = event.data?.before.exists ? event.data.before.data() : undefined
    const after = event.data?.after.exists ? event.data.after.data() : undefined
    if (!after && !before) return
    if (after && before && onlyDriveMetaChanged(before, after)) return

    const projectSnap = await getFirestore().doc(`projects/${projectId}`).get()
    if (!projectSnap.exists) return
    const driveFolderId = String(projectSnap.get('driveFolderId') || '').trim()
    if (!driveFolderId) {
      logger.info('auto-drive mark skip: no folder', { projectId, defectId })
      return
    }
    if (!projectSnap.get('driveOwnerConnected')) {
      logger.info('auto-drive mark skip: owner not connected', { projectId, defectId })
      return
    }

    const nowIso = new Date().toISOString()
    await getFirestore()
      .doc(`projects/${projectId}`)
      .set(
        {
          driveActivityAt: nowIso,
          drivePendingSyncAt: nowIso,
        },
        { merge: true },
      )
    logger.info('auto-drive marked pending (no realtime upload)', { projectId, defectId })
  },
)

/** 編輯／刪除後即時對齊單筆缺失的雲端硬碟資料夾 */
export const reconcileDefectOnDrive = onCall(
  {
    region: 'asia-east1',
    memory: '512MiB',
    timeoutSeconds: 180,
    cors: true,
    invoker: 'public',
    secrets: [googleOAuthClientSecret],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', '請先登入')
    }
    const projectId = String(request.data?.projectId ?? '').trim()
    const defectId = String(request.data?.defectId ?? '').trim()
    if (!projectId) throw new HttpsError('invalid-argument', '缺少 projectId')
    if (!defectId) throw new HttpsError('invalid-argument', '缺少 defectId')

    const projectSnap = await getFirestore().doc(`projects/${projectId}`).get()
    if (!projectSnap.exists) throw new HttpsError('not-found', '找不到此專案')
    const driveFolderId = projectSnap.get('driveFolderId') as string | undefined
    if (!driveFolderId) {
      return { ok: true, skipped: true, reason: 'project-has-no-drive-folder' }
    }

    const ownerDrive = await tryGetDriveClientFromOwner({
      projectId,
      clientSecret: googleOAuthClientSecret.value(),
    })
    if (!ownerDrive) {
      return { ok: true, skipped: true, reason: 'drive-owner-not-connected' }
    }

    const defectSnap = await getFirestore().doc(`projects/${projectId}/defects/${defectId}`).get()
    if (!defectSnap.exists) throw new HttpsError('not-found', '找不到此缺失')
    const defect = { id: defectId, ...(defectSnap.data() as Omit<DefectRow, 'id'>) }
    const items = await loadChecklistItems(projectId)

    const result = await reconcileOneDefectOnDrive({
      projectId,
      driveFolderId,
      drive: ownerDrive.drive,
      defect,
      items,
    })

    logger.info('reconcile defect on drive', { projectId, defectId, ...result })
    return { skipped: false, ...result }
  },
)

function toMillis(value: unknown): number {
  if (!value) return 0
  if (typeof value === 'string') {
    const t = Date.parse(value)
    return Number.isFinite(t) ? t : 0
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'toMillis' in value &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  ) {
    try {
      return Number((value as { toMillis: () => number }).toMillis()) || 0
    } catch {
      return 0
    }
  }
  const anyVal = value as { _seconds?: number; seconds?: number }
  if (typeof anyVal._seconds === 'number') return anyVal._seconds * 1000
  if (typeof anyVal.seconds === 'number') return anyVal.seconds * 1000
  return 0
}

/** 每日批次：清理作廢殘留，並把尚未寫入 Drive 的有效缺失補上（取代即時同步） */
export const cleanupVoidedDefectDrives = onSchedule(
  {
    region: 'asia-east1',
    schedule: 'every 24 hours',
    memory: '1GiB',
    timeoutSeconds: 540,
    secrets: [googleOAuthClientSecret],
  },
  async () => {
    // 只掃「近 36 小時有查驗／待同步標記」的專案，避免全站空轉燒錢
    const ACTIVITY_WINDOW_MS = 36 * 60 * 60 * 1000
    const now = Date.now()
    const cutoff = now - ACTIVITY_WINDOW_MS
    /** 單一專案每輪最多對齊筆數，避免超時；剩下明天再補或手動強制補齊 */
    const MAX_SYNC_PER_PROJECT = 80

    const projectsSnap = await getFirestore()
      .collection('projects')
      .where('driveOwnerConnected', '==', true)
      .get()

    let cleaned = 0
    let backfilled = 0
    let skippedIdle = 0
    for (const projectDoc of projectsSnap.docs) {
      const projectId = projectDoc.id
      const driveFolderId = String(projectDoc.get('driveFolderId') || '').trim()
      if (!driveFolderId) continue

      const activityAt = Math.max(
        toMillis(projectDoc.get('driveActivityAt')),
        toMillis(projectDoc.get('drivePendingSyncAt')),
        toMillis(projectDoc.get('updatedAt')),
      )
      if (!activityAt || activityAt < cutoff) {
        skippedIdle += 1
        continue
      }

      const ownerDrive = await tryGetDriveClientFromOwner({
        projectId,
        clientSecret: googleOAuthClientSecret.value(),
      })
      if (!ownerDrive) continue

      const items = await loadChecklistItems(projectId)

      const voidedSnap = await getFirestore()
        .collection(`projects/${projectId}/defects`)
        .where('status', '==', 'voided')
        .limit(200)
        .get()

      for (const doc of voidedSnap.docs) {
        const data = doc.data()
        const alreadyCleaned = Boolean(String(data.driveDeletedAt || '').trim())
        const hasDriveHint =
          Boolean(String(data.driveLeafFolderId || '').trim()) ||
          Boolean(String(data.driveLastFileId || '').trim())
        // 已標記清過且無殘留 hint → 略過
        if (alreadyCleaned && !hasDriveHint) continue
        // 完全沒 hint、也沒編號可查 → 略過
        if (!hasDriveHint && !Number(data.defectNumber)) continue

        const defect = { id: doc.id, ...(data as Omit<DefectRow, 'id'>) }
        try {
          const result = await trashDefectDriveData({
            drive: ownerDrive.drive,
            rootFolderId: driveFolderId,
            defect,
            items,
          })
          if (result.trashedFolder || result.trashedFiles > 0 || !alreadyCleaned) {
            cleaned += 1
            await doc.ref.set(
              {
                driveLeafFolderId: null,
                driveLastFileId: null,
                driveDeletedAt: new Date().toISOString(),
              },
              { merge: true },
            )
          }
        } catch (err) {
          logger.warn('scheduled void cleanup failed', { projectId, defectId: doc.id, err })
        }
      }

      // 批次補齊：尚未同步、或內容指紋已變的有效缺失
      const pendingSnap = await getFirestore()
        .collection(`projects/${projectId}/defects`)
        .limit(300)
        .get()
      let syncedThisProject = 0
      for (const doc of pendingSnap.docs) {
        if (syncedThisProject >= MAX_SYNC_PER_PROJECT) break
        const data = doc.data()
        const defect = { id: doc.id, ...(data as Omit<DefectRow, 'id'>) }
        if (defect.status === 'voided') continue
        const contentKey = buildDriveContentKey(defect)
        const neverSynced = !String(defect.driveSyncedAt || '').trim()
        const contentChanged = String(defect.driveContentKey || '') !== contentKey
        if (!neverSynced && !contentChanged) continue
        try {
          const result = await reconcileOneDefectOnDrive({
            projectId,
            driveFolderId,
            drive: ownerDrive.drive,
            defect,
            items,
          })
          syncedThisProject += 1
          if (result.action === 'synced') {
            backfilled += 1
          }
        } catch (err) {
          syncedThisProject += 1
          logger.warn('scheduled drive backfill failed', { projectId, defectId: doc.id, err })
        }
      }

      // 本輪有掃過就清掉 pending 標記（剩餘未同步會因 driveContentKey 在下輪再補）
      await projectDoc.ref.set(
        {
          driveLastBatchSyncAt: new Date().toISOString(),
        },
        { merge: true },
      )
    }

    logger.info('daily drive batch done', {
      cleaned,
      backfilled,
      skippedIdle,
      projects: projectsSnap.size,
      windowHours: 36,
      maxSyncPerProject: MAX_SYNC_PER_PROJECT,
    })
  },
)
