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
  /**
   * 此戶手動自訂查驗區域（優先級最高）。
   * 有值時不再跟隨專案預設或格局範本。
   */
  areas?: string[]
  /**
   * 綁定的格局區域範本 ID。
   * 無手動 areas 時，區域清單跟隨該範本（範本改了會一起變）。
   */
  areaTemplateId?: string
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
  /** 新增此筆缺失的查驗人員姓名 */
  createdByName?: string
  /** 新增者帳號（例如 a11897），比顯示名更穩定 */
  createdByAccount?: string
  /** 最近修改此筆的人員姓名 */
  updatedByName?: string
  /** 最近修改者帳號 */
  updatedByAccount?: string
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
  /** 操作者帳號（例如 a11897）；用於辨識真實操作者，避免顯示名混淆 */
  actorAccount?: string
}

/** 格局／查驗區域範本（可批量套用到多戶） */
export interface AreaTemplate {
  id: string
  /** 系統自動編碼，例如 G01 */
  code: string
  name: string
  areas: string[]
  updatedAt: string
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
  /** 格局區域範本清單 */
  areaTemplates: AreaTemplate[]
}
