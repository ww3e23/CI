import type { Defect, ProjectState, Unit } from '../types'
import { resolveDefectItemLabel, resolveDefectRemark, defectInspectorLabel } from './defectDisplay'
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

/** 可嵌入報告的圖片網址（排除上傳中占位字串） */
function isUsableMediaUrl(url?: string | null): url is string {
  const v = String(url || '').trim()
  if (!v) return false
  if (v === '[local-pending-upload]') return false
  return v.startsWith('http://') || v.startsWith('https://') || v.startsWith('data:')
}

/**
 * 缺失位置圖：優先用該筆已標註／上傳的圖；
 * 若無則回退該戶預設位置圖（現場常只設戶別預設圖）。
 */
function resolveDefectPlanPhoto(defect: Defect, unit?: Unit | null): string | undefined {
  if (isUsableMediaUrl(defect.planPhotoDataUrl)) return defect.planPhotoDataUrl.trim()
  if (unit && isUsableMediaUrl(unit.defaultPlanPhotoUrl)) {
    return unit.defaultPlanPhotoUrl.trim()
  }
  return undefined
}

function resolveStatusPhotos(defect: Defect): string[] {
  return (defect.photoDataUrls ?? []).filter((src) => isUsableMediaUrl(src))
}

function imgTag(src: string, alt: string): string {
  // eager：列印／PDF 前必須把圖抓完，不可 lazy（離屏圖印出來會空白）
  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="eager" decoding="async" referrerpolicy="no-referrer" />`
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
          const itemLabel =
            resolveDefectItemLabel(d, state.checklistItems) || d.description || '未命名缺失'
          const remark = resolveDefectRemark(d, state.checklistItems)
          const inspector = defectInspectorLabel(d)
          const plan = resolveDefectPlanPhoto(d, unit)
          const photos = resolveStatusPhotos(d)
          const usedUnitDefault =
            Boolean(plan) &&
            !isUsableMediaUrl(d.planPhotoDataUrl) &&
            isUsableMediaUrl(unit.defaultPlanPhotoUrl)

          // 標題列只標一次「位置圖／現況照」，圖下不再重複 figcaption
          const planHtml = plan
            ? `<figure class="shot plan">
                ${imgTag(plan, `位置圖 #${d.defectNumber}`)}
                ${
                  usedUnitDefault
                    ? '<figcaption class="hint">採用此戶預設位置圖</figcaption>'
                    : ''
                }
              </figure>`
            : `<div class="shot empty">尚未提供位置圖</div>`

          const photoHtml =
            photos.length > 0
              ? photos
                  .map(
                    (src, i) => `
                <figure class="shot status">
                  ${imgTag(src, `現況 #${d.defectNumber}-${i + 1}`)}
                  ${
                    photos.length > 1
                      ? `<figcaption class="hint">現況 ${i + 1}/${photos.length}</figcaption>`
                      : ''
                  }
                </figure>`,
                  )
                  .join('')
              : `<div class="shot empty">尚未提供現況照</div>`

          return `
          <article class="defect">
            <header class="defect-head">
              <div class="num">${d.defectNumber}</div>
              <div class="meta">
                <h3>${escapeHtml(d.area || '未指定區域')}｜${escapeHtml(itemLabel)}</h3>
                <p>${escapeHtml(d.categoryName || '')}${remark ? ` · ${escapeHtml(remark)}` : ''}${
                  inspector ? ` · 查驗 ${escapeHtml(inspector)}` : ''
                }</p>
              </div>
              <span class="badge">${escapeHtml(statusLabel(d.status))}</span>
            </header>
            <div class="shots">
              <div class="shot-col">
                <div class="shot-label">位置圖</div>
                ${planHtml}
              </div>
              <div class="shot-col">
                <div class="shot-label">現況照</div>
                <div class="status-stack">${photoHtml}</div>
              </div>
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
          <button type="button" class="btn-ghost" id="btn-print">列印／存 PDF</button>
          <span id="print-hint" style="align-self:center;font-size:12px;font-weight:600;color:#5e6861"></span>
        </div>
        <script>
          (function () {
            function waitImages(onProgress) {
              var imgs = Array.prototype.slice.call(document.images || []);
              var total = imgs.length, done = 0, failed = 0;
              if (!total) { if (onProgress) onProgress(0, 0); return Promise.resolve({ failed: 0 }); }
              if (onProgress) onProgress(0, total);
              return Promise.all(imgs.map(function (img) {
                img.loading = 'eager';
                return new Promise(function (resolve) {
                  function finish(ok) {
                    done += 1;
                    if (!ok) failed += 1;
                    if (onProgress) onProgress(done, total);
                    resolve();
                  }
                  if (img.complete && img.naturalWidth > 0) { finish(true); return; }
                  if (img.complete) { finish(false); return; }
                  img.addEventListener('load', function () { finish(true); }, { once: true });
                  img.addEventListener('error', function () { finish(false); }, { once: true });
                });
              })).then(function () { return { failed: failed }; });
            }
            var btn = document.getElementById('btn-print');
            var hint = document.getElementById('print-hint');
            if (!btn) return;
            btn.addEventListener('click', function () {
              btn.disabled = true;
              if (hint) hint.textContent = '圖片載入中…';
              waitImages(function (done, total) {
                if (hint) hint.textContent = total ? ('圖片 ' + done + '/' + total) : '準備列印…';
              }).then(function () {
                if (hint) hint.textContent = '';
                btn.disabled = false;
                window.print();
              });
            });
            // 預先暖圖
            waitImages(function (done, total) {
              if (hint && total && done < total) hint.textContent = '圖片載入中 ' + done + '/' + total;
              if (hint && total && done >= total) hint.textContent = '圖片已就緒，可列印';
            });
          })();
        </script>`
      : ''

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(projectName)}｜圖片查驗報告</title>
  <style>
    :root {
      --ink: #1a211c;
      --soft: #5e6861;
      --mute: #8a928b;
      --line: rgba(26, 33, 28, 0.10);
      --line-strong: rgba(47, 93, 76, 0.35);
      --green: #2f5d4c;
      --green-soft: rgba(47, 93, 76, 0.08);
      --paper: #f4f2ec;
      --card: #fffcf7;
      --photo-mat: #efece4;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      color: var(--ink);
      font-family:
        'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', 'Heiti TC',
        'Source Han Sans TC', sans-serif;
      background:
        linear-gradient(180deg, rgba(255,255,255,0.55), transparent 180px),
        radial-gradient(70% 40% at 0% 0%, rgba(47,93,76,0.07), transparent 55%),
        var(--paper);
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .toolbar {
      position: sticky; top: 0; z-index: 5;
      display: flex; justify-content: flex-end; gap: 8px;
      padding: 12px 18px;
      background: rgba(244,242,236,0.92);
      backdrop-filter: blur(10px);
      border-bottom: 1px solid var(--line);
    }
    .toolbar button {
      border: 0; border-radius: 10px; padding: 10px 16px;
      font: inherit; font-weight: 700; cursor: pointer;
    }
    .btn-ghost {
      background: var(--card);
      color: var(--ink);
      border: 1px solid var(--line) !important;
    }
    .page { max-width: 920px; margin: 0 auto; padding: 22px 16px 56px; }

    .cover {
      padding: 8px 2px 20px;
      margin-bottom: 8px;
      border-bottom: 1px solid var(--line-strong);
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .cover .eyebrow {
      font-size: 11px; letter-spacing: 0.16em; font-weight: 700;
      color: var(--green); text-transform: uppercase; margin: 0 0 10px;
    }
    .cover h1 {
      margin: 0;
      font-family:
        'Noto Serif TC', 'Songti TC', 'PMingLiU', 'Source Han Serif TC', serif;
      font-size: clamp(26px, 4vw, 34px);
      line-height: 1.25;
      font-weight: 700;
      letter-spacing: 0.01em;
    }
    .cover .sub {
      margin: 10px 0 0;
      color: var(--soft);
      font-size: 14px;
      font-weight: 500;
      line-height: 1.55;
    }
    .cover .meta-row {
      display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 14px;
      color: var(--soft); font-size: 12px; font-weight: 600;
    }
    .cover .meta-row span + span::before {
      content: '·';
      margin-right: 14px;
      color: var(--mute);
    }

    .unit { margin: 0 0 22px; }
    .unit:not(.first) {
      break-before: page;
      page-break-before: always;
      padding-top: 4px;
    }
    .unit-head {
      display: flex; align-items: baseline; justify-content: space-between;
      gap: 12px; padding: 16px 2px 10px;
      border-bottom: 1px solid var(--ink);
      margin-bottom: 14px;
      break-after: avoid;
      page-break-after: avoid;
    }
    .unit-place {
      font-family:
        'Noto Serif TC', 'Songti TC', 'PMingLiU', 'Source Han Serif TC', serif;
      font-size: 22px; font-weight: 700; line-height: 1.3;
    }
    .unit-count {
      flex-shrink: 0; color: var(--soft); font-size: 13px; font-weight: 600;
    }
    .unit-count strong { color: var(--green); font-size: 16px; }

    .defect {
      background: transparent;
      border: 0;
      border-bottom: 1px solid var(--line);
      border-radius: 0;
      padding: 0 2px 18px;
      margin: 0 0 18px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .defect:last-child { border-bottom: 0; margin-bottom: 0; }
    .defect-head {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 10px 12px;
      align-items: start;
      margin-bottom: 12px;
      break-after: avoid;
      page-break-after: avoid;
    }
    .num {
      width: 34px; height: 34px; border-radius: 999px;
      background: var(--green); color: #fff;
      display: grid; place-items: center;
      font-weight: 700; font-size: 13px;
      font-variant-numeric: tabular-nums;
    }
    .meta h3 {
      margin: 0; font-size: 15px; line-height: 1.4; font-weight: 700;
    }
    .meta p {
      margin: 4px 0 0; color: var(--soft); font-size: 12px; font-weight: 500;
      line-height: 1.5;
    }
    .badge {
      align-self: start;
      padding: 4px 9px;
      border-radius: 6px;
      border: 1px solid rgba(47, 93, 76, 0.22);
      background: var(--green-soft);
      color: var(--green);
      font-size: 11px; font-weight: 700; white-space: nowrap;
    }

    .shots {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
      gap: 14px;
      align-items: start;
    }
    .shot-col { min-width: 0; }
    .shot-label {
      margin: 0 0 8px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: var(--mute);
      text-transform: none;
    }
    .status-stack {
      display: grid;
      gap: 10px;
    }
    .shot {
      margin: 0;
      border-radius: 6px;
      overflow: hidden;
      background: var(--photo-mat);
      border: 1px solid var(--line);
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .shot img {
      display: block;
      width: 100%;
      height: auto;
      max-height: 380px;
      object-fit: contain;
      object-position: center;
      background: var(--photo-mat);
      vertical-align: top;
    }
    .shot figcaption.hint {
      padding: 6px 8px;
      background: transparent;
      color: var(--mute);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.02em;
      border-top: 1px solid var(--line);
      text-align: center;
    }
    .shot.empty {
      min-height: 120px;
      display: grid; place-items: center;
      color: var(--mute);
      font-size: 12px; font-weight: 600;
      background: rgba(239, 236, 228, 0.65);
      border-style: dashed;
    }

    .empty-all {
      padding: 40px 20px; text-align: center;
      color: var(--soft); font-weight: 600;
      background: var(--card); border-radius: 10px; border: 1px dashed var(--line);
    }
    .footer {
      margin-top: 28px; padding-top: 12px;
      border-top: 1px solid var(--line);
      color: var(--mute); font-size: 11px; font-weight: 500;
      text-align: center;
    }

    @media (max-width: 720px) {
      .shots { grid-template-columns: 1fr; }
      .defect-head { grid-template-columns: auto 1fr; }
      .badge { grid-column: 2; justify-self: start; }
    }

    @media print {
      @page { margin: 12mm 11mm; }
      body { background: #fff; color: #111; }
      .no-print { display: none !important; }
      .page { max-width: none; padding: 0; }
      .cover {
        border-bottom: 1.5px solid var(--green);
        margin-bottom: 10px;
        padding: 0 0 12px;
      }
      .unit:not(.first) {
        break-before: page;
        page-break-before: always;
      }
      .defect {
        break-inside: avoid;
        page-break-inside: avoid;
        padding-bottom: 12px;
        margin-bottom: 12px;
      }
      .shots {
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      .shot {
        background: #f7f5f0;
        border: 0.6pt solid rgba(0,0,0,0.12);
        border-radius: 3px;
        box-shadow: none;
      }
      .shot img {
        background: #f7f5f0;
        max-height: 260px;
      }
      .shot.plan img { max-height: 300px; }
      .shot, .shot img {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .num { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .badge { background: transparent; }
    }
  </style>
</head>
<body>
  ${toolbar}
  <div class="page">
    <header class="cover">
      <div class="eyebrow">Photo Inspection Report</div>
      <h1>${escapeHtml(projectName || '查驗專案')}</h1>
      <p class="sub">純圖片查驗報告 · 每筆含位置圖與現況照片</p>
      <div class="meta-row">
        <span>紀錄：${escapeHtml(recorderName || '現場查驗')}</span>
        <span>產出：${escapeHtml(dateLabel)}</span>
        <span>${units.length} 戶 · ${totalDefects} 筆缺失</span>
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
