import type { drive_v3 } from 'googleapis'
import { google } from 'googleapis'

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'

export type DriveClient = drive_v3.Drive

/** 確認目標資料夾位於「共用雲端硬碟」（服務帳戶沒有個人雲端配額） */
export async function assertSharedDriveFolder(
  drive: DriveClient,
  folderId: string,
  clientEmail: string | null,
): Promise<{ driveId: string; name: string }> {
  const meta = await drive.files.get({
    fileId: folderId,
    fields: 'id, name, mimeType, driveId, parents, capabilities',
    supportsAllDrives: true,
  })
  const driveId = meta.data.driveId
  const name = meta.data.name || folderId
  if (!driveId) {
    throw new Error(
      `綁定的資料夾「${name}」不在共用雲端硬碟內。` +
        `Google 規定服務帳戶沒有個人雲端硬碟容量，無法寫入「我的雲端硬碟」。` +
        `請改為：1) 建立「共用雲端硬碟」2) 把服務帳戶 ${clientEmail || '（執行帳戶）'} 加成「內容管理員」` +
        `3) 在共用雲端硬碟內建立／放入查驗資料夾 4) 重新貼上該資料夾網址並儲存。`,
    )
  }
  return { driveId, name }
}

export async function getDriveClient(): Promise<{
  drive: DriveClient
  clientEmail: string | null
}> {
  const auth = new google.auth.GoogleAuth({ scopes: [DRIVE_SCOPE] })
  const drive = google.drive({ version: 'v3', auth })
  let clientEmail: string | null = null
  try {
    const creds = await auth.getCredentials()
    clientEmail = creds.client_email ?? null
  } catch {
    clientEmail = null
  }
  if (!clientEmail) {
    try {
      const projectId = await auth.getProjectId()
      if (projectId) clientEmail = `${projectId}@appspot.gserviceaccount.com`
    } catch {
      /* ignore */
    }
  }
  return { drive, clientEmail }
}

/** Drive 資料夾／檔名非法字元清理 */
export function sanitizeDriveName(name: string, fallback = '未命名'): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return cleaned || fallback
}

export async function findChildFolder(
  drive: DriveClient,
  parentId: string,
  name: string,
): Promise<string | null> {
  const all = await findChildFoldersByName(drive, parentId, name)
  return all[0]?.id ?? null
}

export async function findChildFoldersByName(
  drive: DriveClient,
  parentId: string,
  name: string,
): Promise<Array<{ id: string; name: string }>> {
  const safe = sanitizeDriveName(name)
  const escaped = safe.replace(/'/g, "\\'")
  const out: Array<{ id: string; name: string }> = []
  let pageToken: string | undefined
  do {
    const res = await drive.files.list({
      q: `'${parentId}' in parents and name = '${escaped}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
      fields: 'nextPageToken, files(id, name, createdTime)',
      pageSize: 100,
      pageToken,
      orderBy: 'createdTime',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives',
    })
    for (const f of res.data.files ?? []) {
      if (!f.id || !f.name) continue
      out.push({ id: f.id, name: f.name })
    }
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)
  return out
}

export async function listChildFolders(
  drive: DriveClient,
  parentId: string,
): Promise<Array<{ id: string; name: string; defectId?: string }>> {
  const out: Array<{ id: string; name: string; defectId?: string }> = []
  let pageToken: string | undefined
  do {
    const res = await drive.files.list({
      q: `'${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
      fields: 'nextPageToken, files(id, name, appProperties, createdTime)',
      pageSize: 200,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives',
    })
    for (const f of res.data.files ?? []) {
      if (!f.id || !f.name) continue
      out.push({
        id: f.id,
        name: f.name,
        defectId: f.appProperties?.defectId || undefined,
      })
    }
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)
  return out
}

async function findChildFolderByDefectId(
  drive: DriveClient,
  parentId: string,
  defectId: string,
): Promise<{ id: string; name: string } | null> {
  const safeId = defectId.replace(/'/g, "\\'")
  const res = await drive.files.list({
    q:
      `'${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false` +
      ` and appProperties has { key='defectId' and value='${safeId}' }`,
    fields: 'files(id, name)',
    pageSize: 10,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'allDrives',
  })
  const f = res.data.files?.[0]
  if (!f?.id) return null
  return { id: f.id, name: f.name || '' }
}

async function setFolderDefectProps(
  drive: DriveClient,
  folderId: string,
  props: { defectId: string; projectId?: string },
): Promise<void> {
  await drive.files.update({
    fileId: folderId,
    requestBody: {
      appProperties: {
        defectId: props.defectId,
        ...(props.projectId ? { projectId: props.projectId } : {}),
      },
    },
    supportsAllDrives: true,
  })
}

/** 同名資料夾只留一個，其餘丟垃圾桶（解決競態重複） */
export async function dedupeChildFoldersByName(
  drive: DriveClient,
  parentId: string,
  name: string,
  keepId?: string | null,
): Promise<string | null> {
  const all = await findChildFoldersByName(drive, parentId, name)
  if (all.length === 0) return null
  const keep = keepId && all.some((f) => f.id === keepId) ? keepId : all[0].id
  for (const f of all) {
    if (f.id === keep) continue
    try {
      await trashDriveItem(drive, f.id)
    } catch {
      /* ignore */
    }
  }
  return keep
}

export async function ensureChildFolder(
  drive: DriveClient,
  parentId: string,
  name: string,
): Promise<string> {
  const safe = sanitizeDriveName(name)
  const existing = await findChildFoldersByName(drive, parentId, safe)
  if (existing.length > 0) {
    if (existing.length > 1) {
      return (await dedupeChildFoldersByName(drive, parentId, safe, existing[0].id)) || existing[0].id
    }
    return existing[0].id
  }

  const created = await drive.files.create({
    requestBody: {
      name: safe,
      mimeType: FOLDER_MIME,
      parents: [parentId],
    },
    fields: 'id',
    supportsAllDrives: true,
  })
  if (!created.data.id) throw new Error(`建立資料夾失敗：${safe}`)

  // 競態下可能同時新建 → 再建一次去重
  const kept = await dedupeChildFoldersByName(drive, parentId, safe, created.data.id)
  return kept || created.data.id
}

/**
 * 葉層（一筆缺失一個資料夾）：以 defectId 為準，避免同名重複與刪不乾淨。
 */
export async function ensureDefectLeafFolder(
  drive: DriveClient,
  categoryFolderId: string,
  itemFolderName: string,
  meta: { defectId: string; projectId?: string },
): Promise<string> {
  const safe = sanitizeDriveName(itemFolderName || '00_未指定細項')
  const byId = await findChildFolderByDefectId(drive, categoryFolderId, meta.defectId)
  if (byId) {
    if (byId.name !== safe) {
      try {
        await renameDriveItem(drive, byId.id, safe)
      } catch {
        /* ignore rename race */
      }
    }
    await dedupeChildFoldersByName(drive, categoryFolderId, safe, byId.id)
    return byId.id
  }

  const sameName = await findChildFoldersByName(drive, categoryFolderId, safe)
  if (sameName.length > 0) {
    const keep = sameName[0].id
    try {
      await setFolderDefectProps(drive, keep, meta)
    } catch {
      /* ignore */
    }
    await dedupeChildFoldersByName(drive, categoryFolderId, safe, keep)
    return keep
  }

  const created = await drive.files.create({
    requestBody: {
      name: safe,
      mimeType: FOLDER_MIME,
      parents: [categoryFolderId],
      appProperties: {
        defectId: meta.defectId,
        ...(meta.projectId ? { projectId: meta.projectId } : {}),
      },
    },
    fields: 'id',
    supportsAllDrives: true,
  })
  if (!created.data.id) throw new Error(`建立資料夾失敗：${safe}`)
  const kept = await dedupeChildFoldersByName(drive, categoryFolderId, safe, created.data.id)
  return kept || created.data.id
}

/** 棟別／樓層／戶別／大項／小項（編號開頭） */
export async function ensureDefectFolderPath(
  drive: DriveClient,
  rootFolderId: string,
  parts: {
    buildingName: string
    floor: string
    unitCode: string
    categoryName: string
    itemFolderName: string
    defectId?: string
    projectId?: string
  },
): Promise<string> {
  const buildingId = await ensureChildFolder(drive, rootFolderId, parts.buildingName || '未指定棟別')
  const floorId = await ensureChildFolder(drive, buildingId, parts.floor || '未指定樓層')
  const unitId = await ensureChildFolder(drive, floorId, parts.unitCode || '未指定戶別')
  const categoryId = await ensureChildFolder(drive, unitId, parts.categoryName || '未指定大項')
  if (parts.defectId) {
    return ensureDefectLeafFolder(drive, categoryId, parts.itemFolderName || '00_未指定細項', {
      defectId: parts.defectId,
      projectId: parts.projectId,
    })
  }
  return ensureChildFolder(drive, categoryId, parts.itemFolderName || '00_未指定細項')
}

/** 只查找大項層（不建立） */
export async function findCategoryFolderPath(
  drive: DriveClient,
  rootFolderId: string,
  parts: {
    buildingName: string
    floor: string
    unitCode: string
    categoryName: string
  },
): Promise<string | null> {
  const buildingId = await findChildFolder(drive, rootFolderId, parts.buildingName || '未指定棟別')
  if (!buildingId) return null
  const floorId = await findChildFolder(drive, buildingId, parts.floor || '未指定樓層')
  if (!floorId) return null
  const unitId = await findChildFolder(drive, floorId, parts.unitCode || '未指定戶別')
  if (!unitId) return null
  return findChildFolder(drive, unitId, parts.categoryName || '未指定大項')
}

/** 只查找、不建立：回傳葉層資料夾 id（找不到則 null） */
export async function findDefectFolderPath(
  drive: DriveClient,
  rootFolderId: string,
  parts: {
    buildingName: string
    floor: string
    unitCode: string
    categoryName: string
    /** 可能的葉層名稱（含舊版命名） */
    itemFolderNames: string[]
    defectId?: string
  },
): Promise<string | null> {
  const categoryId = await findCategoryFolderPath(drive, rootFolderId, parts)
  if (!categoryId) return null

  if (parts.defectId) {
    const byId = await findChildFolderByDefectId(drive, categoryId, parts.defectId)
    if (byId) return byId.id
  }

  const tried = new Set<string>()
  for (const raw of parts.itemFolderNames) {
    const name = sanitizeDriveName(raw || '')
    if (!name || tried.has(name)) continue
    tried.add(name)
    const leafId = await findChildFolder(drive, categoryId, name)
    if (leafId) return leafId
  }
  return null
}

/** 列出大項下所有可能屬於此缺失的葉層（含同名重複） */
export async function findAllDefectLeafFolders(
  drive: DriveClient,
  rootFolderId: string,
  parts: {
    buildingName: string
    floor: string
    unitCode: string
    categoryName: string
    itemFolderNames: string[]
    defectId: string
    defectNumber: number
  },
): Promise<string[]> {
  const categoryId = await findCategoryFolderPath(drive, rootFolderId, parts)
  if (!categoryId) return []

  const children = await listChildFolders(drive, categoryId)
  const candidates = new Set(
    parts.itemFolderNames.map((n) => sanitizeDriveName(n || '')).filter(Boolean),
  )
  const prefix = `#${parts.defectNumber}`
  const ids = new Set<string>()

  for (const child of children) {
    if (child.defectId && child.defectId === parts.defectId) {
      ids.add(child.id)
      continue
    }
    if (child.defectId && child.defectId !== parts.defectId) continue
    if (candidates.has(sanitizeDriveName(child.name))) {
      ids.add(child.id)
      continue
    }
    // 無 defectId 標記的舊資料夾：同編號開頭也清掉（避免刪不乾淨／重複）
    const name = child.name.trim()
    if (!child.defectId && (name === prefix || name.startsWith(`${prefix} `))) {
      ids.add(child.id)
    }
  }
  return [...ids]
}

/** 移到雲端硬碟垃圾桶（支援共用碟） */
export async function trashDriveItem(drive: DriveClient, fileId: string): Promise<void> {
  await drive.files.update({
    fileId,
    requestBody: { trashed: true },
    supportsAllDrives: true,
  })
}

export async function renameDriveItem(
  drive: DriveClient,
  fileId: string,
  name: string,
): Promise<void> {
  const safe = sanitizeDriveName(name)
  await drive.files.update({
    fileId,
    requestBody: { name: safe },
    supportsAllDrives: true,
  })
}

export async function moveDriveItem(
  drive: DriveClient,
  fileId: string,
  newParentId: string,
  oldParentId?: string | null,
): Promise<void> {
  await drive.files.update({
    fileId,
    addParents: newParentId,
    ...(oldParentId ? { removeParents: oldParentId } : {}),
    supportsAllDrives: true,
  })
}

export async function getDriveItemMeta(
  drive: DriveClient,
  fileId: string,
): Promise<{ id: string; name: string; parents: string[] } | null> {
  try {
    const res = await drive.files.get({
      fileId,
      fields: 'id,name,parents,trashed',
      supportsAllDrives: true,
    })
    if (!res.data.id || res.data.trashed) return null
    return {
      id: res.data.id,
      name: res.data.name || '',
      parents: res.data.parents ?? [],
    }
  } catch {
    return null
  }
}

/** 建立到大項層（不含葉層），供搬移／改名用 */
export async function ensureCategoryFolderPath(
  drive: DriveClient,
  rootFolderId: string,
  parts: {
    buildingName: string
    floor: string
    unitCode: string
    categoryName: string
  },
): Promise<string> {
  const buildingId = await ensureChildFolder(drive, rootFolderId, parts.buildingName || '未指定棟別')
  const floorId = await ensureChildFolder(drive, buildingId, parts.floor || '未指定樓層')
  const unitId = await ensureChildFolder(drive, floorId, parts.unitCode || '未指定戶別')
  return ensureChildFolder(drive, unitId, parts.categoryName || '未指定大項')
}

export async function listFolderFiles(
  drive: DriveClient,
  folderId: string,
): Promise<Array<{ id: string; name: string; sourcePath?: string }>> {
  const out: Array<{ id: string; name: string; sourcePath?: string }> = []
  let pageToken: string | undefined
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType != '${FOLDER_MIME}' and trashed = false`,
      fields: 'nextPageToken, files(id, name, appProperties)',
      pageSize: 200,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives',
    })
    for (const f of res.data.files ?? []) {
      if (!f.id || !f.name) continue
      out.push({
        id: f.id,
        name: f.name,
        sourcePath: f.appProperties?.sourcePath,
      })
    }
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)
  return out
}

/** #59_plan-remote.jpg → #59_plan（忽略副檔名與 -remote） */
export function driveFileLogicalKey(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/-remote$/i, '')
    .toLowerCase()
}

function scoreKeepDriveFile(f: { name: string; sourcePath?: string }): number {
  let score = 0
  const sp = String(f.sourcePath || '')
  if (sp && !sp.startsWith('remote:')) score += 100
  else if (sp.startsWith('remote:')) score += 10
  if (!/-remote(\.|$)/i.test(f.name)) score += 20
  if (sp) score += 5
  return score
}

/**
 * 同名／同邏輯主體檔只留一份（Google Drive 允許同名並存，競態上傳會堆出 2～3 份）。
 * 優先保留 Storage 實體路徑、非 -remote 檔名。
 */
export async function dedupeFolderFilesByLogicalName(
  drive: DriveClient,
  folderId: string,
  files?: Array<{ id: string; name: string; sourcePath?: string }>,
): Promise<{
  removed: number
  files: Array<{ id: string; name: string; sourcePath?: string }>
}> {
  const listed = files ?? (await listFolderFiles(drive, folderId))
  const groups = new Map<string, typeof listed>()
  for (const f of listed) {
    const key = driveFileLogicalKey(f.name)
    const arr = groups.get(key) ?? []
    arr.push(f)
    groups.set(key, arr)
  }

  let removed = 0
  const kept: typeof listed = []
  for (const group of groups.values()) {
    if (group.length <= 1) {
      kept.push(...group)
      continue
    }
    const ranked = [...group].sort(
      (a, b) => scoreKeepDriveFile(b) - scoreKeepDriveFile(a),
    )
    kept.push(ranked[0]!)
    for (const loser of ranked.slice(1)) {
      try {
        await trashDriveItem(drive, loser.id)
        removed += 1
      } catch {
        // 刪不掉就先留著，避免誤判後又重傳
        kept.push(loser)
      }
    }
  }
  return { removed, files: kept }
}

/**
 * 從缺失說明抽出「備註」（去掉自動帶入的大項｜區域｜細項）。
 * 與前端 resolveDefectRemark 對齊。
 */
export function extractDefectRemark(input: {
  itemDescription?: string | null
  defectDescription?: string | null
  categoryName?: string | null
  area?: string | null
}): string {
  const desc = String(input.defectDescription || '').trim()
  if (!desc) return ''
  const itemLabel = String(input.itemDescription || '').trim()
  const categoryName = String(input.categoryName || '').trim()
  const area = String(input.area || '').trim()
  const autos = [
    itemLabel && categoryName && area ? `${categoryName}｜${area}｜${itemLabel}` : '',
    categoryName && area ? `${categoryName}｜${area}` : '',
    itemLabel,
  ].filter(Boolean)
  if (autos.some((a) => a === desc)) return ''
  if (itemLabel && desc.startsWith(`${itemLabel}｜`)) {
    return desc.slice(itemLabel.length + 1).trim()
  }
  if (itemLabel && desc.startsWith(`${itemLabel} `)) {
    return desc.slice(itemLabel.length).trim()
  }
  return desc
}

/**
 * 葉層資料夾：一筆缺失一個資料夾
 * 命名：#編號 小項名稱 備註說明
 */
export function buildItemFolderName(input: {
  itemSortOrder?: number | null
  itemDescription?: string | null
  defectNumber: number
  defectDescription: string
  categoryName?: string | null
  area?: string | null
}): string {
  const itemLabel = (input.itemDescription || '').trim()
  const remark = extractDefectRemark(input)
  const parts = [`#${input.defectNumber}`]
  if (itemLabel) parts.push(itemLabel)
  if (remark) parts.push(remark)
  else if (!itemLabel) {
    parts.push((input.defectDescription || '未命名缺失').trim().slice(0, 60))
  }
  return sanitizeDriveName(parts.join(' '))
}

/** 含現行與舊版命名，供刪除時查找 */
export function buildItemFolderNameCandidates(input: {
  itemSortOrder?: number | null
  itemDescription?: string | null
  defectNumber: number
  defectDescription: string
  categoryName?: string | null
  area?: string | null
}): string[] {
  const current = buildItemFolderName(input)
  const out = [current]
  const itemLabel = (input.itemDescription || '').trim()
  // 舊版：#編號 小項名稱（無備註）
  if (itemLabel) {
    out.push(sanitizeDriveName(`#${input.defectNumber} ${itemLabel}`))
    const num =
      typeof input.itemSortOrder === 'number' && Number.isFinite(input.itemSortOrder)
        ? String(input.itemSortOrder + 1).padStart(2, '0')
        : '00'
    out.push(sanitizeDriveName(`${num}_${itemLabel}`))
  }
  const n = String(input.defectNumber || 0).padStart(3, '0')
  const desc = (input.defectDescription || '未命名缺失').slice(0, 40)
  out.push(sanitizeDriveName(`${n}_${desc}`))
  return [...new Set(out.filter(Boolean))]
}

export function buildDriveFileName(defectNumber: number, storageFileName: string): string {
  const base = storageFileName.split('/').pop() || storageFileName
  return sanitizeDriveName(`#${defectNumber}_${base}`)
}
