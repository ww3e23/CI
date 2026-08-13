/** 全螢幕報告預覽開啟時鎖定底欄，避免手機「點穿」切走頁面把預覽卸掉 */

let locked = false
const listeners = new Set<() => void>()

export function setReportPreviewLock(next: boolean) {
  if (locked === next) return
  locked = next
  for (const fn of listeners) fn()
}

export function isReportPreviewLocked() {
  return locked
}

export function subscribeReportPreviewLock(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
