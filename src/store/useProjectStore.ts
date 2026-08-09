import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type {
  BuildingRule,
  ChecklistCategory,
  ChecklistItem,
  Defect,
  DefectStatus,
  ProjectState,
  SyncState,
} from '../types'
import { buildDefaultChecklist } from '../data/defaultChecklist'
import { createEmptyProjectState, createProjectBundles } from '../data/seed'
import { expandUnitsFromBuildings } from '../lib/units'
import { createId } from '../lib/id'
import { cloudReady, syncDefect, syncProjectStructure } from '../services/cloudSync'
import {
  mergeProjectStates,
  pullProjectState,
  pushProjectState,
} from '../services/projectSync'
import { uploadDefectImages } from '../services/storageUpload'
import { firebaseModeLabel } from '../lib/firebase'
import { lightenProjectState, purgeBloatedInspectionStorage } from '../lib/mediaPersist'

if (typeof window !== 'undefined') {
  purgeBloatedInspectionStorage()
}

type BundleMap = Record<string, ProjectState>

interface ProjectActions {
  setCurrentUnit: (unitId: string) => void
  upsertBuilding: (building: BuildingRule) => void
  removeBuilding: (buildingId: string) => void
  addDefect: (input: {
    unitId: string
    categoryId: string
    categoryName: string
    checklistItemId?: string
    area: string
    description: string
    planPhotoDataUrl?: string
    photoDataUrls?: string[]
  }) => Promise<Defect | null>
  updateDefectStatus: (defectId: string, status: DefectStatus) => void
  markUnitChecked: (unitId: string, checked: number) => void
  resetDemoData: () => void
  pushStructureToCloud: () => Promise<{ ok: boolean; mode: string }>
  /** 從雲端拉取並與本機合併（登入／切專案／開 App） */
  hydrateFromCloud: (projectId: string) => Promise<{ ok: boolean; error?: string }>
  /** 立刻把作用中專案存本機並推上雲端 */
  flushSyncNow: () => Promise<{ ok: boolean }>
  loadProjectBundle: (projectId: string) => void
  saveProjectBundle: (projectId: string) => void
  ensureProjectBundle: (projectId: string, name: string) => void
  removeProjectBundle: (projectId: string) => void
  /** 讀取指定專案歷程（作用中專案用即時資料，其餘讀 bundle） */
  getProjectActivities: (projectId: string) => ProjectState['activities']
  applyDefaultChecklist: (mode?: 'fill-if-empty' | 'replace') => { ok: boolean; reason?: string }
  upsertCategory: (category: ChecklistCategory, items: ChecklistItem[]) => void
  removeCategory: (categoryId: string) => { ok: boolean; reason?: string }
  upsertChecklistItem: (item: ChecklistItem) => void
  removeChecklistItem: (itemId: string) => { ok: boolean; reason?: string }
}

let syncTimer: ReturnType<typeof setTimeout> | null = null
let syncing = false
let pendingFlush = false

function scheduleCloudSync(get: () => ProjectState & BundleState) {
  if (!cloudReady()) return
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = null
    void flushCloudSync(get)
  }, 700)
}

async function flushCloudSync(get: () => ProjectState & BundleState): Promise<boolean> {
  if (!cloudReady()) return false
  const projectId = get().activeProjectId
  if (!projectId) return false
  if (syncing) {
    pendingFlush = true
    return false
  }
  syncing = true
  try {
    const { useAuthStore } = await import('./useAuthStore')
    const meta = useAuthStore.getState().projects.find((p) => p.id === projectId)
    await pushProjectState(projectId, snapshotProject(get()), meta)
    return true
  } catch (err) {
    console.warn('[flushCloudSync] failed', err)
    return false
  } finally {
    syncing = false
    if (pendingFlush) {
      pendingFlush = false
      void flushCloudSync(get)
    }
  }
}

/** 每次變更：立刻寫入 bundle（防滑掉 App 遺失）；預設 debounce 上雲 */
function afterProjectChange(
  get: () => ProjectState & BundleState & ProjectActions,
  set: (partial: Partial<ProjectState & BundleState>) => void,
  options?: { syncCloud?: boolean },
) {
  const projectId = get().activeProjectId
  if (projectId) {
    const snap = snapshotProject(get())
    set({
      bundles: {
        ...get().bundles,
        [projectId]: snap,
      },
    })
  }
  if (options?.syncCloud !== false) scheduleCloudSync(get)
}

interface BundleState {
  bundles: BundleMap
  activeProjectId: string | null
}

function rebuildUnits(buildings: BuildingRule[], prevUnits: ProjectState['units']) {
  const next = expandUnitsFromBuildings(buildings)
  const prevMap = new Map(prevUnits.map((u) => [u.id, u]))
  return next.map((u) => {
    const old = prevMap.get(u.id)
    return old ? { ...u, nextDefectNumber: old.nextDefectNumber } : u
  })
}

function snapshotProject(state: ProjectState): ProjectState {
  return {
    projectName: state.projectName,
    buildings: state.buildings,
    units: state.units,
    categories: state.categories,
    checklistItems: state.checklistItems,
    defects: state.defects,
    unitCheckedCount: state.unitCheckedCount,
    activities: state.activities,
    currentUnitId: state.currentUnitId,
    recentUnitIds: state.recentUnitIds,
    areas: state.areas,
  }
}

const initialBundles = createProjectBundles()
const emptyBoot = createEmptyProjectState('未選擇專案')

export const useProjectStore = create<ProjectState & BundleState & ProjectActions>()(
  persist(
    (set, get) => ({
      ...emptyBoot,
      bundles: initialBundles,
      activeProjectId: null,

      setCurrentUnit: (unitId) => {
        const recent = [unitId, ...get().recentUnitIds.filter((id) => id !== unitId)].slice(0, 8)
        set({ currentUnitId: unitId, recentUnitIds: recent })
        afterProjectChange(get, set)
      },

      upsertBuilding: (building) => {
        const buildings = [...get().buildings]
        const idx = buildings.findIndex((b) => b.id === building.id)
        if (idx >= 0) buildings[idx] = building
        else buildings.push({ ...building, sortOrder: buildings.length })
        set({ buildings, units: rebuildUnits(buildings, get().units) })
        afterProjectChange(get, set)
      },

      removeBuilding: (buildingId) => {
        const hasDefects = get().defects.some((d) => d.buildingId === buildingId)
        const nextBuildings = hasDefects
          ? get().buildings.map((b) =>
              b.id === buildingId ? { ...b, active: false } : b,
            )
          : get().buildings.filter((b) => b.id !== buildingId)
        set({ buildings: nextBuildings, units: rebuildUnits(nextBuildings, get().units) })
        afterProjectChange(get, set)
      },

      addDefect: async ({
        unitId,
        categoryId,
        categoryName,
        checklistItemId,
        area,
        description,
        planPhotoDataUrl,
        photoDataUrls = [],
      }) => {
        const state = get()
        const unit = state.units.find((u) => u.id === unitId)
        if (!unit) return null

        const syncState: SyncState = cloudReady() ? 'pending' : 'demo'
        const defect: Defect = {
          id: createId('def'),
          unitId,
          buildingId: unit.buildingId,
          buildingName: unit.buildingName,
          floor: unit.floor,
          unitCode: unit.code,
          defectNumber: unit.nextDefectNumber,
          categoryId,
          categoryName,
          checklistItemId,
          area,
          description,
          status: 'pending_repair',
          planPhotoDataUrl,
          photoDataUrls,
          syncState,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }

        set({
          defects: [defect, ...state.defects],
          units: state.units.map((u) =>
            u.id === unitId ? { ...u, nextDefectNumber: u.nextDefectNumber + 1 } : u,
          ),
          activities: [
            {
              id: createId('act'),
              at: new Date().toLocaleString('zh-TW', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }),
              buildingName: unit.buildingName,
              floor: unit.floor,
              unitCode: unit.code,
              summary: `新增缺失 #${defect.defectNumber}｜${description}`,
              actorName: '現場查驗',
            },
            ...state.activities,
          ].slice(0, 40),
        })
        // 先寫本機就回傳，雲端上傳改背景做，避免使用者卡在儲存畫面
        afterProjectChange(get, set, { syncCloud: false })

        if (cloudReady()) {
          const projectId = get().activeProjectId
          set({
            defects: get().defects.map((d) =>
              d.id === defect.id ? { ...d, syncState: 'syncing' } : d,
            ),
          })
          void (async () => {
            try {
              if (!projectId) throw new Error('缺少專案 ID')
              const { planUrl, photoUrls } = await uploadDefectImages({
                projectId,
                defectId: defect.id,
                planPhotoDataUrl,
                photoDataUrls,
              })
              const syncedDefect: Defect = {
                ...defect,
                planPhotoDataUrl: planUrl ?? planPhotoDataUrl,
                photoDataUrls: photoUrls,
                syncState: 'synced',
                updatedAt: new Date().toISOString(),
              }
              await syncDefect(projectId, syncedDefect)
              set({
                defects: get().defects.map((d) => (d.id === defect.id ? syncedDefect : d)),
              })
              afterProjectChange(get, set, { syncCloud: false })
              // 輕量補進度／戶別編號到雲端（不整包重傳）
              scheduleCloudSync(get)
            } catch {
              set({
                defects: get().defects.map((d) =>
                  d.id === defect.id ? { ...d, syncState: 'failed' } : d,
                ),
              })
            }
          })()
        }

        return get().defects.find((d) => d.id === defect.id) ?? defect
      },

      updateDefectStatus: (defectId, status) => {
        const state = get()
        const defect = state.defects.find((d) => d.id === defectId)
        if (!defect) return
        set({
          defects: state.defects.map((d) =>
            d.id === defectId ? { ...d, status, updatedAt: new Date().toISOString() } : d,
          ),
          activities: [
            {
              id: createId('act'),
              at: new Date().toLocaleString('zh-TW', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }),
              buildingName: defect.buildingName,
              floor: defect.floor,
              unitCode: defect.unitCode,
              summary: `狀態更新 → ${status}`,
              actorName: '現場查驗',
            },
            ...state.activities,
          ].slice(0, 40),
        })
        afterProjectChange(get, set)
        // 狀態變更也立刻推該筆缺失
        const projectId = get().activeProjectId
        if (projectId && cloudReady()) {
          const next = get().defects.find((d) => d.id === defectId)
          if (next) void syncDefect(projectId, next)
        }
      },

      markUnitChecked: (unitId, checked) => {
        set({
          unitCheckedCount: {
            ...get().unitCheckedCount,
            [unitId]: checked,
          },
        })
        afterProjectChange(get, set)
      },

      resetDemoData: () => {
        const id = get().activeProjectId
        const name = get().projectName || '未命名專案'
        const blank = createEmptyProjectState(name)
        if (!id) {
          set({ ...blank, bundles: {}, activeProjectId: null })
          return
        }
        set({
          ...blank,
          bundles: { ...get().bundles, [id]: blank },
          activeProjectId: id,
        })
        scheduleCloudSync(get)
      },

      loadProjectBundle: (projectId) => {
        let bundle = get().bundles[projectId] ?? createEmptyProjectState(projectId)
        if (!bundle.categories.some((c) => c.active)) {
          const { categories, checklistItems } = buildDefaultChecklist()
          bundle = { ...bundle, categories, checklistItems }
          set({
            bundles: { ...get().bundles, [projectId]: structuredClone(bundle) },
          })
        }
        set({ ...structuredClone(bundle), activeProjectId: projectId })
        // 本機載入後立刻嘗試從雲端還原／合併
        void get().hydrateFromCloud(projectId)
      },

      saveProjectBundle: (projectId) => {
        const snap = snapshotProject(get())
        set({
          bundles: {
            ...get().bundles,
            [projectId]: snap,
          },
        })
      },

      ensureProjectBundle: (projectId, name) => {
        const existing = get().bundles[projectId]
        if (existing) {
          // 舊空白專案自動補上預設查驗範本
          if (!existing.categories.some((c) => c.active)) {
            const { categories, checklistItems } = buildDefaultChecklist()
            const filled = { ...existing, categories, checklistItems, projectName: existing.projectName || name }
            set({
              bundles: { ...get().bundles, [projectId]: filled },
            })
            if (get().activeProjectId === projectId) {
              set({ categories, checklistItems })
            }
          }
          return
        }
        set({
          bundles: {
            ...get().bundles,
            [projectId]: createEmptyProjectState(name),
          },
        })
      },

      removeProjectBundle: (projectId) => {
        const { bundles, activeProjectId } = get()
        if (!bundles[projectId] && activeProjectId !== projectId) return
        const next = { ...bundles }
        delete next[projectId]
        if (activeProjectId === projectId) {
          const fallbackId = Object.keys(next)[0] ?? null
          if (fallbackId) {
            set({
              ...structuredClone(next[fallbackId]),
              bundles: next,
              activeProjectId: fallbackId,
            })
          } else {
            set({
              ...createEmptyProjectState('未選擇專案'),
              bundles: next,
              activeProjectId: null,
            })
          }
          return
        }
        set({ bundles: next })
      },

      getProjectActivities: (projectId) => {
        const state = get()
        if (state.activeProjectId === projectId) return state.activities
        return state.bundles[projectId]?.activities ?? []
      },

      applyDefaultChecklist: (mode = 'fill-if-empty') => {
        const state = get()
        const hasActive = state.categories.some((c) => c.active)
        if (mode === 'fill-if-empty' && hasActive) {
          return { ok: false, reason: '已有查驗範本，未覆蓋' }
        }
        const { categories, checklistItems } = buildDefaultChecklist()
        if (mode === 'replace') {
          // 保留已停用舊項（若有缺失關聯），再疊上預設
          const keptCats = state.categories.filter((c) => !c.active)
          const keptItems = state.checklistItems.filter((i) => !i.active)
          set({
            categories: [...categories, ...keptCats],
            checklistItems: [...checklistItems, ...keptItems],
          })
        } else {
          set({ categories, checklistItems })
        }
        afterProjectChange(get, set)
        return { ok: true }
      },

      pushStructureToCloud: async () => {
        const mode = firebaseModeLabel()
        if (!cloudReady()) return { ok: false, mode }
        try {
          const projectId = get().activeProjectId ?? 'default'
          get().saveProjectBundle(projectId)
          await syncProjectStructure(projectId, get(), {
            name: get().projectName,
          })
          return { ok: true, mode }
        } catch {
          return { ok: false, mode }
        }
      },

      flushSyncNow: async () => {
        const projectId = get().activeProjectId
        if (projectId) get().saveProjectBundle(projectId)
        if (syncTimer) {
          clearTimeout(syncTimer)
          syncTimer = null
        }
        const ok = await flushCloudSync(get)
        return { ok }
      },

      hydrateFromCloud: async (projectId) => {
        if (!cloudReady() || !projectId) {
          return { ok: false, error: '尚未設定 Firebase' }
        }
        try {
          const remote = await pullProjectState(projectId)
          if (!remote) return { ok: true } // 雲端尚無資料，保留本機

          const local =
            get().activeProjectId === projectId
              ? snapshotProject(get())
              : (get().bundles[projectId] ?? createEmptyProjectState(projectId))

          const merged = mergeProjectStates(local, remote)

          set({
            bundles: { ...get().bundles, [projectId]: structuredClone(merged) },
          })

          if (get().activeProjectId === projectId) {
            set({ ...structuredClone(merged), activeProjectId: projectId })
          }

          // 本機有、雲端缺的部分補推回去
          if (
            local.buildings.length > remote.buildings.length ||
            local.defects.length > remote.defects.length
          ) {
            scheduleCloudSync(get)
          }

          return { ok: true }
        } catch (err) {
          console.warn('[hydrateFromCloud] failed', err)
          return { ok: false, error: '從雲端同步失敗' }
        }
      },

      upsertCategory: (category, items) => {
        const state = get()
        const cats = [...state.categories]
        const idx = cats.findIndex((c) => c.id === category.id)
        const nextItems = [
          ...state.checklistItems.filter((i) => i.categoryId !== category.id),
          ...items.map((it, i) => ({
            ...it,
            categoryId: category.id,
            sortOrder: i,
            active: it.active !== false,
          })),
        ]
        const synced: ChecklistCategory = {
          ...category,
          itemCount: nextItems.filter((i) => i.categoryId === category.id && i.active).length,
          active: true,
        }
        if (idx >= 0) cats[idx] = synced
        else cats.push({ ...synced, sortOrder: cats.length })

        // 連動：已存在缺失的 categoryName 跟著改
        const defects = state.defects.map((d) =>
          d.categoryId === category.id ? { ...d, categoryName: synced.name } : d,
        )

        set({ categories: cats, checklistItems: nextItems, defects })
        afterProjectChange(get, set)
      },

      removeCategory: (categoryId) => {
        const state = get()
        const hasDefects = state.defects.some(
          (d) => d.categoryId === categoryId && d.status !== 'voided',
        )
        if (hasDefects) {
          // 有歷史缺失：只能停用，保留紀錄
          set({
            categories: state.categories.map((c) =>
              c.id === categoryId ? { ...c, active: false } : c,
            ),
            checklistItems: state.checklistItems.map((i) =>
              i.categoryId === categoryId ? { ...i, active: false } : i,
            ),
          })
          afterProjectChange(get, set)
          return { ok: true, reason: '已有缺失紀錄，已改為停用（無法物理刪除）' }
        }
        set({
          categories: state.categories.filter((c) => c.id !== categoryId),
          checklistItems: state.checklistItems.filter((i) => i.categoryId !== categoryId),
        })
        afterProjectChange(get, set)
        return { ok: true }
      },

      upsertChecklistItem: (item) => {
        const state = get()
        const list = [...state.checklistItems]
        const idx = list.findIndex((i) => i.id === item.id)
        if (idx >= 0) list[idx] = item
        else list.push(item)
        const categories = state.categories.map((c) =>
          c.id === item.categoryId
            ? {
                ...c,
                itemCount: list.filter((i) => i.categoryId === c.id && i.active).length,
              }
            : c,
        )
        set({ checklistItems: list, categories })
        afterProjectChange(get, set)
      },

      removeChecklistItem: (itemId) => {
        const state = get()
        const item = state.checklistItems.find((i) => i.id === itemId)
        if (!item) return { ok: false, reason: '找不到細項' }
        const hasDefects = state.defects.some(
          (d) => d.checklistItemId === itemId && d.status !== 'voided',
        )
        if (hasDefects) {
          const list = state.checklistItems.map((i) =>
            i.id === itemId ? { ...i, active: false } : i,
          )
          const categories = state.categories.map((c) =>
            c.id === item.categoryId
              ? {
                  ...c,
                  itemCount: list.filter((i) => i.categoryId === c.id && i.active).length,
                }
              : c,
          )
          set({ checklistItems: list, categories })
          afterProjectChange(get, set)
          return { ok: true, reason: '細項已有缺失，已改為停用' }
        }
        const list = state.checklistItems.filter((i) => i.id !== itemId)
        const categories = state.categories.map((c) =>
          c.id === item.categoryId
            ? {
                ...c,
                itemCount: list.filter((i) => i.categoryId === c.id && i.active).length,
              }
            : c,
        )
        set({ checklistItems: list, categories })
        afterProjectChange(get, set)
        return { ok: true }
      },
    }),
    {
      name: 'site-inspection-v5',
      version: 6,
      // 大圖 base64 不寫入 localStorage，避免配額爆掉（QuotaExceededError）
      partialize: (state) => ({
        ...lightenProjectState(state),
        bundles: Object.fromEntries(
          Object.entries(state.bundles).map(([id, bundle]) => [
            id,
            lightenProjectState(bundle),
          ]),
        ),
        activeProjectId: state.activeProjectId,
      }),
      migrate: (persisted) => {
        const s = persisted as (ProjectState & BundleState) | null
        if (!s || typeof s !== 'object') return s as never
        return {
          ...s,
          ...lightenProjectState(s),
          bundles: Object.fromEntries(
            Object.entries(s.bundles ?? {}).map(([id, bundle]) => [
              id,
              lightenProjectState(bundle),
            ]),
          ),
          activeProjectId: s.activeProjectId ?? null,
        } as never
      },
      storage: createJSONStorage(() => ({
        getItem: (name) => localStorage.getItem(name),
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, value)
          } catch (err) {
            console.warn('[persist] quota exceeded, stripping media and retrying', err)
            try {
              purgeBloatedInspectionStorage()
              const parsed = JSON.parse(value) as {
                state?: ProjectState & BundleState
                version?: number
              }
              if (parsed.state) {
                parsed.state = {
                  ...lightenProjectState(parsed.state),
                  bundles: Object.fromEntries(
                    Object.entries(parsed.state.bundles ?? {}).map(([id, bundle]) => [
                      id,
                      lightenProjectState(bundle),
                    ]),
                  ),
                  activeProjectId: parsed.state.activeProjectId,
                }
                localStorage.setItem(name, JSON.stringify(parsed))
                return
              }
            } catch {
              /* fall through */
            }
            try {
              localStorage.removeItem(name)
            } catch {
              /* ignore */
            }
          }
        },
        removeItem: (name) => localStorage.removeItem(name),
      })),
    },
  ),
)

/** App 被滑掉／切背景前盡力寫入雲端 */
if (typeof window !== 'undefined') {
  const flush = () => {
    void useProjectStore.getState().flushSyncNow()
  }
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
}
