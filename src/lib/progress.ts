import type {
  ActivityLog,
  BuildingRule,
  CellStatus,
  Defect,
  ProgressCell,
  ProjectState,
  Unit,
} from '../types'
import { sortFloorsDesc } from './floors'
import { naKey } from './floors'

export function totalChecklistItems(state: ProjectState): number {
  return state.categories
    .filter((c) => c.active)
    .reduce((sum, c) => sum + c.itemCount, 0)
}

export function unitProgress(
  unit: Unit,
  state: ProjectState,
): { checked: number; total: number; percent: number; defectCount: number; status: CellStatus } {
  const total = totalChecklistItems(state)
  if (!unit.active) {
    return { checked: 0, total, percent: 0, defectCount: 0, status: 'na' }
  }
  const checked = state.unitCheckedCount[unit.id] ?? 0
  const defectCount = state.defects.filter(
    (d) => d.unitId === unit.id && d.status !== 'voided',
  ).length
  const percent = total === 0 ? 0 : Math.round((Math.min(checked, total) / total) * 100)

  let status: CellStatus = 'not_started'
  if (percent >= 100) status = 'completed'
  else if (defectCount > 0) status = 'has_defects'
  else if (checked > 0) status = 'in_progress'

  return { checked: Math.min(checked, total), total, percent, defectCount, status }
}

export function buildMatrix(state: ProjectState): {
  floors: string[]
  buildings: BuildingRule[]
  cells: ProgressCell[]
  buildingPercents: { buildingId: string; name: string; percent: number }[]
  overallPercent: number
  activeUnitCount: number
  naCount: number
} {
  const buildings = [...state.buildings]
    .filter((b) => b.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const floorSet = new Set<string>()
  for (const b of buildings) {
    for (const f of b.floors) floorSet.add(f)
  }
  const floors = sortFloorsDesc([...floorSet])

  const unitMap = new Map(state.units.map((u) => [u.id, u]))
  const cells: ProgressCell[] = []
  let weighted = 0
  let weightTotal = 0
  let activeUnitCount = 0
  let naCount = 0

  const buildingStats = new Map<string, { done: number; total: number }>()

  for (const b of buildings) {
    buildingStats.set(b.id, { done: 0, total: 0 })
    for (const floor of floors) {
      if (!b.floors.includes(floor)) {
        for (const code of b.unitCodes) {
          cells.push({
            unitId: null,
            buildingId: b.id,
            buildingName: b.name,
            floor,
            unitCode: code,
            status: 'na',
            checkedItems: 0,
            totalItems: 0,
            defectCount: 0,
            percent: 0,
          })
          naCount += 1
        }
        continue
      }
      for (const code of b.unitCodes) {
        const id = `${b.id}_${floor}_${code}`
        const unit = unitMap.get(id)
        const isNa = b.naKeys.includes(naKey(floor, code)) || !unit?.active
        if (isNa || !unit) {
          cells.push({
            unitId: unit?.id ?? null,
            buildingId: b.id,
            buildingName: b.name,
            floor,
            unitCode: code,
            status: 'na',
            checkedItems: 0,
            totalItems: 0,
            defectCount: 0,
            percent: 0,
          })
          naCount += 1
          continue
        }
        const p = unitProgress(unit, state)
        cells.push({
          unitId: unit.id,
          buildingId: b.id,
          buildingName: b.name,
          floor,
          unitCode: code,
          status: p.status,
          checkedItems: p.checked,
          totalItems: p.total,
          defectCount: p.defectCount,
          percent: p.percent,
        })
        activeUnitCount += 1
        weighted += p.percent
        weightTotal += 1
        const st = buildingStats.get(b.id)!
        st.done += p.percent
        st.total += 1
      }
    }
  }

  const buildingPercents = buildings.map((b) => {
    const st = buildingStats.get(b.id)!
    return {
      buildingId: b.id,
      name: b.name,
      percent: st.total === 0 ? 0 : Math.round(st.done / st.total),
    }
  })

  return {
    floors,
    buildings,
    cells,
    buildingPercents,
    overallPercent: weightTotal === 0 ? 0 : Math.round(weighted / weightTotal),
    activeUnitCount,
    naCount,
  }
}

export function defectsByStatus(defects: Defect[]) {
  const open = defects.filter((d) => d.status !== 'voided')
  return {
    all: open.length,
    pending_repair: open.filter((d) => d.status === 'pending_repair').length,
    pending_reinspection: open.filter((d) => d.status === 'pending_reinspection').length,
    returned: open.filter((d) => d.status === 'returned').length,
    completed: open.filter((d) => d.status === 'completed').length,
  }
}

export function statusLabel(status: Defect['status']): string {
  switch (status) {
    case 'pending_repair':
      return '待改善'
    case 'pending_reinspection':
      return '待複驗'
    case 'completed':
      return '已改善'
    case 'returned':
      return '退回改善'
    case 'voided':
      return '作廢'
  }
}

export function formatActivity(a: ActivityLog): string {
  return `${a.buildingName} ${a.floor} ${a.unitCode}`
}
