/** Firebase Email/密碼需要 email 格式；帳號無 @ 時自動補此網域 */
export const ACCOUNT_EMAIL_DOMAIN = 'site.local'

/** 將「帳號」或 email 正規成系統登入識別（小寫） */
export function normalizeLoginId(input: string): string {
  const raw = input.trim().toLowerCase()
  if (!raw) return ''
  if (raw.includes('@')) return raw
  return `${raw}@${ACCOUNT_EMAIL_DOMAIN}`
}

/** 畫面顯示：若是系統自動補的網域，只顯示帳號本體 */
export function accountDisplay(loginId: string): string {
  const n = loginId.trim().toLowerCase()
  const suffix = `@${ACCOUNT_EMAIL_DOMAIN}`
  if (n.endsWith(suffix)) return n.slice(0, -suffix.length)
  return loginId.trim()
}

/** 帳號規則：純帳號 2–40 字（英數．_－），或填完整 email */
export function isValidAccountInput(input: string): boolean {
  const raw = input.trim()
  if (!raw) return false
  if (raw.includes('@')) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)
  }
  return /^[a-zA-Z0-9._-]{2,40}$/.test(raw)
}
