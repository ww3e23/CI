/** 現場進度 App 專用本機 key（與查驗 CI App 隔離） */
export const PROGRESS_AUTH_STORAGE_KEY = 'site-progress-auth-v1'
export const PROGRESS_PROJECT_STORAGE_KEY = 'site-progress-data-v1'

/** 舊版與查驗共用的 key；進度 App 不再讀寫，避免互相覆蓋 */
export const LEGACY_AUTH_STORAGE_KEY = 'site-auth-v2'
export const LEGACY_PROJECT_STORAGE_KEY = 'site-inspection-v5'
