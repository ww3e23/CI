import { useMemo, useState } from 'react'
import { FileDown } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { useCurrentProject } from '../../store/useAuthStore'
import { buildMatrix, formatActivity } from '../../lib/progress'
import { openInspectionReport } from '../../lib/reportDocument'
import type { ProgressCell } from '../../types'

export function ReportsPage() {
  const state = useProjectStore()
  const project = useCurrentProject()
  const matrix = useMemo(() => buildMatrix(state), [state])
  const [selected, setSelected] = useState<ProgressCell | null>(null)
  const [exportHint, setExportHint] = useState('')
  const setCurrentUnit = useProjectStore((s) => s.setCurrentUnit)

  const cellMap = useMemo(() => {
    const m = new Map<string, ProgressCell>()
    for (const c of matrix.cells) m.set(`${c.buildingId}|${c.floor}|${c.unitCode}`, c)
    return m
  }, [matrix.cells])

  function handleExport() {
    const win = openInspectionReport({
      projectName: project?.name ?? state.projectName,
      projectCode: project?.code,
      location: project?.location,
      state,
    })
    setExportHint(
      win
        ? '已開啟報告預覽，可按「列印／匯出 PDF」存檔'
        : '瀏覽器封鎖了彈出視窗，請允許後再試',
    )
  }

  return (
    <div className="rise">
      <header style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
        <div>
          <div className="eyebrow">PROGRESS MATRIX</div>
          <h1 className="serif" style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 700 }}>
            查驗進度色塊矩陣
          </h1>
          <p style={{ margin: '6px 0 0', color: 'var(--ink-soft)', fontSize: 13 }}>
            棟別 × 樓層 × 戶別一次看完全案；也可匯出質感報告 PDF。
          </p>
        </div>
        <button type="button" className="btn btn-primary" style={{ flexShrink: 0 }} onClick={handleExport}>
          <FileDown size={16} /> 匯出報告
        </button>
      </header>

      {exportHint && (
        <div className="sync-hint" style={{ marginBottom: 10 }}>{exportHint}</div>
      )}

      <section className="glass-green" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div className="serif" style={{ fontWeight: 700, fontSize: 18 }}>戶內查驗總覽</div>
          <div className="nums" style={{ fontSize: 28, fontWeight: 800 }}>{matrix.overallPercent}%</div>
        </div>
        <div style={{ marginTop: 10, height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.22)', overflow: 'hidden' }}>
          <div style={{ width: `${matrix.overallPercent}%`, height: '100%', background: '#fff', transition: 'width 0.4s ease' }} />
        </div>
      </section>

      <div className="chip-row" style={{ marginBottom: 10 }}>
        <Legend swatch="done" label="已完成" />
        <Legend swatch="defect" label="有缺失" />
        <Legend swatch="progress" label="進行中" />
        <Legend swatch="empty" label="未開始" />
        <Legend swatch="na" label="不適用" />
      </div>

      <div className="glass matrix-scroll">
        <table className="matrix-table">
          <thead>
            <tr>
              <th className="floor-cell" rowSpan={2}>樓層</th>
              {matrix.buildings.map((b) => (
                <th key={b.id} colSpan={b.unitCodes.length} style={{ color: 'var(--ink)', paddingBottom: 2 }}>
                  {b.name}
                </th>
              ))}
            </tr>
            <tr>
              {matrix.buildings.map((b) =>
                b.unitCodes.map((code) => (
                  <th key={`${b.id}-${code}`} style={{ color: 'var(--ink-soft)' }}>{code}</th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {matrix.floors.map((floor) => (
              <tr key={floor}>
                <td className="floor-cell">{floor}</td>
                {matrix.buildings.map((b) =>
                  b.unitCodes.map((code) => {
                    const cell = cellMap.get(`${b.id}|${floor}|${code}`)
                    const status = cell?.status ?? 'na'
                    const cls =
                      status === 'completed' ? 'done'
                        : status === 'has_defects' ? 'defect'
                          : status === 'in_progress' ? 'progress'
                            : status === 'not_started' ? 'empty' : 'na'
                    const selectedCls =
                      selected &&
                      selected.buildingId === b.id &&
                      selected.floor === floor &&
                      selected.unitCode === code
                        ? { boxShadow: '0 0 0 2px var(--slate)' }
                        : undefined
                    return (
                      <td key={`${b.id}-${floor}-${code}`}>
                        <button
                          type="button"
                          className={`matrix-cell ${cls}`}
                          style={selectedCls}
                          title={cell ? `${b.name} ${floor} ${code}｜${cell.percent}%` : `${b.name} ${floor} ${code}`}
                          onClick={() => {
                            if (!cell || cell.status === 'na') {
                              setSelected(cell ?? null)
                              return
                            }
                            setSelected(cell)
                            if (cell.unitId) setCurrentUnit(cell.unitId)
                          }}
                        />
                      </td>
                    )
                  }),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="glass" style={{ marginTop: 10, padding: 12 }}>
          <div style={{ fontWeight: 800 }}>
            {selected.buildingName} {selected.floor} {selected.unitCode}
          </div>
          <div style={{ color: 'var(--ink-soft)', fontSize: 13, marginTop: 4 }}>
            {selected.status === 'na'
              ? '此格標記為不適用'
              : `進度 ${selected.percent}%（${selected.checkedItems}/${selected.totalItems}）· 缺失 ${selected.defectCount}`}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 0' }}>
        {matrix.buildingPercents.map((b) => (
          <span key={b.buildingId} className={`pill ${b.percent < 70 ? 'warn' : ''}`}>
            {b.name} {b.percent}%
          </span>
        ))}
      </div>

      <div className="section-row">
        <h2>最近修改</h2>
      </div>
      <div className="glass" style={{ padding: '4px 14px' }}>
        {state.activities.slice(0, 8).map((a) => (
          <div
            key={a.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '64px 1fr auto',
              gap: 8,
              padding: '12px 0',
              borderBottom: '1px solid rgba(34,41,31,0.08)',
              fontSize: 13,
            }}
          >
            <span style={{ color: 'var(--ink-soft)', fontWeight: 600 }}>{a.at}</span>
            <span>
              <strong>{formatActivity(a)}</strong>
              <span style={{ color: 'var(--ink-soft)' }}> · {a.summary}</span>
            </span>
            <span style={{ color: 'var(--ink-soft)' }}>{a.actorName}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', color: 'var(--ink-soft)', fontSize: 12, fontWeight: 600 }}>
        <span>{matrix.floors.length}層 × {matrix.activeUnitCount}戶（NA:{matrix.naCount}）</span>
        <span>總進度 {matrix.overallPercent}%</span>
      </div>
    </div>
  )
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="chip" style={{ minHeight: 30, padding: '0 10px' }}>
      <span className={`matrix-cell ${swatch}`} style={{ width: 14, height: 12, pointerEvents: 'none' }} />
      {label}
    </span>
  )
}
