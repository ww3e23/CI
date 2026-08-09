import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BuildingRule, Defect, DefectStatus, ProjectState } from '../types'
import { seedState } from '../data/seed'
import { expandUnitsFromBuildings } from '../lib/units'
import { createId } from '../lib/id'

interface ProjectActions {
  setCurrentUnit: (unitId: string) => void
  upsertBuilding: (building: BuildingRule) => void
  removeBuilding: (buildingId: string) => void
  reorderBuildings: (buildingIds: string[]) => void
  addDefect: (input: {
    unitId: string
    categoryId: string
    categoryName: string
    area: string
    description: string
  }) => void
  updateDefectStatus: (defectId: string, status: DefectStatus) => void
  markUnitChecked: (unitId: string, checked: number) => void
  resetDemoData: () => void
}

function rebuildUnits(buildings: BuildingRule[], prevUnits: ProjectState['units']) {
  const next = expandUnitsFromBuildings(buildings)
  const prevMap = new Map(prevUnits.map((u) => [u.id, u]))
  return next.map((u) => {
    const old = prevMap.get(u.id)
    return old ? { ...u, nextDefectNumber: old.nextDefectNumber } : u
  })
}

export const useProjectStore = create<ProjectState & ProjectActions>()(
  persist(
    (set, get) => ({
      ...seedState,

      setCurrentUnit: (unitId) => {
        const recent = [unitId, ...get().recentUnitIds.filter((id) => id !== unitId)].slice(0, 8)
        set({ currentUnitId: unitId, recentUnitIds: recent })
      },

      upsertBuilding: (building) => {
        const buildings = [...get().buildings]
        const idx = buildings.findIndex((b) => b.id === building.id)
        if (idx >= 0) buildings[idx] = building
        else buildings.push({ ...building, sortOrder: buildings.length })
        const units = rebuildUnits(buildings, get().units)
        set({ buildings, units })
      },

      removeBuilding: (buildingId) => {
        const hasDefects = get().defects.some((d) => d.buildingId === buildingId)
        // 有歷史則停用；無歷史則刪除
        const nextBuildings = hasDefects
          ? get().buildings.map((b) =>
              b.id === buildingId ? { ...b, active: false } : b,
            )
          : get().buildings.filter((b) => b.id !== buildingId)
        const units = rebuildUnits(nextBuildings, get().units)
        set({ buildings: nextBuildings, units })
      },

      reorderBuildings: (buildingIds) => {
        const map = new Map(get().buildings.map((b) => [b.id, b]))
        const buildings = buildingIds
          .map((id, i) => {
            const b = map.get(id)
            return b ? { ...b, sortOrder: i } : null
          })
          .filter(Boolean) as BuildingRule[]
        set({ buildings })
      },

      addDefect: ({ unitId, categoryId, categoryName, area, description }) => {
        const state = get()
        const unit = state.units.find((u) => u.id === unitId)
        if (!unit) return
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
          area,
          description,
          status: 'pending_repair',
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

      resetDemoData: () => set({ ...seedState }),
    }),
    {
      name: 'site-inspection-v1',
    },
  ),
)
