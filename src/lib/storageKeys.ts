/** 查驗 App 專用本機 key（與 Progress／現場進度 App 隔離） */
export const CI_AUTH_STORAGE_KEY = 'ci-inspection-auth-v1'
export const CI_PROJECT_STORAGE_KEY = 'ci-inspection-data-v1'

/** 舊版共用 key（Progress 仍可能寫入；查驗不再使用） */
export const LEGACY_AUTH_STORAGE_KEY = 'site-auth-v2'
export const LEGACY_PROJECT_STORAGE_KEY = 'site-inspection-v5'

const MIGRATED_FLAG = 'ci-inspection-storage-migrated-v1'

/**
 * 啟動時把舊共用 localStorage 複製到查驗專用 key（只做一次）。
 * 之後查驗只讀寫新 key，Progress 再改舊 key 也不會覆蓋查驗。
 */
export function migrateCiLocalStorageOnce(): void {
  if (typeof localStorage === 'undefined') return
  try {
    if (localStorage.getItem(MIGRATED_FLAG) === '1') return

    const copyIfNeeded = (from: string, to: string) => {
      const existing = localStorage.getItem(to)
      if (existing) return
      const legacy = localStorage.getItem(from)
      if (!legacy) return
      localStorage.setItem(to, legacy)
    }

    copyIfNeeded(LEGACY_AUTH_STORAGE_KEY, CI_AUTH_STORAGE_KEY)
    copyIfNeeded(LEGACY_PROJECT_STORAGE_KEY, CI_PROJECT_STORAGE_KEY)
    localStorage.setItem(MIGRATED_FLAG, '1')
  } catch (err) {
    console.warn('[migrateCiLocalStorageOnce] failed', err)
  }
}

// 模組載入即遷移，確保早於 zustand persist 讀取
migrateCiLocalStorageOnce()
