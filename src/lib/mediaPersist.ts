import type { Defect, ProjectState } from '../types'
import {
  CI_PROJECT_STORAGE_KEY,
  LEGACY_PROJECT_STORAGE_KEY,
} from './storageKeys'

/** 僅保留可持久化的圖檔網址（http／https），排除巨大的 data URL */
export function persistableMediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return undefined
}

export function lightenDefect(defect: Defect): Defect {
  return {
    ...defect,
    planPhotoDataUrl: persistableMediaUrl(defect.planPhotoDataUrl),
    photoDataUrls: (defect.photoDataUrls ?? [])
      .map((u) => persistableMediaUrl(u))
      .filter((u): u is string => Boolean(u)),
  }
}

export function lightenProjectState(state: ProjectState): ProjectState {
  return {
    ...state,
    defects: state.defects.map(lightenDefect),
  }
}

function purgeOneKey(key: string) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return
    if (raw.length < 2_500_000) return
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> }
    const state = parsed.state
    if (!state) return
    const bundles = (state.bundles ?? {}) as Record<string, ProjectState>
    const nextBundles: Record<string, ProjectState> = {}
    for (const [id, bundle] of Object.entries(bundles)) {
      nextBundles[id] = lightenProjectState(bundle)
    }
    const light = {
      ...parsed,
      state: {
        ...state,
        defects: Array.isArray(state.defects)
          ? (state.defects as Defect[]).map(lightenDefect)
          : [],
        bundles: nextBundles,
      },
    }
    localStorage.setItem(key, JSON.stringify(light))
  } catch {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  }
}

/** 嘗試清掉已爆掉的本機快取（查驗專用 + 舊共用 key） */
export function purgeBloatedInspectionStorage() {
  purgeOneKey(CI_PROJECT_STORAGE_KEY)
  purgeOneKey(LEGACY_PROJECT_STORAGE_KEY)
}
