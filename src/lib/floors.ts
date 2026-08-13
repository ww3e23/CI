export type FloorKind = 'B' | 'N' | 'RF' | 'R'

export interface ParsedFloor {
  raw: string
  kind: FloorKind
  n: number
}

export function parseFloor(label: string): ParsedFloor | null {
  const raw = label.trim().toUpperCase()
  if (!raw) return null
  if (raw === 'RF') return { raw, kind: 'RF', n: 0 }
  let m = raw.match(/^B(\d+)F$/)
  if (m) return { raw, kind: 'B', n: Number(m[1]) }
  m = raw.match(/^R(\d+)F$/)
  if (m) return { raw, kind: 'R', n: Number(m[1]) }
  m = raw.match(/^(\d+)F$/)
  if (m) return { raw, kind: 'N', n: Number(m[1]) }
  return null
}

/** 排序權重：B3 < B1 < 1F < 7F < RF < R1F < R2F */
export function floorRank(label: string): number {
  const f = parseFloor(label)
  if (!f) return 0
  if (f.kind === 'B') return -f.n * 10
  if (f.kind === 'N') return f.n * 10
  if (f.kind === 'RF') return 10_000
  return 10_000 + f.n * 10
}

export function sortFloorsAsc(floors: string[]): string[] {
  return [...floors].sort((a, b) => floorRank(a) - floorRank(b))
}

export function sortFloorsDesc(floors: string[]): string[] {
  return sortFloorsAsc(floors).reverse()
}

/**
 * 解析樓層範圍。
 * - `1F-7F` → 1F…7F
 * - `B3F-R2F` → B3F…B1F、1F…7F、R1F…R2F
 *   （未明確寫更高層時，標準層預設到 7F，避免誤含 8F–12F）
 * - `1F-12F` → 1F…12F
 * - `B1F-RF` → B1F、1F…7F、RF
 */
export function expandFloorRange(from: string, to: string): string[] {
  const a = parseFloor(from)
  const b = parseFloor(to)
  if (!a || !b) {
    return sortFloorsAsc([from, to].map((s) => s.trim().toUpperCase()).filter(Boolean))
  }

  const maxB = Math.max(a.kind === 'B' ? a.n : 0, b.kind === 'B' ? b.n : 0)
  const explicitN = Math.max(a.kind === 'N' ? a.n : 0, b.kind === 'N' ? b.n : 0)
  const touchesRoof = [a, b].some((f) => f.kind === 'RF' || f.kind === 'R')
  const touchesBasement = maxB > 0
  const maxR = Math.max(a.kind === 'R' ? a.n : 0, b.kind === 'R' ? b.n : 0)
  const wantsRF = a.kind === 'RF' || b.kind === 'RF'

  let maxN = explicitN
  if (maxN === 0 && (touchesRoof || touchesBasement)) maxN = 7
  if (maxN === 0) maxN = 1

  const sequence: string[] = []
  for (let i = maxB; i >= 1; i -= 1) sequence.push(`B${i}F`)
  for (let i = 1; i <= maxN; i += 1) sequence.push(`${i}F`)
  if (wantsRF) sequence.push('RF')
  for (let i = 1; i <= maxR; i += 1) sequence.push(`R${i}F`)

  return sliceRange(sequence, a.raw, b.raw)
}

function sliceRange(sequence: string[], from: string, to: string): string[] {
  const i = sequence.indexOf(from)
  const j = sequence.indexOf(to)
  if (i === -1 || j === -1) {
    return sortFloorsAsc([...new Set([...sequence, from, to])])
  }
  const [start, end] = i <= j ? [i, j] : [j, i]
  return sequence.slice(start, end + 1)
}

export function parseUnitCodes(input: string): string[] {
  return input
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function naKey(floor: string, unitCode: string): string {
  return `${floor}|${unitCode}`
}
