import type { BuildingRule, ChecklistCategory, Defect, ProjectState } from '../types'
import { expandFloorRange, naKey } from '../lib/floors'
import { expandUnitsFromBuildings } from '../lib/units'
import { createId } from '../lib/id'

function makeBuilding(
  name: string,
  unitCodes: string[],
  sortOrder: number,
  floors = expandFloorRange('B3F', 'R2F'),
  naFloors = ['B3F', 'B2F', 'B1F', 'R1F', 'R2F'],
): BuildingRule {
  const naKeys: string[] = []
  for (const floor of naFloors) {
    for (const code of unitCodes) {
      naKeys.push(naKey(floor, code))
    }
  }
  return {
    id: `bldg_${name.replace('棟', '')}`,
    name,
    floors,
    unitCodes,
    naKeys,
    sortOrder,
    active: true,
  }
}

const buildings: BuildingRule[] = [
  makeBuilding('A棟', ['A1', 'A2', 'A3', 'A5'], 0),
  makeBuilding('B棟', ['B1', 'B2', 'B3', 'B5'], 1),
  makeBuilding('C棟', ['C1', 'C2', 'C3', 'C5'], 2),
  makeBuilding('D棟', ['D1', 'D2', 'D3'], 3),
  makeBuilding('E棟', ['E1', 'E2', 'E3'], 4),
  makeBuilding('F棟', ['F1', 'F2', 'F3'], 5),
  makeBuilding('G棟', ['G1', 'G2'], 6),
]

const categories: ChecklistCategory[] = [
  { id: 'cat_door', name: '門', iconChar: '門', color: '#2f7a4d', itemCount: 7, sortOrder: 0, active: true },
  { id: 'cat_window', name: '窗', iconChar: '窗', color: '#3b6ea5', itemCount: 7, sortOrder: 1, active: true },
  { id: 'cat_ceiling', name: '天花板', iconChar: '頂', color: '#a67c52', itemCount: 4, sortOrder: 2, active: true },
  { id: 'cat_paint', name: '粉刷牆面', iconChar: '牆', color: '#c46b7a', itemCount: 8, sortOrder: 3, active: true },
  { id: 'cat_tile', name: '地壁磚', iconChar: '磚', color: '#6b7c8a', itemCount: 3, sortOrder: 4, active: true },
  { id: 'cat_wood', name: '木地板', iconChar: '木', color: '#8b6b4a', itemCount: 2, sortOrder: 5, active: true },
]

const units = expandUnitsFromBuildings(buildings)
const totalItems = categories.reduce((s, c) => s + c.itemCount, 0)

const unitCheckedCount: Record<string, number> = {}

for (const u of units) {
  if (!u.active) continue
  const floorNum = Number(u.floor.replace('F', ''))
  // 1F-6F 大多完成；7F 部分未做；E棟偏慢；F1 4F 有問題
  if (u.buildingName === 'E棟' && floorNum >= 1 && floorNum <= 6) {
    unitCheckedCount[u.id] = Math.round(totalItems * 0.55)
  } else if (u.buildingName === 'F棟' && u.code === 'F1' && u.floor === '4F') {
    unitCheckedCount[u.id] = Math.round(totalItems * 0.4)
  } else if (floorNum >= 1 && floorNum <= 6) {
    unitCheckedCount[u.id] = totalItems
  } else if (u.floor === '7F' && u.buildingName === 'A棟') {
    unitCheckedCount[u.id] = totalItems
  } else if (u.floor === '7F') {
    unitCheckedCount[u.id] = 0
  } else {
    unitCheckedCount[u.id] = 0
  }
}

const sampleUnit = units.find((u) => u.label.includes('B棟') && u.floor === '3F' && u.code === 'B3')
  ?? units.find((u) => u.active)!

const defects: Defect[] = [
  {
    id: createId('def'),
    unitId: sampleUnit.id,
    buildingId: sampleUnit.buildingId,
    buildingName: sampleUnit.buildingName,
    floor: sampleUnit.floor,
    unitCode: sampleUnit.code,
    defectNumber: 1,
    categoryId: 'cat_door',
    categoryName: '門',
    area: '客廳',
    description: '門片表面刮傷',
    status: 'pending_repair',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: createId('def'),
    unitId: sampleUnit.id,
    buildingId: sampleUnit.buildingId,
    buildingName: sampleUnit.buildingName,
    floor: sampleUnit.floor,
    unitCode: sampleUnit.code,
    defectNumber: 2,
    categoryId: 'cat_door',
    categoryName: '門',
    area: '客廳',
    description: '門鎖無法正常上鎖',
    status: 'pending_repair',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: createId('def'),
    unitId: sampleUnit.id,
    buildingId: sampleUnit.buildingId,
    buildingName: sampleUnit.buildingName,
    floor: sampleUnit.floor,
    unitCode: sampleUnit.code,
    defectNumber: 3,
    categoryId: 'cat_window',
    categoryName: '窗',
    area: '主臥',
    description: '窗扇推拉不順',
    status: 'pending_reinspection',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: createId('def'),
    unitId: sampleUnit.id,
    buildingId: sampleUnit.buildingId,
    buildingName: sampleUnit.buildingName,
    floor: sampleUnit.floor,
    unitCode: sampleUnit.code,
    defectNumber: 4,
    categoryId: 'cat_paint',
    categoryName: '粉刷牆面',
    area: '臥室1',
    description: '油漆色差不均',
    status: 'pending_repair',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: createId('def'),
    unitId: sampleUnit.id,
    buildingId: sampleUnit.buildingId,
    buildingName: sampleUnit.buildingName,
    floor: sampleUnit.floor,
    unitCode: sampleUnit.code,
    defectNumber: 5,
    categoryId: 'cat_tile',
    categoryName: '地壁磚',
    area: '客浴',
    description: '磁磚空鼓',
    status: 'completed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

// 補齊更多示範缺失（跨棟）
const moreUnits = units.filter((u) => u.active && u.floor === '2F').slice(0, 6)
moreUnits.forEach((u, i) => {
  defects.push({
    id: createId('def'),
    unitId: u.id,
    buildingId: u.buildingId,
    buildingName: u.buildingName,
    floor: u.floor,
    unitCode: u.code,
    defectNumber: 1,
    categoryId: 'cat_door',
    categoryName: '門',
    area: '玄關',
    description: i % 2 === 0 ? '門框縫隙過大' : '把手鬆動',
    status: i % 3 === 0 ? 'completed' : i % 3 === 1 ? 'pending_reinspection' : 'pending_repair',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
})

export const seedState: ProjectState = {
  projectName: '示範建案｜現場查驗',
  buildings,
  units,
  categories,
  defects,
  unitCheckedCount,
  activities: [
    {
      id: 'act1',
      at: '7/27 16:11',
      buildingName: 'C棟',
      floor: '1F',
      unitCode: 'C3',
      summary: '雙封完成 → 灌漿完成',
      actorName: '謝采辰',
    },
    {
      id: 'act2',
      at: '7/27 15:48',
      buildingName: 'A棟',
      floor: '5F',
      unitCode: 'A3',
      summary: '查驗完成 → 缺失已登錄',
      actorName: '謝采辰',
    },
    {
      id: 'act3',
      at: '7/27 14:20',
      buildingName: 'E棟',
      floor: '3F',
      unitCode: 'E2',
      summary: '待改善 → 待複驗',
      actorName: '王建宏',
    },
  ],
  currentUnitId: sampleUnit.id,
  recentUnitIds: [sampleUnit.id],
}
