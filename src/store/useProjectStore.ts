import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  BuildingRule,
  ChecklistCategory,
  ChecklistItem,
  Defect,
  DefectStatus,
  ProjectState,
  SyncState,
} from '../types'
import { createProjectBundles, seedState } from '../data/seed'
import { expandUnitsFromBuildings } from '../lib/units'
import { createId } from '../lib/id'
import { cloudReady, syncDefect, syncProjectStructure } from '../services/cloudSync'
import { uploadDataUrl } from '../services/storageUpload'
import { firebaseModeLabel } from '../lib/firebase'

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
  loadProjectBundle: (projectId: string) => void
  saveProjectBundle: (projectId: string) => void
  ensureProjectBundle: (projectId: string, name: string) => void
  removeProjectBundle: (projectId: string) => void
  /** 讀取指定專案歷程（作用中專案用即時資料，其餘讀 bundle） */
  getProjectActivities: (projectId: string) => ProjectState['activities']
  upsertCategory: (category: ChecklistCategory, items: ChecklistItem[]) => void
  removeCategory: (categoryId: string) => { ok: boolean; reason?: string }
  upsertChecklistItem: (item: ChecklistItem) => void
  removeChecklistItem: (itemId: string) => { ok: boolean; reason?: string }
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

export const useProjectStore = create<ProjectState & BundleState & ProjectActions>()(
  persist(
    (set, get) => ({
      ...seedState,
      bundles: initialBundles,
      activeProjectId: 'proj_qingchuan',

      setCurrentUnit: (unitId) => {
        const recent = [unitId, ...get().recentUnitIds.filter((id) => id !== unitId)].slice(0, 8)
        set({ currentUnitId: unitId, recentUnitIds: recent })
      },

      upsertBuilding: (building) => {
        const buildings = [...get().buildings]
        const idx = buildings.findIndex((b) => b.id === building.id)
        if (idx >= 0) buildings[idx] = building
        else buildings.push({ ...building, sortOrder: buildings.length })
        set({ buildings, units: rebuildUnits(buildings, get().units) })
      },

      removeBuilding: (buildingId) => {
        const hasDefects = get().defects.some((d) => d.buildingId === buildingId)
        const nextBuildings = hasDefects
          ? get().buildings.map((b) =>
              b.id === buildingId ? { ...b, active: false } : b,
            )
          : get().buildings.filter((b) => b.id !== buildingId)
        set({ buildings: nextBuildings, units: rebuildUnits(nextBuildings, get().units) })
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

        if (cloudReady()) {
          const projectId = get().activeProjectId
          set({
            defects: get().defects.map((d) =>
              d.id === defect.id ? { ...d, syncState: 'syncing' } : d,
            ),
          })
          try {
            if (!projectId) throw new Error('缺少專案 ID')

            let planUrl = planPhotoDataUrl
            if (planUrl?.startsWith('data:')) {
              const up = await uploadDataUrl({
                projectId,
                defectId: defect.id,
                kind: 'plan',
                dataUrl: planUrl,
              })
              if (up) planUrl = up.url
            }

            const photoUrls: string[] = []
            for (let i = 0; i < photoDataUrls.length; i += 1) {
              const src = photoDataUrls[i]
              if (src.startsWith('data:')) {
                const up = await uploadDataUrl({
                  projectId,
                  defectId: defect.id,
                  kind: 'photo',
                  index: i,
                  dataUrl: src,
                })
                photoUrls.push(up?.url ?? src)
              } else {
                photoUrls.push(src)
              }
            }

            const syncedDefect: Defect = {
              ...defect,
              planPhotoDataUrl: planUrl,
              photoDataUrls: photoUrls,
              syncState: 'synced',
              updatedAt: new Date().toISOString(),
            }

            await syncDefect(projectId, syncedDefect)
            set({
              defects: get().defects.map((d) => (d.id === defect.id ? syncedDefect : d)),
            })
          } catch {
            set({
              defects: get().defects.map((d) =>
                d.id === defect.id ? { ...d, syncState: 'failed' } : d,
              ),
            })
          }
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
      },

      markUnitChecked: (unitId, checked) => {
        set({
          unitCheckedCount: {
            ...get().unitCheckedCount,
            [unitId]: checked,
          },
        })
      },

      resetDemoData: () => {
        const bundles = createProjectBundles()
        const id = get().activeProjectId ?? 'proj_qingchuan'
        set({ ...bundles[id], bundles, activeProjectId: id })
      },

      loadProjectBundle: (projectId) => {
        const bundle = get().bundles[projectId] ?? {
          ...structuredClone(seedState),
          projectName: projectId,
        }
        set({ ...structuredClone(bundle), activeProjectId: projectId })
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
        if (get().bundles[projectId]) return
        set({
          bundles: {
            ...get().bundles,
            [projectId]: { ...structuredClone(seedState), projectName: name },
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
              ...structuredClone(seedState),
              projectName: '未選擇專案',
              bundles: next,
              activeProjectId: null,
              currentUnitId: '',
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

      pushStructureToCloud: async () => {
        const mode = firebaseModeLabel()
        if (!cloudReady()) return { ok: false, mode }
        try {
          const projectId = get().activeProjectId ?? 'default'
          await syncProjectStructure(projectId, get(), {
            name: get().projectName,
          })
          return { ok: true, mode }
        } catch {
          return { ok: false, mode }
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
          return { ok: true, reason: '已有缺失紀錄，已改為停用（無法物理刪除）' }
        }
        set({
          categories: state.categories.filter((c) => c.id !== categoryId),
          checklistItems: state.checklistItems.filter((i) => i.categoryId !== categoryId),
        })
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
        return { ok: true }
      },
    }),
    {
      name: 'site-inspection-v4',
      version: 4,
    },
  ),
)
