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

/** 未改善缺失（不含已改善、作廢） */
export function openDefectCount(defects: Defect[], unitId: string): number {
  return defects.filter(
    (d) =>
      d.unitId === unitId &&
      d.status !== 'voided' &&
      d.status !== 'completed',
  ).length
}

export function activeCategories(state: ProjectState) {
  return state.categories.filter((c) => c.active).sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * 此戶大項進度：
 * - done：已標記「大項查畢」
 * - started：已查畢，或該大項已有非作廢缺失（代表已實地查過，細項不必全勾）
 */
export function unitCategoryProgress(
  unitId: string,
  state: ProjectState,
): {
  doneIds: string[]
  done: number
  startedIds: string[]
  started: number
  total: number
  complete: boolean
} {
  const cats = activeCategories(state)
  const doneIds = state.unitCategoryDone?.[unitId] ?? []
  const doneSet = new Set(doneIds)
  const defectCatIds = new Set(
    state.defects
      .filter((d) => d.unitId === unitId && d.status !== 'voided')
      .map((d) => d.categoryId),
  )
  const startedIds = cats
    .filter((c) => doneSet.has(c.id) || defectCatIds.has(c.id))
    .map((c) => c.id)
  const done = cats.filter((c) => doneSet.has(c.id)).length
  const started = startedIds.length
  const total = cats.length
  return {
    doneIds,
    done,
    startedIds,
    started,
    total,
    complete: total > 0 && done >= total,
  }
}

/** 該戶是否所有大項皆已查畢（Excel 綠底／避免重複查驗） */
export function unitIsInspectionComplete(state: ProjectState, unitId: string): boolean {
  const catProg = unitCategoryProgress(unitId, state)
  if (catProg.complete) return true
  const itemTotal = totalChecklistItems(state)
  const legacyChecked = state.unitCheckedCount[unitId] ?? 0
  return itemTotal > 0 && legacyChecked >= itemTotal
}

export function unitProgress(
  unit: Unit,
  state: ProjectState,
): { checked: number; total: number; percent: number; defectCount: number; status: CellStatus } {
  const itemTotal = totalChecklistItems(state)
  if (!unit.active) {
    return { checked: 0, total: itemTotal, percent: 0, defectCount: 0, status: 'na' }
  }

  const catProg = unitCategoryProgress(unit.id, state)
  const defectCount = openDefectCount(state.defects, unit.id)

  // 進度以「大項查畢」為準；舊的 unitCheckedCount 僅作後援
  const legacyChecked = state.unitCheckedCount[unit.id] ?? 0
  const percentFromCats =
    catProg.total === 0 ? 0 : Math.round((catProg.started / catProg.total) * 100)
  const percentFromLegacy =
    itemTotal === 0 ? 0 : Math.round((Math.min(legacyChecked, itemTotal) / itemTotal) * 100)
  const percent = Math.max(percentFromCats, percentFromLegacy)
  const complete = catProg.complete || (itemTotal > 0 && legacyChecked >= itemTotal)

  let status: CellStatus = 'not_started'
  if (complete) status = 'completed'
  else if (defectCount > 0) status = 'has_defects'
  else if (catProg.started > 0 || legacyChecked > 0) status = 'in_progress'

  return {
    checked: complete ? itemTotal : Math.min(legacyChecked, itemTotal),
    total: itemTotal,
    percent,
    defectCount,
    status,
  }
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
