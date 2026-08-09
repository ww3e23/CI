export type DefectStatus =
  | 'pending_repair'
  | 'pending_reinspection'
  | 'completed'
  | 'returned'
  | 'voided'

export type CellStatus = 'na' | 'not_started' | 'in_progress' | 'has_defects' | 'completed'

export interface BuildingRule {
  id: string
  name: string
  /** 樓層標籤，由高到低顯示時再反轉 */
  floors: string[]
  /** 各層共用的戶別編號，如 A1,A2,A3,A5 */
  unitCodes: string[]
  /** 標記不適用的「樓層|戶別」，如 "B1F|A1" */
  naKeys: string[]
  sortOrder: number
  active: boolean
}

export interface Unit {
  id: string
  buildingId: string
  buildingName: string
  floor: string
  code: string
  label: string
  active: boolean
  nextDefectNumber: number
}

export interface ChecklistCategory {
  id: string
  name: string
  iconChar: string
  color: string
  itemCount: number
  sortOrder: number
  active: boolean
}

export interface Defect {
  id: string
  unitId: string
  buildingId: string
  buildingName: string
  floor: string
  unitCode: string
  defectNumber: number
  categoryId: string
  categoryName: string
  area: string
  description: string
  status: DefectStatus
  createdAt: string
  updatedAt: string
}

export interface ProgressCell {
  unitId: string | null
  buildingId: string
  buildingName: string
  floor: string
  unitCode: string
  status: CellStatus
  checkedItems: number
  totalItems: number
  defectCount: number
  percent: number
}

export interface ActivityLog {
  id: string
  at: string
  buildingName: string
  floor: string
  unitCode: string
  summary: string
  actorName: string
}

export interface ProjectState {
  projectName: string
  buildings: BuildingRule[]
  units: Unit[]
  categories: ChecklistCategory[]
  defects: Defect[]
  /** unitId -> 已查驗細項數 */
  unitCheckedCount: Record<string, number>
  activities: ActivityLog[]
  currentUnitId: string | null
  recentUnitIds: string[]
}
