/** 產生專案代號：P-YYYY-001、P-YYYY-002… */
export function nextProjectCode(existingCodes: string[], now = new Date()): string {
  const year = now.getFullYear()
  const prefix = `P-${year}-`
  let max = 0
  for (const code of existingCodes) {
    if (!code.startsWith(prefix)) continue
    const n = Number(code.slice(prefix.length))
    if (Number.isFinite(n) && n > max) max = n
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}
