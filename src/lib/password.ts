/** App 端允許的最短密碼（依公司慣例） */
export const APP_MIN_PASSWORD_LENGTH = 4

/**
 * Firebase Email/密碼規定至少 6 碼。
 * App 密碼不足 6 碼時，用穩定後綴加長後再寫入／登入 Firebase（使用者仍只記 App 密碼）。
 */
export function toFirebasePassword(appPassword: string): string {
  const pwd = appPassword.trim()
  if (pwd.length >= 6) return pwd
  return `${pwd}#ci`
}

export function isValidAppPassword(password: string): boolean {
  return password.trim().length >= APP_MIN_PASSWORD_LENGTH
}
