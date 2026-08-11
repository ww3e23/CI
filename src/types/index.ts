export type DefectStatus =
  | 'pending_repair'
  | 'pending_reinspection'
  | 'completed'
  | 'returned'
  | 'voided'

export type CellStatus = 'na' | 'not_started' | 'in_progress' | 'has_defects' | 'completed'

export type SyncState = 'synced' | 'pending' | 'syncing' | 'failed' | 'demo'

export interface BuildingRule {
  id: string
  name: string
  floors: string[]
  unitCodes: string[]
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
  /** 此戶專屬查驗區域（客廳／臥室等）；未設定時沿用專案預設 areas */
  areas?: string[]
  /** 此戶預設位置圖（圖面）網址；新增缺失時自動帶入供標註 */
  defaultPlanPhotoUrl?: string
}

export interface ChecklistItem {
  id: string
  categoryId: string
  description: string
  sortOrder: number
  active: boolean
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
  checklistItemId?: string
  area: string
  description: string
  status: DefectStatus
  planPhotoDataUrl?: string
  photoDataUrls: string[]
  syncState: SyncState
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
  checklistItems: ChecklistItem[]
  defects: Defect[]
  unitCheckedCount: Record<string, number>
  /**
   * 各戶已查畢的大項 ID 列表。
   * 當啟用中的大項全部列入時，該戶視為「查驗完成」（Excel 綠底）。
   */
  unitCategoryDone: Record<string, string[]>
  activities: ActivityLog[]
  currentUnitId: string | null
  recentUnitIds: string[]
  areas: string[]
}
