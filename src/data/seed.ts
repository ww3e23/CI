import type { ProjectState } from '../types'
import { buildDefaultChecklist } from './defaultChecklist'
import { DEFAULT_AREAS } from '../lib/areas'

/** 新專案預設狀態：含標準查驗範本，無棟別／缺失／歷程 */
export function createEmptyProjectState(name = '未命名專案'): ProjectState {
  const { categories, checklistItems } = buildDefaultChecklist()
  return {
    projectName: name,
    buildings: [],
    units: [],
    categories,
    checklistItems,
    defects: [],
    unitCheckedCount: {},
    unitCategoryDone: {},
    activities: [],
    currentUnitId: '',
    recentUnitIds: [],
    areas: [...DEFAULT_AREAS],
    areaTemplates: [],
  }
}

/** @deprecated 相容舊引用 */
export const seedState: ProjectState = createEmptyProjectState('未選擇專案')

/** 初始無任何專案資料包 */
export function createProjectBundles(): Record<string, ProjectState> {
  return {}
}
