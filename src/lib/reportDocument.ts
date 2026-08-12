import type { Defect, ProjectState } from '../types'
import { buildMatrix, defectsByStatus, statusLabel } from './progress'
import { escapeHtml } from './escapeHtml'

type ReportInput = {
  projectName: string
  projectCode?: string
  location?: string
  state: ProjectState
  /** embed：給 App 內 iframe；window：獨立預覽頁 */
  mode?: 'embed' | 'window'
}

function statusTone(status: Defect['status']): string {
  switch (status) {
    case 'pending_repair':
      return '#c97b2e'
    case 'pending_reinspection':
      return '#3c6e8f'
    case 'returned':
      return '#ae4c3b'
    case 'completed':
      return '#2f5d4c'
    default:
      return '#8a8578'
  }
}

function cellColor(status: string): string {
  switch (status) {
    case 'completed':
      return '#2f5d4c'
    case 'has_defects':
      return '#ae4c3b'
    case 'in_progress':
      return '#c97b2e'
    case 'not_started':
      return '#f7f3ea'
    default:
      return '#d9d5cb'
  }
}

export function buildInspectionReportHtml(input: ReportInput): string {
  const { state, projectName, projectCode, location, mode = 'window' } = input
  const matrix = buildMatrix(state)
  const counts = defectsByStatus(state.defects)
  const openDefects = state.defects
    .filter((d) => d.status !== 'voided')
    .sort((a, b) => b.defectNumber - a.defectNumber)

  const now = new Date()
  const dateLabel = now.toLocaleString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const overviewPct =
    matrix.startedUnitCount > 0
      ? matrix.startedOverallPercent
      : matrix.overallPercent
  const overviewLabel =
    matrix.startedUnitCount > 0
      ? `已開工 ${matrix.startedUnitCount} 戶平均 · 全案 ${matrix.overallPercent}%`
      : '整體進度'

  // 各棟進度固定用「全棟有效戶平均」（含未開始），勿用已開工戶平均，
  // 否則只查一戶時會把該戶單戶%當成整棟進度。
  const buildingBars = matrix.buildingPercents
    .map((b) => {
      const pct = b.percent
      return `
      <div class="bar-row">
        <div class="bar-label">${escapeHtml(b.name)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        <div class="bar-num">${pct}%</div>
      </div>`
    })
    .join('')

  const matrixRows = matrix.floors
    .map((floor) => {
      const cells = matrix.buildings
        .flatMap((b) =>
          b.unitCodes.map((code) => {
            const cell = matrix.cells.find(
              (c) => c.buildingId === b.id && c.floor === floor && c.unitCode === code,
            )
            const status = cell?.status ?? 'na'
            const title = `${b.name} ${floor} ${code}`
            return `<td title="${escapeHtml(title)}"><span class="dot" style="background:${cellColor(status)}"></span></td>`
          }),
        )
        .join('')
      return `<tr><th>${escapeHtml(floor)}</th>${cells}</tr>`
    })
    .join('')

  const unitHeader = matrix.buildings
    .map(
      (b) =>
        `<th colspan="${b.unitCodes.length}">${escapeHtml(b.name)}</th>`,
    )
    .join('')

  const unitCodes = matrix.buildings
    .flatMap((b) => b.unitCodes.map((c) => `<th class="unit">${escapeHtml(c)}</th>`))
    .join('')

  const defectCards = openDefects
    .map((d) => {
      const photos = [d.planPhotoDataUrl, ...(d.photoDataUrls ?? [])].filter(Boolean) as string[]
      const imgs = photos
        .slice(0, 4)
        .map(
          (src, i) =>
            `<figure><img src="${src}" alt="photo ${i + 1}" /><figcaption>${i === 0 && d.planPhotoDataUrl === src ? '圖面' : '現況'}</figcaption></figure>`,
        )
        .join('')
      return `
      <article class="defect">
        <header>
          <div class="defect-no">#${d.defectNumber}</div>
          <div>
            <h3>${escapeHtml(d.area)}｜${escapeHtml(d.description)}</h3>
            <p>${escapeHtml(d.buildingName)} · ${escapeHtml(d.floor)} · ${escapeHtml(d.unitCode)}戶 · ${escapeHtml(d.categoryName)}</p>
          </div>
          <span class="badge" style="background:${statusTone(d.status)}">${escapeHtml(statusLabel(d.status))}</span>
        </header>
        ${imgs ? `<div class="photos">${imgs}</div>` : '<div class="no-photo">無附圖</div>'}
      </article>`
    })
    .join('')

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(projectName)}｜查驗報告</title>
  <style>
    :root {
      --ink: #22291f;
      --soft: #5b6259;
      --green: #2f5d4c;
      --paper: #f4efe4;
      --card: #fffcf6;
      --line: rgba(34,41,31,0.1);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      font-family:
        'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', 'Heiti TC',
        'Source Han Sans TC', sans-serif;
      background:
        radial-gradient(90% 50% at 10% 0%, rgba(47,93,76,0.14), transparent 55%),
        radial-gradient(70% 40% at 100% 10%, rgba(201,123,46,0.12), transparent 50%),
        var(--paper);
    }
    .toolbar {
      position: sticky; top: 0; z-index: 5;
      display: flex; gap: 10px; justify-content: flex-end; align-items: center;
      padding: 12px 20px;
      background: rgba(244,239,228,0.92);
      backdrop-filter: blur(10px);
      border-bottom: 1px solid var(--line);
    }
    .toolbar button {
      border: 0; border-radius: 999px; padding: 10px 18px;
      font: inherit; font-weight: 700; cursor: pointer;
    }
    .btn-primary { background: var(--green); color: #fff; }
    .btn-ghost { background: rgba(255,255,255,0.7); color: var(--ink); }
    .page { max-width: 980px; margin: 0 auto; padding: 18px 16px 48px; }
    .report-head {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
      padding: 0 0 14px; margin: 0 0 16px;
      border-bottom: 2px solid var(--green);
      background: none; color: var(--ink);
      min-height: 0 !important;
      page-break-after: avoid;
      break-after: avoid-page;
    }
    .report-head h1 {
      font-family:
        'Noto Serif TC', 'Songti TC', 'PMingLiU', 'Source Han Serif TC', serif;
      font-size: 20px; margin: 0 0 4px; line-height: 1.25;
      color: var(--ink);
    }
    .report-head .meta { margin: 0; font-size: 12px; line-height: 1.45; color: var(--soft); }
    .report-head .pct {
      flex-shrink: 0; min-width: 56px; padding: 8px 10px; border-radius: 12px;
      border: 1.5px solid var(--green); color: var(--green);
      background: rgba(47,93,76,0.06); display: grid; place-items: center;
      font-size: 18px; font-weight: 800; line-height: 1.1;
    }
    .section { margin: 18px 0; page-break-inside: avoid; }
    .section h2 {
      font-family:
        'Noto Serif TC', 'Songti TC', 'PMingLiU', 'Source Han Serif TC', serif;
      font-size: 20px; margin: 0 0 6px;
    }
    .section .lead { color: var(--soft); margin: 0 0 12px; font-size: 13px; }
    .stats {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
    }
    .stat {
      background: var(--card); border: 1px solid var(--line); border-radius: 18px;
      padding: 16px; box-shadow: 0 12px 28px -22px rgba(34,41,31,0.35);
    }
    .stat .n { font-size: 28px; font-weight: 800; color: var(--green); }
    .stat .l { font-size: 12px; color: var(--soft); font-weight: 700; margin-top: 4px; }
    .panel {
      background: var(--card); border: 1px solid var(--line); border-radius: 22px;
      padding: 18px; box-shadow: 0 16px 36px -24px rgba(34,41,31,0.35);
    }
    .bar-row { display: grid; grid-template-columns: 72px 1fr 48px; gap: 10px; align-items: center; margin: 8px 0; }
    .bar-label { font-weight: 700; font-size: 13px; }
    .bar-track { height: 10px; border-radius: 999px; background: rgba(34,41,31,0.08); overflow: hidden; }
    .bar-fill { height: 100%; background: linear-gradient(90deg, #3a6f5c, #2f5d4c); border-radius: 999px; }
    .bar-num { font-weight: 800; font-size: 13px; text-align: right; }
    table.matrix { width: 100%; border-collapse: collapse; font-size: 11px; }
    table.matrix th, table.matrix td { padding: 4px; text-align: center; }
    table.matrix th { color: var(--soft); font-weight: 700; }
    table.matrix th.unit { font-size: 10px; }
    .dot { display: inline-block; width: 14px; height: 12px; border-radius: 4px; border: 1px solid rgba(34,41,31,0.08); }
    .legend { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
    .legend span { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--soft); font-weight: 700; }
    .defect {
      break-inside: avoid; margin-bottom: 14px; padding: 16px;
      border-radius: 18px; background: var(--card); border: 1px solid var(--line);
    }
    .defect header { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: start; }
    .defect-no {
      width: 44px; height: 44px; border-radius: 12px; background: var(--green); color: #fff;
      display: grid; place-items: center; font-weight: 800;
    }
    .defect h3 { margin: 0; font-size: 16px; }
    .defect p { margin: 4px 0 0; color: var(--soft); font-size: 12px; }
    .badge { color: #fff; border-radius: 999px; padding: 6px 10px; font-size: 12px; font-weight: 700; }
    .photos { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 12px; }
    .photos figure { margin: 0; }
    .photos img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 12px; background: #eee; }
    .photos figcaption { font-size: 11px; color: var(--soft); margin-top: 4px; font-weight: 700; }
    .no-photo { margin-top: 10px; color: var(--soft); font-size: 12px; }
    .footer { margin-top: 36px; color: var(--soft); font-size: 12px; text-align: center; }
    @media (max-width: 720px) {
      .stats { grid-template-columns: repeat(2, 1fr); }
      .photos { grid-template-columns: repeat(2, 1fr); }
    }
    @media print {
      .toolbar { display: none !important; }
      body { background: #fff !important; }
      .page { max-width: none; padding: 12mm; }
      .report-head, .section, .stats, .panel, .defect {
        page-break-after: avoid;
        break-after: avoid-page;
        box-shadow: none !important;
      }
      .report-head {
        min-height: 0 !important;
        margin-bottom: 10px;
        padding-bottom: 8px;
      }
      .cover, .ring { display: none !important; }
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  </style>
</head>
<body>
  ${
    mode === 'window'
      ? `<div class="toolbar">
    <button class="btn-ghost" onclick="window.close()">關閉</button>
    <button class="btn-primary" onclick="window.print()">列印／匯出 PDF</button>
  </div>`
      : ''
  }
  <div class="page">
    <header class="report-head">
      <div>
        <h1>${escapeHtml(projectName)}｜查驗報告</h1>
        <p class="meta">
          ${projectCode ? escapeHtml(projectCode) + ' · ' : ''}${location ? escapeHtml(location) + ' · ' : ''}
          ${escapeHtml(dateLabel)}
          <br/>可查驗 ${matrix.activeUnitCount} 戶 · ${matrix.floors.length} 層 · 缺失 ${counts.all} 筆
        </p>
      </div>
      <div class="pct">${overviewPct}%</div>
    </header>

    <section class="section">
      <h2>執行總覽</h2>
      <p class="lead">查驗進度與缺失狀態摘要。</p>
      <div class="stats">
        <div class="stat"><div class="n">${overviewPct}%</div><div class="l">${escapeHtml(overviewLabel)}</div></div>
        <div class="stat"><div class="n">${counts.pending_repair}</div><div class="l">待改善</div></div>
        <div class="stat"><div class="n">${counts.pending_reinspection}</div><div class="l">待複驗</div></div>
        <div class="stat"><div class="n">${counts.completed}</div><div class="l">已改善缺失</div></div>
      </div>
    </section>

    <section class="section">
      <h2>各棟進度</h2>
      <p class="lead">依棟別彙整全棟有效戶平均完成率（含未開始戶）。</p>
      <div class="panel">${buildingBars || '<div class="no-photo">尚無棟別資料</div>'}</div>
    </section>

    <section class="section">
      <h2>進度矩陣</h2>
      <p class="lead">綠＝完成、紅＝有缺失、琥珀＝進行中、米白＝未開始、灰＝不適用。</p>
      <div class="legend">
        <span><i class="dot" style="background:#2f5d4c"></i>已完成</span>
        <span><i class="dot" style="background:#ae4c3b"></i>有缺失</span>
        <span><i class="dot" style="background:#c97b2e"></i>進行中</span>
        <span><i class="dot" style="background:#f7f3ea"></i>未開始</span>
        <span><i class="dot" style="background:#d9d5cb"></i>不適用</span>
      </div>
      <div class="panel" style="overflow:auto">
        <table class="matrix">
          <thead>
            <tr><th></th>${unitHeader}</tr>
            <tr><th>樓層</th>${unitCodes}</tr>
          </thead>
          <tbody>${matrixRows}</tbody>
        </table>
      </div>
    </section>

    <section class="section">
      <h2>缺失清冊</h2>
      <p class="lead">含圖面位置與現況照片，可於瀏覽器列印為 PDF 歸檔。</p>
      ${defectCards || '<div class="panel no-photo">目前沒有缺失紀錄</div>'}
    </section>

    <div class="footer">現場驗屋查驗系統 · ${escapeHtml(projectName)} · 本報告由系統自動產生 · v2</div>
  </div>
</body>
</html>`
}

export function openInspectionReport(input: ReportInput): Window | null {
  const html = buildInspectionReportHtml({ ...input, mode: 'window' })
  const win = window.open('', '_blank', 'noopener,noreferrer')
  if (!win) return null
  win.document.open()
  win.document.write(html)
  win.document.close()
  return win
}

/** 下載完整 HTML 報告（手機也可存檔） */
export function downloadInspectionReport(input: ReportInput, filename?: string) {
  const html = buildInspectionReportHtml({ ...input, mode: 'window' })
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = filename || `${input.projectName}-查驗報告-${stamp}.html`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
