import type { Defect, ProjectState, Unit } from '../types'
import { resolveDefectItemLabel, resolveDefectRemark } from './defectDisplay'
import { escapeHtml } from './escapeHtml'
import { floorRank } from './floors'
import { statusLabel } from './progress'

export type PhotoReportInput = {
  projectName: string
  recorderName: string
  state: ProjectState
  /** 指定戶別；空則全案（僅有缺失的戶） */
  unitIds?: string[]
  mode?: 'embed' | 'window'
}

function compareUnits(a: Unit, b: Unit, buildingOrder: Map<string, number>): number {
  const bo =
    (buildingOrder.get(a.buildingId) ?? 999) - (buildingOrder.get(b.buildingId) ?? 999)
  if (bo !== 0) return bo
  const fo = floorRank(b.floor) - floorRank(a.floor)
  if (fo !== 0) return fo
  return a.code.localeCompare(b.code, 'zh-Hant', { numeric: true })
}

function unitDefects(state: ProjectState, unitId: string): Defect[] {
  return state.defects
    .filter((d) => d.unitId === unitId && d.status !== 'voided')
    .sort((a, b) => a.defectNumber - b.defectNumber)
}

function buildingLabel(name: string): string {
  const n = name.trim()
  if (!n) return '—'
  return /棟$/.test(n) ? n : `${n}棟`
}

function floorLabel(floor: string): string {
  if (!floor) return '—'
  if (floor.includes('樓') || /F$/i.test(floor)) return floor
  return `${floor}樓`
}

/** 產生純圖片查驗報表 HTML（無矩陣／統計） */
export function buildPhotoReportHtml(input: PhotoReportInput): string {
  const { projectName, recorderName, state, mode = 'window' } = input
  const buildings = [...state.buildings]
    .filter((b) => b.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const buildingOrder = new Map(buildings.map((b, i) => [b.id, i]))

  const idFilter =
    input.unitIds && input.unitIds.length > 0 ? new Set(input.unitIds) : null

  const units = [...state.units]
    .filter((u) => u.active && (!idFilter || idFilter.has(u.id)))
    .filter((u) => unitDefects(state, u.id).length > 0)
    .sort((a, b) => compareUnits(a, b, buildingOrder))

  const now = new Date()
  const dateLabel = now.toLocaleString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const totalDefects = units.reduce((sum, u) => sum + unitDefects(state, u.id).length, 0)

  const unitSections = units
    .map((unit, unitIdx) => {
      const defects = unitDefects(state, unit.id)
      const bName =
        buildings.find((b) => b.id === unit.buildingId)?.name ?? unit.buildingName
      const place = `${buildingLabel(bName)}　${floorLabel(unit.floor)}　${unit.code}戶`

      const cards = defects
        .map((d) => {
          const itemLabel = resolveDefectItemLabel(d, state.checklistItems) || d.description || '未命名缺失'
          const remark = resolveDefectRemark(d, state.checklistItems)
          const plan = d.planPhotoDataUrl
          const photos = (d.photoDataUrls ?? []).filter(Boolean)

          const planHtml = plan
            ? `<figure class="shot plan">
                <img src="${escapeHtml(plan)}" alt="位置圖 #${d.defectNumber}" />
                <figcaption>位置圖</figcaption>
              </figure>`
            : `<div class="shot empty">無位置圖</div>`

          const photoHtml =
            photos.length > 0
              ? photos
                  .map(
                    (src, i) => `
                <figure class="shot status">
                  <img src="${escapeHtml(src)}" alt="現況 #${d.defectNumber}-${i + 1}" />
                  <figcaption>現況 ${i + 1}</figcaption>
                </figure>`,
                  )
                  .join('')
              : `<div class="shot empty">無現況照</div>`

          return `
          <article class="defect">
            <header class="defect-head">
              <div class="num">#${d.defectNumber}</div>
              <div class="meta">
                <h3>${escapeHtml(d.area || '未指定區域')}｜${escapeHtml(itemLabel)}</h3>
                <p>${escapeHtml(d.categoryName || '')}${remark ? ` · ${escapeHtml(remark)}` : ''}</p>
              </div>
              <span class="status">${escapeHtml(statusLabel(d.status))}</span>
            </header>
            <div class="shots">
              ${planHtml}
              ${photoHtml}
            </div>
          </article>`
        })
        .join('')

      return `
      <section class="unit ${unitIdx === 0 ? 'first' : ''}">
        <header class="unit-head">
          <div class="unit-place">${escapeHtml(place)}</div>
          <div class="unit-count">缺失 <strong>${defects.length}</strong> 筆</div>
        </header>
        ${cards}
      </section>`
    })
    .join('')

  const toolbar =
    mode === 'window'
      ? `<div class="toolbar no-print">
          <button type="button" class="btn-ghost" onclick="window.print()">列印／存 PDF</button>
        </div>`
      : ''

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(projectName)}｜圖片查驗報告</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700;800&family=Noto+Serif+TC:wght@600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --ink: #1c241f;
      --soft: #5a635c;
      --line: rgba(28, 36, 31, 0.12);
      --green: #2f5d4c;
      --green-soft: rgba(47, 93, 76, 0.08);
      --paper: #f7f8f6;
      --card: #ffffff;
      --shadow: 0 18px 40px -28px rgba(28, 36, 31, 0.45);
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      color: var(--ink);
      font-family: 'Noto Sans TC', sans-serif;
      background:
        radial-gradient(80% 45% at 0% 0%, rgba(47,93,76,0.10), transparent 55%),
        radial-gradient(60% 40% at 100% 0%, rgba(60,110,143,0.08), transparent 50%),
        var(--paper);
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .toolbar {
      position: sticky; top: 0; z-index: 5;
      display: flex; justify-content: flex-end; gap: 8px;
      padding: 12px 18px;
      background: rgba(247,248,246,0.92);
      backdrop-filter: blur(10px);
      border-bottom: 1px solid var(--line);
    }
    .toolbar button {
      border: 0; border-radius: 999px; padding: 10px 16px;
      font: inherit; font-weight: 700; cursor: pointer;
    }
    .btn-ghost { background: #fff; color: var(--ink); border: 1px solid var(--line) !important; }
    .page { max-width: 920px; margin: 0 auto; padding: 20px 16px 56px; }

    .cover {
      padding: 28px 22px 22px;
      margin-bottom: 22px;
      border-radius: 22px;
      background:
        linear-gradient(145deg, rgba(47,93,76,0.12), transparent 42%),
        var(--card);
      border: 1px solid var(--line);
      box-shadow: var(--shadow);
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .cover .eyebrow {
      font-size: 11px; letter-spacing: 0.14em; font-weight: 800;
      color: var(--green); text-transform: uppercase; margin: 0 0 8px;
    }
    .cover h1 {
      margin: 0;
      font-family: 'Noto Serif TC', serif;
      font-size: clamp(26px, 4vw, 34px);
      line-height: 1.25;
      font-weight: 700;
    }
    .cover .sub {
      margin: 10px 0 0;
      color: var(--soft);
      font-size: 14px;
      font-weight: 600;
      line-height: 1.55;
    }
    .cover .chips {
      display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px;
    }
    .cover .chip {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 7px 12px; border-radius: 999px;
      background: var(--green-soft); color: var(--green);
      font-size: 12px; font-weight: 800;
    }

    .unit {
      margin: 0 0 28px;
    }
    .unit:not(.first) {
      break-before: page;
      page-break-before: always;
    }
    .unit-head {
      display: flex; align-items: baseline; justify-content: space-between;
      gap: 12px; padding: 14px 4px 12px;
      border-bottom: 2px solid var(--green);
      margin-bottom: 14px;
      break-after: avoid;
      page-break-after: avoid;
    }
    .unit-place {
      font-family: 'Noto Serif TC', serif;
      font-size: 22px; font-weight: 700; line-height: 1.3;
    }
    .unit-count {
      flex-shrink: 0; color: var(--soft); font-size: 13px; font-weight: 700;
    }
    .unit-count strong { color: var(--green); font-size: 18px; }

    .defect {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 16px;
      margin: 0 0 16px;
      box-shadow: var(--shadow);
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .defect-head {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 12px;
      align-items: start;
      margin-bottom: 12px;
      break-after: avoid;
      page-break-after: avoid;
    }
    .num {
      width: 46px; height: 46px; border-radius: 14px;
      background: var(--green); color: #fff;
      display: grid; place-items: center;
      font-weight: 800; font-size: 14px;
    }
    .meta h3 {
      margin: 0; font-size: 16px; line-height: 1.35; font-weight: 800;
    }
    .meta p {
      margin: 4px 0 0; color: var(--soft); font-size: 12px; font-weight: 600;
      line-height: 1.45;
    }
    .status {
      align-self: start;
      padding: 6px 10px; border-radius: 999px;
      background: var(--green-soft); color: var(--green);
      font-size: 11px; font-weight: 800; white-space: nowrap;
    }

    .shots {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .shot {
      margin: 0;
      border-radius: 14px;
      overflow: hidden;
      background: #121814;
      border: 1px solid var(--line);
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .shot img {
      display: block;
      width: 100%;
      height: auto;
      max-height: 340px;
      object-fit: contain;
      background: #121814;
    }
    .shot figcaption {
      padding: 7px 10px;
      background: #fff;
      color: var(--soft);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.04em;
      border-top: 1px solid var(--line);
    }
    .shot.empty {
      min-height: 140px;
      display: grid; place-items: center;
      color: rgba(255,255,255,0.55);
      font-size: 13px; font-weight: 700;
      background: #2a312c;
    }
    .shot.plan { grid-column: 1 / -1; }
    .shot.plan img { max-height: 420px; }

    .empty-all {
      padding: 40px 20px; text-align: center;
      color: var(--soft); font-weight: 700;
      background: var(--card); border-radius: 18px; border: 1px dashed var(--line);
    }
    .footer {
      margin-top: 28px; padding-top: 12px;
      border-top: 1px solid var(--line);
      color: var(--soft); font-size: 11px; font-weight: 600;
      text-align: center;
    }

    @media (max-width: 720px) {
      .shots { grid-template-columns: 1fr; }
      .shot.plan { grid-column: auto; }
      .defect-head { grid-template-columns: auto 1fr; }
      .status { grid-column: 2; justify-self: start; }
    }

    @media print {
      body { background: #fff; }
      .no-print { display: none !important; }
      .page { max-width: none; padding: 0; }
      .cover {
        box-shadow: none;
        border: 0;
        border-bottom: 2px solid var(--green);
        border-radius: 0;
        margin-bottom: 18px;
        padding: 0 0 14px;
        background: none;
      }
      .unit:not(.first) {
        break-before: page;
        page-break-before: always;
      }
      .defect {
        box-shadow: none;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .shot, .shot img {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .shot img { max-height: 260px; }
      .shot.plan img { max-height: 320px; }
    }
  </style>
</head>
<body>
  ${toolbar}
  <div class="page">
    <header class="cover">
      <div class="eyebrow">Photo Inspection Report</div>
      <h1>${escapeHtml(projectName || '查驗專案')}</h1>
      <p class="sub">純圖片查驗報告 · 僅列位置圖與現況照片</p>
      <div class="chips">
        <span class="chip">紀錄：${escapeHtml(recorderName || '現場查驗')}</span>
        <span class="chip">產出：${escapeHtml(dateLabel)}</span>
        <span class="chip">${units.length} 戶 · ${totalDefects} 筆缺失</span>
      </div>
    </header>

    ${
      unitSections ||
      '<div class="empty-all">目前沒有可列入的缺失圖片（請確認已選戶別且有紀錄）</div>'
    }

    <div class="footer">${escapeHtml(projectName)} · 圖片查驗報告 · ${escapeHtml(recorderName || '現場查驗')}</div>
  </div>
</body>
</html>`
}

export function downloadPhotoReport(input: PhotoReportInput, filename?: string) {
  const html = buildPhotoReportHtml({ ...input, mode: 'window' })
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = filename || `${input.projectName || '查驗專案'}_圖片報告_${stamp}.html`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
