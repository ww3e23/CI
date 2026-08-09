import type {
  BuildingRule,
  ChecklistCategory,
  ChecklistItem,
  Defect,
  ProjectState,
} from '../types'
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
    for (const code of unitCodes) naKeys.push(naKey(floor, code))
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
  { id: 'cat_door', name: '門', iconChar: '門', color: '#2F5D4C', itemCount: 4, sortOrder: 0, active: true },
  { id: 'cat_window', name: '窗', iconChar: '窗', color: '#3C6E8F', itemCount: 3, sortOrder: 1, active: true },
  { id: 'cat_ceiling', name: '天花板', iconChar: '頂', color: '#A67C52', itemCount: 2, sortOrder: 2, active: true },
  { id: 'cat_paint', name: '粉刷牆面', iconChar: '牆', color: '#AE4C3B', itemCount: 3, sortOrder: 3, active: true },
  { id: 'cat_tile', name: '地壁磚', iconChar: '磚', color: '#6B7C8A', itemCount: 2, sortOrder: 4, active: true },
  { id: 'cat_wood', name: '木地板', iconChar: '木', color: '#8B6B4A', itemCount: 2, sortOrder: 5, active: true },
]

const checklistItems: ChecklistItem[] = [
  { id: 'item_door_1', categoryId: 'cat_door', description: '門鎖是否可正常上鎖開鎖？', sortOrder: 0, active: true },
  { id: 'item_door_2', categoryId: 'cat_door', description: '門片是否有刮傷或變形？', sortOrder: 1, active: true },
  { id: 'item_door_3', categoryId: 'cat_door', description: '門框是否密合無縫隙？', sortOrder: 2, active: true },
  { id: 'item_door_4', categoryId: 'cat_door', description: '門擋／門止是否已安裝？', sortOrder: 3, active: true },
  { id: 'item_win_1', categoryId: 'cat_window', description: '窗扇推拉是否順暢？', sortOrder: 0, active: true },
  { id: 'item_win_2', categoryId: 'cat_window', description: '玻璃是否有刮傷？', sortOrder: 1, active: true },
  { id: 'item_win_3', categoryId: 'cat_window', description: '窗框防水是否確實？', sortOrder: 2, active: true },
  { id: 'item_ceil_1', categoryId: 'cat_ceiling', description: '天花板平整無裂縫？', sortOrder: 0, active: true },
  { id: 'item_ceil_2', categoryId: 'cat_ceiling', description: '燈具安裝是否牢固？', sortOrder: 1, active: true },
  { id: 'item_paint_1', categoryId: 'cat_paint', description: '牆面油漆是否均勻？', sortOrder: 0, active: true },
  { id: 'item_paint_2', categoryId: 'cat_paint', description: '陰角是否平直？', sortOrder: 1, active: true },
  { id: 'item_paint_3', categoryId: 'cat_paint', description: '是否有滲色或色差？', sortOrder: 2, active: true },
  { id: 'item_tile_1', categoryId: 'cat_tile', description: '磁磚是否空鼓？', sortOrder: 0, active: true },
  { id: 'item_tile_2', categoryId: 'cat_tile', description: '磚縫是否均勻？', sortOrder: 1, active: true },
  { id: 'item_wood_1', categoryId: 'cat_wood', description: '地板是否平整無異響？', sortOrder: 0, active: true },
  { id: 'item_wood_2', categoryId: 'cat_wood', description: '收邊條是否密合？', sortOrder: 1, active: true },
]

// sync itemCount with actual items
for (const c of categories) {
  c.itemCount = checklistItems.filter((i) => i.categoryId === c.id && i.active).length
}

const units = expandUnitsFromBuildings(buildings)
const totalItems = categories.reduce((s, c) => s + c.itemCount, 0)

const unitCheckedCount: Record<string, number> = {}
for (const u of units) {
  if (!u.active) continue
  const floorNum = Number(u.floor.replace('F', ''))
  if (u.buildingName === 'E棟' && floorNum >= 1 && floorNum <= 6) {
    unitCheckedCount[u.id] = Math.round(totalItems * 0.55)
  } else if (u.buildingName === 'F棟' && u.code === 'F1' && u.floor === '4F') {
    unitCheckedCount[u.id] = Math.round(totalItems * 0.4)
  } else if (floorNum >= 1 && floorNum <= 6) {
    unitCheckedCount[u.id] = totalItems
  } else if (u.floor === '7F' && u.buildingName === 'A棟') {
    unitCheckedCount[u.id] = totalItems
  } else {
    unitCheckedCount[u.id] = 0
  }
}

const sampleUnit =
  units.find((u) => u.buildingName === 'B棟' && u.floor === '3F' && u.code === 'B3') ??
  units.find((u) => u.active)!

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
    checklistItemId: 'item_door_1',
    area: '客廳',
    description: '門鎖無法正常上鎖',
    status: 'pending_repair',
    photoDataUrls: [],
    syncState: 'demo',
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
    checklistItemId: 'item_door_2',
    area: '客廳',
    description: '門片表面刮傷',
    status: 'pending_repair',
    photoDataUrls: [],
    syncState: 'demo',
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
    checklistItemId: 'item_win_1',
    area: '主臥',
    description: '窗扇推拉不順',
    status: 'pending_reinspection',
    photoDataUrls: [],
    syncState: 'demo',
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
    categoryId: 'cat_door',
    categoryName: '門',
    checklistItemId: 'item_door_3',
    area: '玄關',
    description: '門框縫隙過大',
    status: 'completed',
    photoDataUrls: [],
    syncState: 'demo',
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
    categoryId: 'cat_paint',
    categoryName: '粉刷牆面',
    checklistItemId: 'item_paint_1',
    area: '臥室1',
    description: '油漆色差不均',
    status: 'returned',
    photoDataUrls: [],
    syncState: 'demo',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

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
    checklistItemId: 'item_door_1',
    area: '玄關',
    description: i % 2 === 0 ? '門框縫隙過大' : '把手鬆動',
    status: i % 3 === 0 ? 'completed' : i % 3 === 1 ? 'pending_reinspection' : 'pending_repair',
    photoDataUrls: [],
    syncState: 'demo',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
})

export const seedState: ProjectState = {
  projectName: '晴川院子',
  buildings,
  units,
  categories,
  checklistItems,
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
  areas: ['玄關', '客廳', '餐廳', '廚房', '主臥', '臥室1', '主浴', '客浴', '前陽台'],
}

function cloneProjectState(name: string): ProjectState {
  return structuredClone({ ...seedState, projectName: name })
}

/** 各專案現場資料包（示範） */
export function createProjectBundles(): Record<string, ProjectState> {
  return {
    proj_qingchuan: cloneProjectState('晴川院子'),
    proj_songtao: cloneProjectState('松濤匯'),
    proj_hean: cloneProjectState('河岸敘'),
  }
}
