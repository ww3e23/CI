import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BuildingRule, Defect, DefectStatus, ProjectState, SyncState } from '../types'
import { createProjectBundles, seedState } from '../data/seed'
import { expandUnitsFromBuildings } from '../lib/units'
import { createId } from '../lib/id'
import { cloudReady, syncDefect, syncProjectStructure } from '../services/cloudSync'
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
          set({
            defects: get().defects.map((d) =>
              d.id === defect.id ? { ...d, syncState: 'syncing' } : d,
            ),
          })
          try {
            await syncDefect(defect)
            set({
              defects: get().defects.map((d) =>
                d.id === defect.id ? { ...d, syncState: 'synced' } : d,
              ),
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

      pushStructureToCloud: async () => {
        const mode = firebaseModeLabel()
        if (!cloudReady()) return { ok: false, mode }
        try {
          await syncProjectStructure(get())
          return { ok: true, mode }
        } catch {
          return { ok: false, mode }
        }
      },
    }),
    {
      name: 'site-inspection-v4',
      version: 4,
    },
  ),
)
