import type { drive_v3 } from 'googleapis'
import { google } from 'googleapis'

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'

export type DriveClient = drive_v3.Drive

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
  const safe = sanitizeDriveName(name)
  const escaped = safe.replace(/'/g, "\\'")
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name = '${escaped}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 5,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'allDrives',
  })
  return res.data.files?.[0]?.id ?? null
}

export async function ensureChildFolder(
  drive: DriveClient,
  parentId: string,
  name: string,
): Promise<string> {
  const existing = await findChildFolder(drive, parentId, name)
  if (existing) return existing
  const safe = sanitizeDriveName(name)
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
  return created.data.id
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
  },
): Promise<string> {
  const buildingId = await ensureChildFolder(drive, rootFolderId, parts.buildingName || '未指定棟別')
  const floorId = await ensureChildFolder(drive, buildingId, parts.floor || '未指定樓層')
  const unitId = await ensureChildFolder(drive, floorId, parts.unitCode || '未指定戶別')
  const categoryId = await ensureChildFolder(drive, unitId, parts.categoryName || '未指定大項')
  return ensureChildFolder(drive, categoryId, parts.itemFolderName || '00_未指定細項')
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

export function buildItemFolderName(input: {
  itemSortOrder?: number | null
  itemDescription?: string | null
  defectNumber: number
  defectDescription: string
}): string {
  if (input.itemDescription) {
    const num =
      typeof input.itemSortOrder === 'number' && Number.isFinite(input.itemSortOrder)
        ? String(input.itemSortOrder + 1).padStart(2, '0')
        : '00'
    return sanitizeDriveName(`${num}_${input.itemDescription}`)
  }
  const n = String(input.defectNumber || 0).padStart(3, '0')
  const desc = (input.defectDescription || '未命名缺失').slice(0, 40)
  return sanitizeDriveName(`${n}_${desc}`)
}

export function buildDriveFileName(defectNumber: number, storageFileName: string): string {
  const base = storageFileName.split('/').pop() || storageFileName
  return sanitizeDriveName(`#${defectNumber}_${base}`)
}
