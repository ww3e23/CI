import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, FileDown, FileSpreadsheet, Images } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { useCurrentProject, useCurrentUser } from '../../store/useAuthStore'
import { buildMatrix, formatActivity, unitProgress } from '../../lib/progress'
import { formatActorLabel } from '../../lib/currentActor'
import { exportInspectionExcel } from '../../lib/excelReport'
import {
  exportJiaShanLinExcel,
  unitHasBeenInspected,
} from '../../lib/excelReportJiaShanLin'
import { sortFloorsDesc } from '../../lib/floors'
import type { BuildingRule, ProgressCell, Unit } from '../../types'
import { ReportPreview } from './ReportPreview'
import { PhotoReportPreview } from './PhotoReportPreview'
import { TitleHint } from '../ui/TitleHint'
import { Modal } from '../ui/Modal'

function unitKey(buildingId: string, floor: string, code: string) {
  return `${buildingId}|${floor}|${code}`
}

export function ReportsPage() {
  const state = useProjectStore()
  const project = useCurrentProject()
  const currentUser = useCurrentUser()
  const matrix = useMemo(() => buildMatrix(state), [state])
  const [selected, setSelected] = useState<ProgressCell | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [photoPreviewOpen, setPhotoPreviewOpen] = useState(false)
  const [photoUnitIds, setPhotoUnitIds] = useState<string[] | undefined>(undefined)
  const [reportChooserOpen, setReportChooserOpen] = useState(false)
  const [excelBusy, setExcelBusy] = useState(false)
  const [excelChooserOpen, setExcelChooserOpen] = useState(false)
  const [excelKind, setExcelKind] = useState<'general' | 'jsl' | null>(null)
  const [unitPickOpen, setUnitPickOpen] = useState(false)
  const [unitPickMode, setUnitPickMode] = useState<'excel' | 'photo'>('excel')
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [pickBuildingId, setPickBuildingId] = useState('')
  const setCurrentUnit = useProjectStore((s) => s.setCurrentUnit)
  const matrixScrollRef = useRef<HTMLDivElement>(null)
  const didAutoScrollRef = useRef(false)
  const [buildingPercentsOpen, setBuildingPercentsOpen] = useState(false)
  const backfillActorNames = useProjectStore((s) => s.backfillActorNames)

  // 進入報告頁時主動把舊「現場查驗」改成真實姓名並上雲
  useEffect(() => {
    const n = backfillActorNames()
    if (n > 0) {
      console.info(`[actor-backfill] 已修正 ${n} 筆舊查驗人佔位名`)
    }
  }, [backfillActorNames])

  const cellMap = useMemo(() => {
    const m = new Map<string, ProgressCell>()
    for (const c of matrix.cells) m.set(`${c.buildingId}|${c.floor}|${c.unitCode}`, c)
    return m
  }, [matrix.cells])

  /** 總覽數字：有開工戶時顯示「已開工戶平均」，避免全案未開始戶把進度稀釋成 0% */
  const overviewPercent =
    matrix.startedUnitCount > 0
      ? matrix.startedOverallPercent
      : matrix.overallPercent

  const firstStartedCell = useMemo(
    () =>
      matrix.cells.find(
        (c) =>
          c.status === 'has_defects' ||
          c.status === 'in_progress' ||
          c.status === 'completed',
      ) ?? null,
    [matrix.cells],
  )

  // 矩陣很寬時自動滾到第一格有進度的棟，避免只看到前面全白的 A/B 棟
  useEffect(() => {
    if (didAutoScrollRef.current || !firstStartedCell) return
    const scroller = matrixScrollRef.current
    if (!scroller) return
    const sel = `[data-matrix-building="${CSS.escape(firstStartedCell.buildingId)}"]`
    const anchor = scroller.querySelector<HTMLElement>(sel)
    if (!anchor) return
    const left = Math.max(0, anchor.offsetLeft - 56)
    scroller.scrollTo({ left, behavior: 'smooth' })
    didAutoScrollRef.current = true
  }, [firstStartedCell])

  /** 各戶缺失總數（含已改善，不含作廢） */
  const defectTotalByUnit = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of state.defects) {
      if (d.status === 'voided') continue
      m.set(d.unitId, (m.get(d.unitId) ?? 0) + 1)
    }
    return m
  }, [state.defects])

  const reportName = project?.name ?? state.projectName

  const activeBuildings = useMemo(
    () =>
      [...state.buildings]
        .filter((b) => b.active)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [state.buildings],
  )

  const unitByKey = useMemo(() => {
    const m = new Map<string, Unit>()
    for (const u of state.units) {
      if (!u.active) continue
      m.set(unitKey(u.buildingId, u.floor, u.code), u)
    }
    return m
  }, [state.units])

  const inspectedKeys = useMemo(() => {
    const keys: string[] = []
    for (const [key, u] of unitByKey) {
      if (unitHasBeenInspected(state, u)) keys.push(key)
    }
    return keys
  }, [unitByKey, state])

  const pickBuilding =
    activeBuildings.find((b) => b.id === pickBuildingId) ?? activeBuildings[0] ?? null
  const pickFloors = useMemo(
    () => (pickBuilding ? sortFloorsDesc(pickBuilding.floors) : []),
    [pickBuilding],
  )

  const pickedIds = useMemo(() => {
    const ids: string[] = []
    for (const [key, on] of Object.entries(picked)) {
      if (!on) continue
      const u = unitByKey.get(key)
      if (u) ids.push(u.id)
    }
    return ids
  }, [picked, unitByKey])

  function resolveDefaultPhotoUnitIds(): string[] {
    const fromInspected = inspectedKeys
      .map((k) => unitByKey.get(k)?.id)
      .filter((id): id is string => Boolean(id))
    if (fromInspected.length > 0) return fromInspected

    // 後援：只要有未作廢缺失的戶也算可出報告
    const withDefects = new Set<string>()
    for (const d of state.defects) {
      if (d.status === 'voided') continue
      if (d.unitId) withDefects.add(d.unitId)
    }
    return [...withDefects].filter((id) => state.units.some((u) => u.id === id && u.active))
  }

  /** 關閉舊 Modal 後延遲再開，避免手機「點穿」立刻關掉新層（看起來像沒反應） */
  function afterModalClose(openNext: () => void) {
    window.setTimeout(openNext, 360)
  }

  function openPhotoUnitPicker() {
    setReportChooserOpen(false)
    setUnitPickMode('photo')
    const initial: Record<string, boolean> = {}
    for (const key of inspectedKeys) initial[key] = true
    // 若尚無「已查驗」標記，預勾有缺失的戶
    if (Object.keys(initial).length === 0) {
      for (const id of resolveDefaultPhotoUnitIds()) {
        const u = state.units.find((x) => x.id === id)
        if (u) initial[unitKey(u.buildingId, u.floor, u.code)] = true
      }
    }
    setPicked(initial)
    const preferred =
      activeBuildings.find((b) =>
        Object.keys(initial).some((k) => k.startsWith(`${b.id}|`)),
      ) ?? activeBuildings[0]
    setPickBuildingId(preferred?.id ?? '')
    afterModalClose(() => setUnitPickOpen(true))
  }

  function openUnitPicker(kind: 'general' | 'jsl') {
    setExcelChooserOpen(false)
    setExcelKind(kind)
    setUnitPickMode('excel')
    const initial: Record<string, boolean> = {}
    for (const key of inspectedKeys) initial[key] = true
    setPicked(initial)
    const preferred =
      activeBuildings.find((b) =>
        inspectedKeys.some((k) => k.startsWith(`${b.id}|`)),
      ) ?? activeBuildings[0]
    setPickBuildingId(preferred?.id ?? '')
    afterModalClose(() => setUnitPickOpen(true))
  }

  /** 一鍵開啟：不經選戶層，直接出已查驗／有缺失戶報告 */
  function openPhotoReportDirect() {
    try {
      const unitIds = resolveDefaultPhotoUnitIds()
      if (unitIds.length === 0) {
        window.alert('尚無可列入的戶別。請先完成至少一戶查驗（或新增缺失），也可改按「先選戶別」。')
        return
      }
      // 同步先開預覽再關選單，避免關閉動畫期間點穿到底部導航把報表頁卸載
      setPhotoUnitIds(unitIds)
      setPhotoPreviewOpen(true)
      setReportChooserOpen(false)
    } catch (err) {
      console.error('[photo-report] open direct failed', err)
      window.alert(
        err instanceof Error && err.message
          ? `圖片報告開啟失敗：${err.message}`
          : '圖片報告開啟失敗，請稍後再試',
      )
    }
  }

  function selectInspectedOnly() {
    const next: Record<string, boolean> = {}
    for (const key of inspectedKeys) next[key] = true
    setPicked(next)
  }

  function selectAllUnits() {
    const next: Record<string, boolean> = {}
    for (const key of unitByKey.keys()) next[key] = true
    setPicked(next)
  }

  function clearPicked() {
    setPicked({})
  }

  function togglePickCell(key: string, unit: Unit | undefined) {
    if (!unit) return
    setPicked((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function togglePickFloor(b: BuildingRule, floor: string) {
    const keys = b.unitCodes
      .map((code) => unitKey(b.id, floor, code))
      .filter((k) => unitByKey.has(k))
    if (keys.length === 0) return
    const allOn = keys.every((k) => picked[k])
    setPicked((prev) => {
      const next = { ...prev }
      for (const k of keys) next[k] = !allOn
      return next
    })
  }

  function togglePickColumn(b: BuildingRule, code: string) {
    const keys = pickFloors
      .map((floor) => unitKey(b.id, floor, code))
      .filter((k) => unitByKey.has(k))
    if (keys.length === 0) return
    const allOn = keys.every((k) => picked[k])
    setPicked((prev) => {
      const next = { ...prev }
      for (const k of keys) next[k] = !allOn
      return next
    })
  }

  const handleExportExcel = async () => {
    if (excelBusy || !excelKind) return
    const unitIds =
      pickedIds.length > 0
        ? pickedIds
        : inspectedKeys
            .map((k) => unitByKey.get(k)?.id)
            .filter((id): id is string => Boolean(id))

    if (unitIds.length === 0) {
      window.alert('沒有可匯出的戶別。請勾選戶別，或先完成至少一戶查驗。')
      return
    }

    setUnitPickOpen(false)
    setExcelBusy(true)
    try {
      const snap = useProjectStore.getState()
      if (excelKind === 'jsl') {
        await exportJiaShanLinExcel(snap, {
          displayName: reportName,
          unitIds,
        })
      } else {
        await exportInspectionExcel(snap, {
          displayName: reportName,
          unitIds,
        })
      }
    } catch (err) {
      console.error('[excel] export failed', err)
      window.alert(
        err instanceof Error && err.message
          ? `Excel 匯出失敗：${err.message}`
          : 'Excel 匯出失敗，請稍後再試',
      )
    } finally {
      setExcelBusy(false)
      setExcelKind(null)
    }
  }

  function openPhotoReport() {
    try {
      const unitIds =
        pickedIds.length > 0
          ? pickedIds
          : resolveDefaultPhotoUnitIds()

      if (unitIds.length === 0) {
        window.alert('沒有可列入的戶別。請勾選戶別，或先完成至少一戶查驗。')
        return
      }
      // 同步先開預覽再關選戶層（選戶按鈕靠近底欄，延遲開最容易點穿切頁）
      setPhotoUnitIds(unitIds)
      setPhotoPreviewOpen(true)
      setUnitPickOpen(false)
    } catch (err) {
      console.error('[photo-report] open failed', err)
      window.alert(
        err instanceof Error && err.message
          ? `圖片報告開啟失敗：${err.message}`
          : '圖片報告開啟失敗，請稍後再試',
      )
    }
  }

  function scrollMatrixToBuilding(buildingId: string) {
    const scroller = matrixScrollRef.current
    if (!scroller) return
    const sel = `[data-matrix-building="${CSS.escape(buildingId)}"]`
    const anchor = scroller.querySelector<HTMLElement>(sel)
    if (!anchor) return
    scroller.scrollTo({
      left: Math.max(0, anchor.offsetLeft - 56),
      behavior: 'smooth',
    })
  }

  return (
    <div className="rise">
      <header style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
        <div>
          <div className="eyebrow">PROGRESS MATRIX</div>
          <TitleHint
            as="h1"
            className="serif"
            style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 700 }}
            hint="棟別 × 樓層 × 戶別一次看完全案；可預覽報告，或匯出分層分戶缺失 Excel。"
          >
            查驗進度矩陣
          </TitleHint>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setReportChooserOpen(true)}
          >
            <FileDown size={16} /> 匯出報告
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={excelBusy}
            onClick={() => setExcelChooserOpen(true)}
            title="選擇匯出一般報表或甲山林報表"
          >
            <FileSpreadsheet size={16} /> {excelBusy ? '匯出中…' : '匯出 Excel'}
          </button>
        </div>
      </header>

      {reportChooserOpen && (
        <Modal
          onClose={() => setReportChooserOpen(false)}
          aria-label="選擇報告類型"
          variant="center"
        >
          <TitleHint
            as="h3"
            className="serif"
            style={{ margin: '0 0 8px', fontSize: 20 }}
            hint="完整報告含進度矩陣；圖片報告只列專案／紀錄者與位置圖＋現況照。"
          >
            選擇報告類型
          </TitleHint>
          <p style={{ margin: '0 0 14px', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 600 }}>
            圖片報告可再選戶別，一戶一戶依序列出
          </p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%', marginBottom: 10 }}
            onClick={() => {
              setReportChooserOpen(false)
              setPreviewOpen(true)
            }}
          >
            <FileDown size={16} /> 完整報告（含矩陣）
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ width: '100%', marginBottom: 8 }}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              openPhotoReportDirect()
            }}
          >
            <Images size={16} /> 純圖片報告
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ width: '100%', marginBottom: 10, minHeight: 40 }}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              openPhotoUnitPicker()
            }}
          >
            先選戶別再產生圖片報告
          </button>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', lineHeight: 1.45 }}>
            純圖片會直接開啟預覽（已查驗／有缺失戶）。若要挑特定戶，請用「先選戶別」。
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ width: '100%', marginTop: 12 }}
            onClick={() => setReportChooserOpen(false)}
          >
            取消
          </button>
        </Modal>
      )}

      {excelChooserOpen && (
        <Modal
          onClose={() => setExcelChooserOpen(false)}
          aria-label="選擇 Excel 報表格式"
          variant="center"
        >
          <TitleHint
            as="h3"
            className="serif"
            style={{ margin: '0 0 8px', fontSize: 20 }}
            hint="選格式後再勾選要下載的戶別；未另選時預設只含已查驗戶。"
          >
            選擇匯出格式
          </TitleHint>
          <p style={{ margin: '0 0 14px', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 600 }}>
            下一步可勾選戶別（預設：已查驗）
          </p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%', marginBottom: 10 }}
            disabled={excelBusy}
            onClick={() => openUnitPicker('general')}
          >
            <FileSpreadsheet size={16} /> 一般報表
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ width: '100%', marginBottom: 10 }}
            disabled={excelBusy}
            onClick={() => openUnitPicker('jsl')}
          >
            <FileSpreadsheet size={16} /> 甲山林報表
          </button>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', lineHeight: 1.45 }}>
            甲山林格式：總表＋每戶一分頁。特定戶匯出標題／檔名為「案名_樓層戶號」（例：新竹帝寶 8-2_8FA3）。
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ width: '100%', marginTop: 12 }}
            onClick={() => setExcelChooserOpen(false)}
          >
            取消
          </button>
        </Modal>
      )}

      {unitPickOpen && (
        <Modal
          onClose={() => {
            setUnitPickOpen(false)
            setExcelKind(null)
          }}
          aria-label="選擇匯出戶別"
          variant="bottom"
          className="unit-pick-sheet"
        >
          <div className="unit-pick-body">
          <TitleHint
            as="h3"
            className="serif"
            style={{ margin: '0 0 6px', fontSize: 20 }}
            hint="預設勾選已查驗戶。可改勾其他戶，或按「已查驗」一鍵重設。"
          >
            選擇{unitPickMode === 'photo' ? '報告' : '匯出'}戶別
          </TitleHint>
          <p style={{ margin: '0 0 10px', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 600 }}>
            {unitPickMode === 'photo'
              ? '純圖片報告'
              : excelKind === 'jsl'
                ? '甲山林報表'
                : '一般報表'}
            ｜已選 {pickedIds.length} 戶
            {inspectedKeys.length > 0
              ? `（已查驗 ${inspectedKeys.length} 戶）`
              : '（尚無已查驗戶）'}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <button type="button" className="btn btn-ghost" style={{ minHeight: 36 }} onClick={selectInspectedOnly}>
              已查驗
            </button>
            <button type="button" className="btn btn-ghost" style={{ minHeight: 36 }} onClick={selectAllUnits}>
              全選
            </button>
            <button type="button" className="btn btn-ghost" style={{ minHeight: 36 }} onClick={clearPicked}>
              清除
            </button>
          </div>

          {activeBuildings.length > 1 && (
            <label style={{ display: 'block', marginBottom: 4 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--ink-soft)',
                  marginBottom: 6,
                }}
              >
                選擇棟別（{activeBuildings.length}）
              </span>
              <select
                className="building-select"
                value={pickBuilding?.id ?? ''}
                onChange={(e) => setPickBuildingId(e.target.value)}
                aria-label="選擇棟別"
              >
                {activeBuildings.map((b) => {
                  const started =
                    matrix.buildingPercents.find((x) => x.buildingId === b.id)
                      ?.startedUnitCount ?? 0
                  return (
                    <option key={b.id} value={b.id}>
                      {b.name}
                      {started > 0 ? `（已開工 ${started} 戶）` : ''}
                    </option>
                  )
                })}
              </select>
            </label>
          )}

          {pickBuilding ? (
            <div className="glass matrix-scroll" style={{ maxHeight: '36vh', marginBottom: 4 }}>
              <table className="matrix-table">
                <thead>
                  <tr>
                    <th className="floor-cell">樓層</th>
                    {pickBuilding.unitCodes.map((code) => (
                      <th key={code}>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ minHeight: 28, padding: '0 6px', fontSize: 12 }}
                          onClick={() => togglePickColumn(pickBuilding, code)}
                        >
                          {code}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pickFloors.map((floor) => (
                    <tr key={floor}>
                      <td className="floor-cell">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ minHeight: 28, padding: '0 4px', fontSize: 12 }}
                          onClick={() => togglePickFloor(pickBuilding, floor)}
                        >
                          {floor}
                        </button>
                      </td>
                      {pickBuilding.unitCodes.map((code) => {
                        const key = unitKey(pickBuilding.id, floor, code)
                        const unit = unitByKey.get(key)
                        const on = Boolean(picked[key])
                        const inspected = unit ? unitHasBeenInspected(state, unit) : false
                        const prog = unit ? unitProgress(unit, state) : null
                        const cls = !unit
                          ? 'na'
                          : on
                            ? 'done'
                            : inspected
                              ? 'progress'
                              : 'empty'
                        return (
                          <td key={key}>
                            <button
                              type="button"
                              className={`matrix-cell ${cls}`}
                              disabled={!unit}
                              title={
                                unit
                                  ? `${pickBuilding.name} ${floor} ${code}${inspected ? '｜已查驗' : '｜未查驗'}${
                                      prog ? `｜缺失 ${prog.defectCount}` : ''
                                    }`
                                  : '無此戶'
                              }
                              onClick={() => togglePickCell(key, unit)}
                            >
                              {on ? '✓' : inspected ? '·' : ''}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: 'var(--ink-soft)', fontWeight: 600 }}>目前沒有可選戶別</p>
          )}
          </div>

          <div className="unit-pick-footer">
            {pickedIds.length === 0 && inspectedKeys.length === 0 && (
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--terracotta)' }}>
                尚無可匯出戶別：請先查驗至少一戶，或改勾選戶格
              </div>
            )}
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={unitPickMode === 'excel' ? excelBusy : false}
              onClick={() => {
                if (unitPickMode === 'photo') openPhotoReport()
                else void handleExportExcel()
              }}
            >
              {unitPickMode === 'photo' ? (
                <>
                  <Images size={16} />
                  {pickedIds.length > 0
                    ? `產生 ${pickedIds.length} 戶圖片報告`
                    : inspectedKeys.length > 0
                      ? '產生已查驗戶圖片報告'
                      : '產生圖片報告'}
                </>
              ) : (
                <>
                  <FileSpreadsheet size={16} />
                  {excelBusy
                    ? '匯出中…'
                    : pickedIds.length > 0
                      ? `下載 ${pickedIds.length} 戶`
                      : '下載已查驗戶'}
                </>
              )}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: '100%' }}
              onClick={() => {
                setUnitPickOpen(false)
                setExcelKind(null)
              }}
            >
              取消
            </button>
          </div>
        </Modal>
      )}

      <section className="glass-green" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div className="serif" style={{ fontWeight: 700, fontSize: 18 }}>戶內查驗總覽</div>
            <div style={{ marginTop: 4, fontSize: 12, fontWeight: 600, opacity: 0.88 }}>
              {matrix.startedUnitCount > 0
                ? `已開工 ${matrix.startedUnitCount} 戶平均 · 全案 ${matrix.overallPercent}%`
                : `全案 ${matrix.activeUnitCount} 戶尚未開工`}
            </div>
          </div>
          <div className="nums" style={{ fontSize: 28, fontWeight: 800 }}>{overviewPercent}%</div>
        </div>
        <div style={{ marginTop: 10, height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.22)', overflow: 'hidden' }}>
          <div style={{ width: `${overviewPercent}%`, height: '100%', background: '#fff', transition: 'width 0.4s ease' }} />
        </div>
      </section>

      <div className="chip-row" style={{ marginBottom: 10 }}>
        <Legend swatch="done" label="已完成" />
        <Legend swatch="defect" label="有缺失" />
        <Legend swatch="progress" label="進行中" />
        <Legend swatch="empty" label="未開始" />
        <Legend swatch="na" label="不適用" />
      </div>

      {matrix.buildings.length > 3 && (
        <div style={{ marginBottom: 8, color: 'var(--ink-soft)', fontSize: 12, fontWeight: 600 }}>
          矩陣可左右滑動查看各棟
          {firstStartedCell ? `（已定位到 ${firstStartedCell.buildingName}）` : ''}
        </div>
      )}

      <div className="glass matrix-scroll" ref={matrixScrollRef}>
        <table className="matrix-table">
          <thead>
            <tr>
              <th className="floor-cell" rowSpan={2}>樓層</th>
              {matrix.buildings.map((b) => (
                <th
                  key={b.id}
                  data-matrix-building={b.id}
                  colSpan={b.unitCodes.length}
                  style={{ color: 'var(--ink)', paddingBottom: 2 }}
                >
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
                    const defectTotal = cell?.unitId
                      ? (defectTotalByUnit.get(cell.unitId) ?? 0)
                      : 0
                    return (
                      <td key={`${b.id}-${floor}-${code}`}>
                        <button
                          type="button"
                          className={`matrix-cell ${cls}`}
                          style={selectedCls}
                          title={
                            cell
                              ? `${b.name} ${floor} ${code}｜進度 ${cell.percent}%｜缺失 ${defectTotal}`
                              : `${b.name} ${floor} ${code}`
                          }
                          onClick={() => {
                            if (!cell || cell.status === 'na') {
                              setSelected(cell ?? null)
                              return
                            }
                            setSelected(cell)
                            if (cell.unitId) setCurrentUnit(cell.unitId)
                          }}
                        >
                          {status !== 'na' && defectTotal > 0 ? defectTotal : ''}
                        </button>
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
              : `進度 ${selected.percent}%（${selected.checkedItems}/${selected.totalItems}）· 缺失 ${
                  selected.unitId ? (defectTotalByUnit.get(selected.unitId) ?? 0) : selected.defectCount
                }`}
          </div>
        </div>
      )}

      <div className="glass" style={{ marginTop: 10, padding: 0, overflow: 'hidden' }}>
        <button
          type="button"
          className="building-fold-toggle"
          aria-expanded={buildingPercentsOpen}
          onClick={() => setBuildingPercentsOpen((v) => !v)}
        >
          <div style={{ minWidth: 0, textAlign: 'left' }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>
              各棟進度 · {matrix.buildingPercents.length} 棟
            </div>
            <div
              style={{
                marginTop: 2,
                color: 'var(--ink-soft)',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {buildingPercentsOpen
                ? '點此收合'
                : matrix.startedUnitCount > 0
                  ? `已開工 ${matrix.startedUnitCount} 戶 · 點開跳至各棟`
                  : '點開查看／跳至各棟'}
            </div>
          </div>
          <ChevronDown
            size={18}
            style={{
              flexShrink: 0,
              color: 'var(--ink-soft)',
              transform: buildingPercentsOpen ? 'rotate(180deg)' : undefined,
              transition: 'transform 0.2s ease',
            }}
          />
        </button>
        {buildingPercentsOpen && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              padding: '0 12px 12px',
              borderTop: '1px solid rgba(34,41,31,0.08)',
              paddingTop: 10,
            }}
          >
            {matrix.buildingPercents.map((b) => (
              <button
                key={b.buildingId}
                type="button"
                className={`pill ${b.startedUnitCount > 0 ? '' : b.percent < 70 ? 'warn' : ''}`}
                style={{
                  cursor: 'pointer',
                  justifyContent: 'space-between',
                  width: '100%',
                  margin: 0,
                  border:
                    b.startedUnitCount > 0
                      ? '1px solid rgba(47, 93, 76, 0.45)'
                      : undefined,
                }}
                onClick={() => scrollMatrixToBuilding(b.buildingId)}
              >
                <span>{b.name}</span>
                <span>{b.percent}%</span>
              </button>
            ))}
          </div>
        )}
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
              gridTemplateColumns: '56px minmax(0, 1fr)',
              gap: 8,
              padding: '12px 0',
              borderBottom: '1px solid rgba(34,41,31,0.08)',
              fontSize: 13,
            }}
          >
            <span style={{ color: 'var(--ink-soft)', fontWeight: 600 }}>{a.at}</span>
            <div style={{ minWidth: 0 }}>
              <div>
                <strong>{formatActivity(a)}</strong>
                <span style={{ color: 'var(--ink-soft)' }}> · {a.summary}</span>
              </div>
              <div
                style={{
                  marginTop: 4,
                  color: 'var(--green-deep)',
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                查驗人：{formatActorLabel(a.actorName, a.actorAccount)}
              </div>
            </div>
          </div>
        ))}
        {state.activities.length === 0 && (
          <div style={{ padding: '14px 0', color: 'var(--ink-soft)', fontWeight: 600 }}>
            尚無修改紀錄
          </div>
        )}
      </div>

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', color: 'var(--ink-soft)', fontSize: 12, fontWeight: 600 }}>
        <span>
          {matrix.floors.length}層 × {matrix.activeUnitCount}戶
          {matrix.startedUnitCount > 0 ? `｜已開工 ${matrix.startedUnitCount}` : ''}
          （NA:{matrix.naCount}）
        </span>
        <span>
          {matrix.startedUnitCount > 0
            ? `已開工 ${matrix.startedOverallPercent}% · 全案 ${matrix.overallPercent}%`
            : `總進度 ${matrix.overallPercent}%`}
        </span>
      </div>

      {previewOpen && (
        <ReportPreview
          projectName={reportName}
          projectCode={project?.code}
          location={project?.location}
          state={state}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {photoPreviewOpen && (
        <PhotoReportPreview
          projectName={reportName}
          recorderName={currentUser?.displayName || '現場查驗'}
          state={state}
          unitIds={photoUnitIds}
          onClose={() => {
            setPhotoPreviewOpen(false)
            setPhotoUnitIds(undefined)
          }}
        />
      )}
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
