import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore'
import { getDb, getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase'
import { expandUnitsFromBuildings } from '../lib/units'
import { DEFAULT_AREAS } from '../lib/areas'
import type {
  ActivityLog,
  AreaTemplate,
  BuildingRule,
  ChecklistCategory,
  ChecklistItem,
  Defect,
  DefectStatus,
  ProjectState,
  SyncState,
} from '../types'
import type { ProjectMeta } from '../types/auth'
import {
  mergeActivityLists,
  mergeDefectActorFields,
} from '../lib/backfillActors'

const SITE_META_PATH = ['meta', 'site'] as const

export type PulledProject = ProjectState & { cloudUpdatedAt?: string }

function dbOrNull(): Firestore | null {
  if (!isFirebaseConfigured()) return null
  return getDb()
}

async function ensureAuth(): Promise<boolean> {
  const auth = getFirebaseAuth()
  if (!auth) return false
  await auth.authStateReady()
  return Boolean(auth.currentUser)
}

function serializeBuilding(b: BuildingRule) {
  return {
    name: b.name,
    floors: b.floors,
    unitCodes: b.unitCodes,
    naKeys: b.naKeys,
    sortOrder: b.sortOrder,
    active: b.active,
    updatedAt: serverTimestamp(),
  }
}

function parseBuilding(id: string, data: Record<string, unknown>): BuildingRule {
  return {
    id,
    name: String(data.name ?? id),
    floors: Array.isArray(data.floors) ? data.floors.map(String) : [],
    unitCodes: Array.isArray(data.unitCodes) ? data.unitCodes.map(String) : [],
    naKeys: Array.isArray(data.naKeys) ? data.naKeys.map(String) : [],
    sortOrder: Number(data.sortOrder ?? 0),
    active: data.active !== false,
  }
}

function parseCategory(id: string, data: Record<string, unknown>): ChecklistCategory {
  return {
    id,
    name: String(data.name ?? ''),
    iconChar: String(data.iconChar ?? '項'),
    color: String(data.color ?? '#2F5D4C'),
    itemCount: Number(data.itemCount ?? 0),
    sortOrder: Number(data.sortOrder ?? 0),
    active: data.active !== false,
  }
}

function parseItem(id: string, data: Record<string, unknown>): ChecklistItem {
  return {
    id,
    categoryId: String(data.categoryId ?? ''),
    description: String(data.description ?? ''),
    sortOrder: Number(data.sortOrder ?? 0),
    active: data.active !== false,
  }
}

/** 把 Firestore Timestamp／字串／秒數轉成可比較的 ISO（避免 String(Timestamp) 破壞合併） */
export function parseFirestoreDate(value: unknown, fallbackIso?: string): string {
  const fallback = fallbackIso ?? new Date().toISOString()
  if (value == null || value === '') return fallback

  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString()
    } catch {
      /* fallthrough */
    }
  }

  if (typeof value === 'object' && value !== null) {
    const o = value as Record<string, unknown>
    const seconds = o.seconds ?? o._seconds
    if (typeof seconds === 'number' && Number.isFinite(seconds)) {
      const nanos = Number(o.nanoseconds ?? o._nanoseconds ?? 0)
      return new Date(seconds * 1000 + nanos / 1e6).toISOString()
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value < 1e12 ? value * 1000 : value).toISOString()
  }

  if (typeof value === 'string') {
    const ms = Date.parse(value)
    if (Number.isFinite(ms)) return new Date(ms).toISOString()
    // 舊版曾把 Timestamp 直接 String()，例如 Timestamp(seconds=1786..., nanoseconds=...)
    const m = value.match(/seconds\s*=\s*(\d+)/i)
    if (m) return new Date(Number(m[1]) * 1000).toISOString()
    return fallback
  }

  return fallback
}

function parseDefect(id: string, data: Record<string, unknown>): Defect {
  const status = String(data.status ?? 'pending_repair') as DefectStatus
  const syncState = (String(data.syncState ?? 'synced') as SyncState) || 'synced'
  const plan = data.planPhotoDataUrl
  const photos = Array.isArray(data.photoDataUrls) ? data.photoDataUrls.map(String) : []
  // 優先用客戶端寫入的 ISO，serverTimestamp 僅作後援
  const updatedRaw = data.clientUpdatedAt ?? data.updatedAt
  return {
    id,
    unitId: String(data.unitId ?? ''),
    buildingId: String(data.buildingId ?? ''),
    buildingName: String(data.buildingName ?? ''),
    floor: String(data.floor ?? ''),
    unitCode: String(data.unitCode ?? ''),
    defectNumber: Number(data.defectNumber ?? 0),
    categoryId: String(data.categoryId ?? ''),
    categoryName: String(data.categoryName ?? ''),
    checklistItemId: data.checklistItemId ? String(data.checklistItemId) : undefined,
    area: String(data.area ?? ''),
    description: String(data.description ?? ''),
    status,
    planPhotoDataUrl:
      typeof plan === 'string' && plan.startsWith('http') ? plan : undefined,
    photoDataUrls: photos.filter((p) => p.startsWith('http')),
    syncState: syncState === 'demo' ? 'synced' : syncState,
    createdAt: parseFirestoreDate(data.createdAt),
    updatedAt: parseFirestoreDate(updatedRaw),
  }
}

/** 下一號 = 該戶「未作廢」最大編號 + 1（作廢不佔號；刪除尾號可回收） */
export function computeNextDefectNumber(
  unitId: string,
  _storedCounter: number,
  defects: Array<{ unitId: string; defectNumber: number; status?: string }>,
): number {
  return recomputeUnitNextDefectNumber(unitId, defects)
}

/** 依目前未作廢缺失重算該戶下一號（自動編號：最大號 + 1） */
export function recomputeUnitNextDefectNumber(
  unitId: string,
  defects: Array<{ unitId: string; defectNumber: number; status?: string }>,
): number {
  let maxActive = 0
  for (const d of defects) {
    if (d.unitId !== unitId) continue
    if (d.status === 'voided') continue
    maxActive = Math.max(maxActive, Number(d.defectNumber) || 0)
  }
  return maxActive + 1
}

/** 該戶未作廢缺失是否已使用此編號 */
export function isDefectNumberTaken(
  unitId: string,
  defectNumber: number,
  defects: Array<{ id?: string; unitId: string; defectNumber: number; status?: string }>,
  exceptDefectId?: string,
): boolean {
  const n = Number(defectNumber)
  if (!Number.isFinite(n) || n < 1) return true
  for (const d of defects) {
    if (d.unitId !== unitId) continue
    if (d.status === 'voided') continue
    if (exceptDefectId && d.id === exceptDefectId) continue
    if (Number(d.defectNumber) === n) return true
  }
  return false
}

function unitNextMap(units: ProjectState['units']): Record<string, number> {
  const map: Record<string, number> = {}
  for (const u of units) map[u.id] = u.nextDefectNumber
  return map
}

function unitAreasMap(units: ProjectState['units']): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const u of units) {
    if (u.areas && u.areas.length > 0) map[u.id] = [...u.areas]
  }
  return map
}

function unitAreaTemplateMap(units: ProjectState['units']): Record<string, string> {
  const map: Record<string, string> = {}
  for (const u of units) {
    if (u.areaTemplateId) map[u.id] = u.areaTemplateId
  }
  return map
}

function parseUnitAreaTemplateMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const tid = String(value ?? '').trim()
    if (tid) out[id] = tid
  }
  return out
}

function unitPlanPhotosMap(units: ProjectState['units']): Record<string, string> {
  const map: Record<string, string> = {}
  for (const u of units) {
    const url = u.defaultPlanPhotoUrl?.trim()
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      map[u.id] = url
    }
  }
  return map
}

function parseUnitPlanPhotosMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const url = String(value ?? '').trim()
    if (url.startsWith('http://') || url.startsWith('https://')) out[id] = url
  }
  return out
}

function parseUnitCategoryDone(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, string[]> = {}
  for (const [unitId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue
    const ids = value.map(String).filter(Boolean)
    if (ids.length) out[unitId] = ids
  }
  return out
}

function parseUnitAreasMap(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, string[]> = {}
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue
    const areas = value.map(String).map((s) => s.trim()).filter(Boolean)
    if (areas.length) out[id] = areas
  }
  return out
}

/** 將完整現場狀態推上雲端（棟別／範本／缺失／進度／歷程） */
export async function pushProjectState(
  projectId: string,
  state: ProjectState,
  meta?: Partial<ProjectMeta>,
): Promise<boolean> {
  const db = dbOrNull()
  if (!db || !(await ensureAuth()) || !projectId) return false

  const projectRef = doc(db, 'projects', projectId)
  await setDoc(
    projectRef,
    {
      name: meta?.name ?? state.projectName,
      code: meta?.code,
      location: meta?.location,
      status: meta?.status,
      driveFolderId: meta?.driveFolderId ?? null,
      driveFolderUrl: meta?.driveFolderUrl ?? null,
      updatedAt: serverTimestamp(),
      mode: 'site-inspection',
      hasSiteData: true,
    },
    { merge: true },
  )

  // 棟別：寫入現有、刪除雲端多餘
  const buildingsSnap = await getDocs(collection(db, 'projects', projectId, 'buildings'))
  const localBuildingIds = new Set(state.buildings.map((b) => b.id))
  await Promise.all(
    state.buildings.map((b) =>
      setDoc(doc(db, 'projects', projectId, 'buildings', b.id), serializeBuilding(b), {
        merge: true,
      }),
    ),
  )
  await Promise.all(
    buildingsSnap.docs
      .filter((d) => !localBuildingIds.has(d.id))
      .map((d) => deleteDoc(d.ref)),
  )

  // 查驗範本
  const catsSnap = await getDocs(collection(db, 'projects', projectId, 'categories'))
  const localCatIds = new Set(state.categories.map((c) => c.id))
  await Promise.all(
    state.categories.map((c) =>
      setDoc(
        doc(db, 'projects', projectId, 'categories', c.id),
        {
          name: c.name,
          iconChar: c.iconChar,
          color: c.color,
          itemCount: c.itemCount,
          sortOrder: c.sortOrder,
          active: c.active,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ),
    ),
  )
  await Promise.all(
    catsSnap.docs.filter((d) => !localCatIds.has(d.id)).map((d) => deleteDoc(d.ref)),
  )

  const itemsSnap = await getDocs(collection(db, 'projects', projectId, 'checklistItems'))
  const localItemIds = new Set(state.checklistItems.map((i) => i.id))
  await Promise.all(
    state.checklistItems.map((i) =>
      setDoc(
        doc(db, 'projects', projectId, 'checklistItems', i.id),
        {
          categoryId: i.categoryId,
          description: i.description,
          sortOrder: i.sortOrder,
          active: i.active,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ),
    ),
  )
  await Promise.all(
    itemsSnap.docs.filter((d) => !localItemIds.has(d.id)).map((d) => deleteDoc(d.ref)),
  )

  // 缺失改由新增／更新時單獨同步，這裡不再整包重傳（大幅加速）

  // 其餘狀態集中放 meta/site
  await setDoc(
    doc(db, 'projects', projectId, ...SITE_META_PATH),
    {
      projectName: state.projectName,
      areas: state.areas,
      areaTemplates: state.areaTemplates ?? [],
      unitCheckedCount: state.unitCheckedCount,
      unitCategoryDone: state.unitCategoryDone ?? {},
      activities: state.activities.slice(0, 40),
      unitNextDefect: unitNextMap(state.units),
      unitAreas: unitAreasMap(state.units),
      unitAreaTemplates: unitAreaTemplateMap(state.units),
      unitPlanPhotos: unitPlanPhotosMap(state.units),
      currentUnitId: state.currentUnitId,
      recentUnitIds: state.recentUnitIds,
      updatedAt: serverTimestamp(),
      clientUpdatedAt: new Date().toISOString(),
    },
    { merge: true },
  )

  return true
}

/** 從雲端拉取完整現場狀態；無資料時回 null */
export async function pullProjectState(projectId: string): Promise<PulledProject | null> {
  const db = dbOrNull()
  if (!db || !(await ensureAuth()) || !projectId) return null

  try {
    const [buildingsSnap, catsSnap, itemsSnap, defectsSnap, metaSnap, projectSnap] =
      await Promise.all([
        getDocs(collection(db, 'projects', projectId, 'buildings')),
        getDocs(collection(db, 'projects', projectId, 'categories')),
        getDocs(collection(db, 'projects', projectId, 'checklistItems')),
        getDocs(collection(db, 'projects', projectId, 'defects')),
        getDoc(doc(db, 'projects', projectId, ...SITE_META_PATH)),
        getDoc(doc(db, 'projects', projectId)),
      ])

    const buildings = buildingsSnap.docs
      .map((d) => parseBuilding(d.id, d.data() as Record<string, unknown>))
      .sort((a, b) => a.sortOrder - b.sortOrder)

    const categories = catsSnap.docs
      .map((d) => parseCategory(d.id, d.data() as Record<string, unknown>))
      .sort((a, b) => a.sortOrder - b.sortOrder)

    const checklistItems = itemsSnap.docs
      .map((d) => parseItem(d.id, d.data() as Record<string, unknown>))
      .sort((a, b) => a.sortOrder - b.sortOrder)

    const defects = defectsSnap.docs
      .map((d) => parseDefect(d.id, d.data() as Record<string, unknown>))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

    const meta = metaSnap.exists() ? (metaSnap.data() as Record<string, unknown>) : {}
    const projectData = projectSnap.exists()
      ? (projectSnap.data() as Record<string, unknown>)
      : {}

    const hasCloudPayload =
      buildings.length > 0 ||
      defects.length > 0 ||
      categories.length > 0 ||
      metaSnap.exists() ||
      Boolean(projectData.hasSiteData)

    if (!hasCloudPayload) return null

    const unitAreas = parseUnitAreasMap(meta.unitAreas)
    const unitAreaTemplates = parseUnitAreaTemplateMap(meta.unitAreaTemplates)
    const unitPlanPhotos = parseUnitPlanPhotosMap(meta.unitPlanPhotos)

    const units = expandUnitsFromBuildings(buildings).map((u) => ({
      ...u,
      // 以未作廢缺失實況重算，避免雲端舊計數器造成跳號
      nextDefectNumber: recomputeUnitNextDefectNumber(u.id, defects),
      // 手動自訂優先；有手動 areas 就不掛範本綁定
      areas: unitAreas[u.id]?.length ? unitAreas[u.id] : undefined,
      areaTemplateId: unitAreas[u.id]?.length
        ? undefined
        : unitAreaTemplates[u.id] || undefined,
      defaultPlanPhotoUrl: unitPlanPhotos[u.id] || undefined,
    }))

    const activities = Array.isArray(meta.activities)
      ? (meta.activities as ActivityLog[])
      : []

    // 專案顯示名稱優先用後台建案名稱，避免把 proj_xxx 內部 ID 寫進報表
    const readableName = [projectData.name, meta.projectName]
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .find((v) => v && !/^proj[_-]/i.test(v))

    return {
      projectName: String(readableName || projectData.name || meta.projectName || '未命名專案'),
      buildings,
      units,
      categories,
      checklistItems,
      defects,
      unitCheckedCount:
        meta.unitCheckedCount && typeof meta.unitCheckedCount === 'object'
          ? (meta.unitCheckedCount as Record<string, number>)
          : {},
      unitCategoryDone: parseUnitCategoryDone(meta.unitCategoryDone),
      activities,
      currentUnitId: meta.currentUnitId ? String(meta.currentUnitId) : units[0]?.id ?? null,
      recentUnitIds: Array.isArray(meta.recentUnitIds)
        ? meta.recentUnitIds.map(String)
        : [],
      areas: Array.isArray(meta.areas) ? meta.areas.map(String) : [...DEFAULT_AREAS],
      areaTemplates: parseAreaTemplates(meta.areaTemplates),
      cloudUpdatedAt: meta.clientUpdatedAt ? String(meta.clientUpdatedAt) : undefined,
    }
  } catch (err) {
    console.warn('[pullProjectState] failed', err)
    return null
  }
}

function preferMediaUrl(a?: string, b?: string): string | undefined {
  if (a?.startsWith('http')) return a
  if (b?.startsWith('http')) return b
  if (a?.startsWith('data:')) return a
  if (b?.startsWith('data:')) return b
  return a || b
}

function defectTimeMs(iso: string): number {
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : Number.NaN
}

/** 合併單筆缺失：照片取聯集；作廢狀態具黏著性，避免雲端舊資料把已刪缺失「復活」 */
export function mergeDefectPhotos(local: Defect, remote: Defect): Defect {
  const remotePhotos = remote.photoDataUrls ?? []
  const localPhotos = local.photoDataUrls ?? []
  const maxLen = Math.max(remotePhotos.length, localPhotos.length)
  const photoDataUrls: string[] = []
  for (let i = 0; i < maxLen; i += 1) {
    const picked = preferMediaUrl(remotePhotos[i], localPhotos[i])
    if (picked) photoDataUrls.push(picked)
  }
  // 若一邊完全沒圖、另一邊有，直接用有圖的那份
  if (photoDataUrls.length === 0) {
    photoDataUrls.push(...(localPhotos.length ? localPhotos : remotePhotos))
  }

  const localMs = defectTimeMs(local.updatedAt)
  const remoteMs = defectTimeMs(remote.updatedAt)
  let newer: Defect
  let older: Defect
  if (Number.isFinite(localMs) && Number.isFinite(remoteMs)) {
    newer = remoteMs >= localMs ? remote : local
    older = newer === remote ? local : remote
  } else if (Number.isFinite(localMs)) {
    // 雲端時間無法解析時保留本機（避免舊版 Timestamp 字串永遠蓋過 ISO）
    newer = local
    older = remote
  } else if (Number.isFinite(remoteMs)) {
    newer = remote
    older = local
  } else {
    newer = local
    older = remote
  }

  const merged: Defect = {
    ...older,
    ...newer,
    ...mergeDefectActorFields(local, remote),
    planPhotoDataUrl: preferMediaUrl(remote.planPhotoDataUrl, local.planPhotoDataUrl),
    photoDataUrls,
    // 本機仍在上傳時不要被雲端 pending 狀態蓋掉成已同步無圖
    syncState:
      local.syncState === 'syncing' || local.syncState === 'pending' || local.syncState === 'failed'
        ? local.syncState
        : newer.syncState,
  }

  // 無「復原作廢」流程：任一端已作廢，合併後必須維持作廢（不刪雲端文件、不改其他欄位）
  if (local.status === 'voided' || remote.status === 'voided') {
    merged.status = 'voided'
    if (local.status === 'voided' && Number.isFinite(localMs)) {
      if (!Number.isFinite(remoteMs) || localMs >= remoteMs || remote.status !== 'voided') {
        merged.updatedAt = local.updatedAt
      }
    } else if (remote.status === 'voided' && Number.isFinite(remoteMs)) {
      merged.updatedAt = remote.updatedAt
    }
  }

  return merged
}

/** 合併本機與雲端：結構取較完整者，缺失逐筆合併並保留已有照片 */
export function mergeProjectStates(local: ProjectState, remote: PulledProject): ProjectState {
  const localScore =
    local.buildings.filter((b) => b.active).length * 100 +
    local.categories.filter((c) => c.active).length
  const remoteScore =
    remote.buildings.filter((b) => b.active).length * 100 +
    remote.categories.filter((c) => c.active).length

  const buildingMap = new Map<string, BuildingRule>()
  const preferRemoteBuildings = remoteScore >= localScore
  const firstBuildings = preferRemoteBuildings ? remote.buildings : local.buildings
  const secondBuildings = preferRemoteBuildings ? local.buildings : remote.buildings
  for (const b of firstBuildings) buildingMap.set(b.id, b)
  for (const b of secondBuildings) if (!buildingMap.has(b.id)) buildingMap.set(b.id, b)

  const catMap = new Map<string, ChecklistCategory>()
  for (const c of local.categories) catMap.set(c.id, c)
  for (const c of remote.categories) catMap.set(c.id, c)

  const itemMap = new Map<string, ChecklistItem>()
  for (const i of local.checklistItems) itemMap.set(i.id, i)
  for (const i of remote.checklistItems) itemMap.set(i.id, i)

  const defectMap = new Map<string, Defect>()
  for (const d of local.defects) defectMap.set(d.id, d)
  for (const d of remote.defects) {
    const prev = defectMap.get(d.id)
    defectMap.set(d.id, prev ? mergeDefectPhotos(prev, d) : d)
  }

  const buildings = [...buildingMap.values()].sort((a, b) => a.sortOrder - b.sortOrder)
  const mergedDefects = [...defectMap.values()]
  const unitAreas: Record<string, string[]> = {}
  const unitTpl: Record<string, string> = {}
  const unitPlans: Record<string, string> = {}
  for (const u of local.units) {
    if (u.areas?.length) unitAreas[u.id] = [...u.areas]
    if (u.areaTemplateId) unitTpl[u.id] = u.areaTemplateId
    if (u.defaultPlanPhotoUrl) unitPlans[u.id] = u.defaultPlanPhotoUrl
  }
  for (const u of remote.units) {
    // 本機已有自訂區域優先；否則用雲端
    if (!unitAreas[u.id]?.length && u.areas?.length) {
      unitAreas[u.id] = [...u.areas]
    }
    if (!unitTpl[u.id] && u.areaTemplateId) unitTpl[u.id] = u.areaTemplateId
    const localPlan = unitPlans[u.id]
    const remotePlan = u.defaultPlanPhotoUrl
    const mergedPlan = preferMediaUrl(localPlan, remotePlan)
    if (mergedPlan) unitPlans[u.id] = mergedPlan
    else delete unitPlans[u.id]
  }
  const units = expandUnitsFromBuildings(buildings).map((u) => ({
    ...u,
    nextDefectNumber: recomputeUnitNextDefectNumber(u.id, mergedDefects),
    areas: unitAreas[u.id]?.length ? unitAreas[u.id] : undefined,
    areaTemplateId: unitAreas[u.id]?.length ? undefined : unitTpl[u.id] || undefined,
    defaultPlanPhotoUrl: unitPlans[u.id] || undefined,
  }))

  return {
    projectName: remote.projectName || local.projectName,
    buildings,
    units,
    categories: [...catMap.values()].sort((a, b) => a.sortOrder - b.sortOrder),
    checklistItems: [...itemMap.values()].sort((a, b) => a.sortOrder - b.sortOrder),
    defects: mergedDefects.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    unitCheckedCount: { ...local.unitCheckedCount, ...remote.unitCheckedCount },
    unitCategoryDone: mergeUnitCategoryDone(
      local.unitCategoryDone ?? {},
      remote.unitCategoryDone ?? {},
    ),
    activities: mergeActivityLists(local.activities ?? [], remote.activities ?? []).slice(
      0,
      40,
    ),
    currentUnitId: local.currentUnitId || remote.currentUnitId,
    recentUnitIds: local.recentUnitIds.length
      ? local.recentUnitIds
      : remote.recentUnitIds,
    areas: local.areas.length ? local.areas : remote.areas,
    areaTemplates: mergeAreaTemplates(local.areaTemplates, remote.areaTemplates),
  }
}

function parseAreaTemplates(raw: unknown): AreaTemplate[] {
  if (!Array.isArray(raw)) return []
  const out: AreaTemplate[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const id = String(o.id ?? '').trim()
    const code = String(o.code ?? '').trim()
    const name = String(o.name ?? '').trim()
    const areas = Array.isArray(o.areas)
      ? o.areas.map((a) => String(a).trim()).filter(Boolean)
      : []
    if (!id || !code || areas.length === 0) continue
    out.push({
      id,
      code,
      name: name || code,
      areas,
      updatedAt: String(o.updatedAt ?? ''),
    })
  }
  return out
}

function mergeAreaTemplates(
  local: AreaTemplate[] | undefined,
  remote: AreaTemplate[] | undefined,
): AreaTemplate[] {
  const map = new Map<string, AreaTemplate>()
  for (const t of remote ?? []) map.set(t.id, t)
  for (const t of local ?? []) {
    const prev = map.get(t.id)
    if (!prev) {
      map.set(t.id, t)
      continue
    }
    const localMs = Date.parse(t.updatedAt)
    const remoteMs = Date.parse(prev.updatedAt)
    if (Number.isFinite(localMs) && Number.isFinite(remoteMs)) {
      map.set(t.id, localMs >= remoteMs ? t : prev)
    } else {
      map.set(t.id, t)
    }
  }
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }))
}

function mergeUnitCategoryDone(
  local: Record<string, string[]>,
  remote: Record<string, string[]>,
): Record<string, string[]> {
  const ids = new Set([...Object.keys(local), ...Object.keys(remote)])
  const out: Record<string, string[]> = {}
  for (const id of ids) {
    const merged = new Set([...(local[id] ?? []), ...(remote[id] ?? [])])
    if (merged.size) out[id] = [...merged]
  }
  return out
}
