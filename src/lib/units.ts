import type { BuildingRule, Unit } from '../types'
import { createId } from './id'
import { naKey } from './floors'

/** 取得某樓層實際戶別編號（有覆寫用覆寫，否則用預設 unitCodes） */
export function codesForFloor(b: BuildingRule, floor: string): string[] {
  const override = b.floorUnitCodes?.[floor]
  if (override && override.length > 0) return override
  return b.unitCodes ?? []
}

/** 是否有「各層戶別不同」的設定 */
export function hasPerFloorUnitCodes(b: BuildingRule): boolean {
  if (!b.floorUnitCodes) return false
  return Object.values(b.floorUnitCodes).some((codes) => Array.isArray(codes) && codes.length > 0)
}

/** 依棟別規則展開全部戶別（不需一戶一戶手動新增） */
export function expandUnitsFromBuildings(buildings: BuildingRule[]): Unit[] {
  const units: Unit[] = []
  for (const b of buildings.filter((x) => x.active)) {
    for (const floor of b.floors) {
      for (const code of codesForFloor(b, floor)) {
        const key = naKey(floor, code)
        const active = !b.naKeys.includes(key)
        units.push({
          id: `${b.id}_${floor}_${code}`,
          buildingId: b.id,
          buildingName: b.name,
          floor,
          code,
          label: `${b.name} ${floor} ${code}戶`,
          active,
          nextDefectNumber: 1,
        })
      }
    }
  }
  return units
}

export function summarizeBuilding(b: BuildingRule): string {
  if (!b.floors.length) return '尚未設定樓層'
  const first = b.floors[0]
  const last = b.floors[b.floors.length - 1]
  const floorText = b.floors.length === 1 ? first : `${first}-${last}`
  if (hasPerFloorUnitCodes(b)) {
    return `${floorText}｜各層戶別不同・${countActiveUnits(b)} 戶`
  }
  return `${floorText}｜每層 ${b.unitCodes.length} 戶`
}

export function countActiveUnits(b: BuildingRule): number {
  let n = 0
  for (const floor of b.floors) {
    for (const code of codesForFloor(b, floor)) {
      if (!b.naKeys.includes(naKey(floor, code))) n += 1
    }
  }
  return n
}

export function countTotalSlots(b: BuildingRule): number {
  let n = 0
  for (const floor of b.floors) {
    n += codesForFloor(b, floor).length
  }
  return n
}

export function newBuildingDraft(partial?: Partial<BuildingRule>): BuildingRule {
  return {
    id: createId('bldg'),
    name: 'A棟',
    floors: ['1F', '2F', '3F', '4F', '5F', '6F', '7F'],
    unitCodes: ['A1', 'A2', 'A3', 'A5'],
    naKeys: [],
    sortOrder: 0,
    active: true,
    ...partial,
  }
}
