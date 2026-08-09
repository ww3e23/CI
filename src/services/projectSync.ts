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
import type {
  ActivityLog,
  BuildingRule,
  ChecklistCategory,
  ChecklistItem,
  Defect,
  DefectStatus,
  ProjectState,
  SyncState,
} from '../types'
import type { ProjectMeta } from '../types/auth'
import { syncDefect } from './cloudSync'

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

function parseDefect(id: string, data: Record<string, unknown>): Defect {
  const status = String(data.status ?? 'pending_repair') as DefectStatus
  const syncState = (String(data.syncState ?? 'synced') as SyncState) || 'synced'
  const plan = data.planPhotoDataUrl
  const photos = Array.isArray(data.photoDataUrls) ? data.photoDataUrls.map(String) : []
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
    createdAt: String(data.createdAt ?? new Date().toISOString()),
    updatedAt: String(data.updatedAt ?? new Date().toISOString()),
  }
}

function unitNextMap(units: ProjectState['units']): Record<string, number> {
  const map: Record<string, number> = {}
  for (const u of units) map[u.id] = u.nextDefectNumber
  return map
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

  // 缺失（輕量欄位；照片僅保留 http）
  await Promise.all(state.defects.map((d) => syncDefect(projectId, d)))

  // 其餘狀態集中放 meta/site
  await setDoc(
    doc(db, 'projects', projectId, ...SITE_META_PATH),
    {
      projectName: state.projectName,
      areas: state.areas,
      unitCheckedCount: state.unitCheckedCount,
      activities: state.activities.slice(0, 40),
      unitNextDefect: unitNextMap(state.units),
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

    const unitNext =
      meta.unitNextDefect && typeof meta.unitNextDefect === 'object'
        ? (meta.unitNextDefect as Record<string, number>)
        : {}

    const units = expandUnitsFromBuildings(buildings).map((u) => ({
      ...u,
      nextDefectNumber: Number(unitNext[u.id] ?? u.nextDefectNumber ?? 1),
    }))

    const activities = Array.isArray(meta.activities)
      ? (meta.activities as ActivityLog[])
      : []

    return {
      projectName: String(meta.projectName ?? projectData.name ?? projectId),
      buildings,
      units,
      categories,
      checklistItems,
      defects,
      unitCheckedCount:
        meta.unitCheckedCount && typeof meta.unitCheckedCount === 'object'
          ? (meta.unitCheckedCount as Record<string, number>)
          : {},
      activities,
      currentUnitId: meta.currentUnitId ? String(meta.currentUnitId) : units[0]?.id ?? null,
      recentUnitIds: Array.isArray(meta.recentUnitIds)
        ? meta.recentUnitIds.map(String)
        : [],
      areas: Array.isArray(meta.areas)
        ? meta.areas.map(String)
        : ['玄關', '客廳', '餐廳', '廚房', '主臥', '臥室1', '主浴', '客浴', '前陽台'],
      cloudUpdatedAt: meta.clientUpdatedAt ? String(meta.clientUpdatedAt) : undefined,
    }
  } catch (err) {
    console.warn('[pullProjectState] failed', err)
    return null
  }
}

/** 合併本機與雲端：以「較完整／較新」為準，避免登出後空資料蓋掉雲端 */
export function mergeProjectStates(local: ProjectState, remote: PulledProject): ProjectState {
  const localScore =
    local.buildings.filter((b) => b.active).length * 100 +
    local.defects.length * 10 +
    local.categories.filter((c) => c.active).length
  const remoteScore =
    remote.buildings.filter((b) => b.active).length * 100 +
    remote.defects.length * 10 +
    remote.categories.filter((c) => c.active).length

  // 雲端明顯較完整 → 用雲端
  if (remoteScore > localScore) return remote
  // 本機明顯較完整 → 用本機
  if (localScore > remoteScore) return local

  // 同分：合併集合（同 id 雲端優先若有 updatedAt，否則保留本機欄位較多者）
  const buildingMap = new Map<string, BuildingRule>()
  for (const b of local.buildings) buildingMap.set(b.id, b)
  for (const b of remote.buildings) buildingMap.set(b.id, b)

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
    if (!prev || (d.updatedAt && d.updatedAt >= prev.updatedAt)) defectMap.set(d.id, d)
  }

  const buildings = [...buildingMap.values()].sort((a, b) => a.sortOrder - b.sortOrder)
  const unitNext: Record<string, number> = {}
  for (const u of local.units) unitNext[u.id] = u.nextDefectNumber
  for (const u of remote.units) {
    unitNext[u.id] = Math.max(unitNext[u.id] ?? 1, u.nextDefectNumber)
  }
  const units = expandUnitsFromBuildings(buildings).map((u) => ({
    ...u,
    nextDefectNumber: unitNext[u.id] ?? 1,
  }))

  return {
    projectName: remote.projectName || local.projectName,
    buildings,
    units,
    categories: [...catMap.values()].sort((a, b) => a.sortOrder - b.sortOrder),
    checklistItems: [...itemMap.values()].sort((a, b) => a.sortOrder - b.sortOrder),
    defects: [...defectMap.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    unitCheckedCount: { ...local.unitCheckedCount, ...remote.unitCheckedCount },
    activities: (remote.activities.length >= local.activities.length
      ? remote.activities
      : local.activities
    ).slice(0, 40),
    currentUnitId: local.currentUnitId || remote.currentUnitId,
    recentUnitIds: local.recentUnitIds.length
      ? local.recentUnitIds
      : remote.recentUnitIds,
    areas: local.areas.length ? local.areas : remote.areas,
  }
}
