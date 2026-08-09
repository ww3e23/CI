const SPECIAL_ORDER: Record<string, number> = {
  B3F: -30,
  B2F: -20,
  B1F: -10,
  '1F': 10,
  '2F': 20,
  '3F': 30,
  '4F': 40,
  '5F': 50,
  '6F': 60,
  '7F': 70,
  '8F': 80,
  '9F': 90,
  '10F': 100,
  '11F': 110,
  '12F': 120,
  RF: 200,
  R1F: 210,
  R2F: 220,
}

/** 由低到高排序樓層（B3 → R2） */
export function sortFloorsAsc(floors: string[]): string[] {
  return [...floors].sort((a, b) => floorRank(a) - floorRank(b))
}

/** 由高到低（矩陣列：頂為 R2） */
export function sortFloorsDesc(floors: string[]): string[] {
  return sortFloorsAsc(floors).reverse()
}

export function floorRank(label: string): number {
  const key = label.trim().toUpperCase()
  if (key in SPECIAL_ORDER) return SPECIAL_ORDER[key]
  const m = key.match(/^(\d+)F$/)
  if (m) return Number(m[1]) * 10
  return 0
}

/**
 * 解析簡易樓層範圍，支援：
 * - 1F-7F
 * - B3F-7F
 * - 1F-RF
 * - B2F-R1F
 */
export function expandFloorRange(from: string, to: string): string[] {
  const sequence = [
    'B3F',
    'B2F',
    'B1F',
    '1F',
    '2F',
    '3F',
    '4F',
    '5F',
    '6F',
    '7F',
    '8F',
    '9F',
    '10F',
    '11F',
    '12F',
    'RF',
    'R1F',
    'R2F',
  ]
  const a = from.trim().toUpperCase()
  const b = to.trim().toUpperCase()
  const i = sequence.indexOf(a)
  const j = sequence.indexOf(b)
  if (i === -1 || j === -1) {
    return sortFloorsAsc([a, b].filter(Boolean))
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
