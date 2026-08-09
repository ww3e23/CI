import { useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, RefreshCw } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { unitProgress, totalChecklistItems } from '../../lib/progress'
import { UnitSwitcher } from '../UnitSwitcher'

export function InspectPage() {
  const [switchOpen, setSwitchOpen] = useState(false)
  const units = useProjectStore((s) => s.units)
  const categories = useProjectStore((s) => s.categories)
  const defects = useProjectStore((s) => s.defects)
  const currentUnitId = useProjectStore((s) => s.currentUnitId)
  const markUnitChecked = useProjectStore((s) => s.markUnitChecked)
  const addDefect = useProjectStore((s) => s.addDefect)

  const unit = units.find((u) => u.id === currentUnitId) ?? units.find((u) => u.active)
  const state = useProjectStore.getState()
  const progress = unit ? unitProgress(unit, state) : null

  const unitDefects = useMemo(
    () => defects.filter((d) => d.unitId === unit?.id && d.status !== 'voided'),
    [defects, unit?.id],
  )

  const stats = {
    total: unitDefects.length,
    reinspect: unitDefects.filter((d) => d.status === 'pending_reinspection').length,
    fixed: unitDefects.filter((d) => d.status === 'completed').length,
  }

  const recent = unitDefects.slice(0, 3)

  if (!unit || !progress) {
    return (
      <div className="rise">
        <p>請先到設定頁建立棟別與戶別結構。</p>
      </div>
    )
  }

  return (
    <div className="rise">
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: 'var(--green-800)',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 800,
            }}
          >
            檢
          </div>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 700 }}>
              SITE INSPECTION
            </div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>現場查驗</div>
          </div>
        </div>
      </header>

      <section
        className="card"
        style={{
          background: 'linear-gradient(145deg, #1f6b45 0%, #163d28 100%)',
          color: '#fff',
          padding: 16,
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 600 }}>目前查驗戶別</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 2, letterSpacing: '0.02em' }}>
              {unit.buildingName} {unit.floor} {unit.code}戶
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSwitchOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: 'rgba(255,255,255,0.14)',
              color: '#fff',
              borderRadius: 999,
              padding: '8px 12px',
              fontWeight: 700,
              fontSize: 13,
              minHeight: 40,
            }}
          >
            切換戶別 <ChevronDown size={16} />
          </button>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
            <span>查驗進度 {progress.checked} / {progress.total}</span>
            <span>{progress.percent}%</span>
          </div>
          <div
            style={{
              marginTop: 8,
              height: 8,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.22)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progress.percent}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #b7e0c5, #ffffff)',
                transition: 'width 0.35s ease',
              }}
            />
          </div>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
        <StatCard icon={<AlertTriangle size={16} color="#d4553a" />} value={stats.total} label="缺失總數" />
        <StatCard icon={<RefreshCw size={16} color="#3b7cab" />} value={stats.reinspect} label="待複驗" />
        <StatCard icon={<CheckCircle2 size={16} color="#2f8f5b" />} value={stats.fixed} label="已改善" />
      </section>

      <div className="section-label">
        <h2>
          CHECKLIST
          <span className="zh">選擇查驗大項</span>
        </h2>
        <span className="link">管理項目</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {categories
          .filter((c) => c.active)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((cat) => {
            const catDefects = unitDefects.filter((d) => d.categoryId === cat.id).length
            return (
              <button
                key={cat.id}
                type="button"
                className="card"
                style={{
                  textAlign: 'left',
                  padding: 14,
                  minHeight: 108,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
                onClick={() => {
                  const next = Math.min(progress.checked + 1, totalChecklistItems(state))
                  markUnitChecked(unit.id, next)
                  if (catDefects === 0 && Math.random() > 0.55) {
                    addDefect({
                      unitId: unit.id,
                      categoryId: cat.id,
                      categoryName: cat.name,
                      area: '客廳',
                      description: `${cat.name}項目現場標記`,
                    })
                  }
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: cat.color,
                    color: '#fff',
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 800,
                    fontSize: 14,
                  }}
                >
                  {cat.iconChar}
                </div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{cat.name}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 600 }}>
                    {cat.itemCount} 項
                  </span>
                  {catDefects > 0 && (
                    <span
                      style={{
                        background: '#f3d6d1',
                        color: '#b33a2a',
                        borderRadius: 999,
                        padding: '2px 8px',
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      {catDefects} 缺失
                    </span>
                  )}
                </div>
              </button>
            )
          })}
      </div>

      <div className="section-label">
        <h2>
          RECENT
          <span className="zh">最近新增</span>
        </h2>
        <span className="link">查看全部</span>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {recent.length === 0 && (
          <div className="card" style={{ padding: 14, color: 'var(--muted)', fontSize: 14 }}>
            此戶尚無缺失紀錄
          </div>
        )}
        {recent.map((d) => (
          <div key={d.id} className="card" style={{ padding: 14 }}>
            <div style={{ fontWeight: 800 }}>
              D-{String(d.defectNumber).padStart(2, '0')} · {d.area}
            </div>
            <div style={{ marginTop: 4 }}>{d.description}</div>
            <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 12, fontWeight: 600 }}>
              {d.categoryName} · {d.status === 'pending_repair' ? '待改善' : d.status === 'pending_reinspection' ? '待複驗' : '已完成'}
            </div>
          </div>
        ))}
      </div>

      {switchOpen && <UnitSwitcher onClose={() => setSwitchOpen(false)} />}
    </div>
  )
}

function StatCard({
  icon,
  value,
  label,
}: {
  icon: ReactNode
  value: number
  label: string
}) {
  return (
    <div className="card" style={{ padding: '12px 10px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  )
}
