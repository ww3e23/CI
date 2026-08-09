import { useMemo, useState } from 'react'
import { useProjectStore } from '../../store/useProjectStore'
import { unitProgress } from '../../lib/progress'
import { UnitSwitcher } from '../UnitSwitcher'
import type { ChecklistCategory } from '../../types'

export function HomePage({
  onOpenCategory,
}: {
  onOpenCategory: (categoryId: string) => void
}) {
  const [switchOpen, setSwitchOpen] = useState(false)
  const projectName = useProjectStore((s) => s.projectName)
  const units = useProjectStore((s) => s.units)
  const categories = useProjectStore((s) => s.categories)
  const defects = useProjectStore((s) => s.defects)
  const currentUnitId = useProjectStore((s) => s.currentUnitId)

  const unit = units.find((u) => u.id === currentUnitId) ?? units.find((u) => u.active)
  const state = useProjectStore.getState()
  const progress = unit ? unitProgress(unit, state) : null

  const unitDefects = useMemo(
    () => defects.filter((d) => d.unitId === unit?.id && d.status !== 'voided'),
    [defects, unit?.id],
  )

  const stats = {
    repair: unitDefects.filter((d) => d.status === 'pending_repair').length,
    reinspect: unitDefects.filter((d) => d.status === 'pending_reinspection').length,
    returned: unitDefects.filter((d) => d.status === 'returned').length,
    done: unitDefects.filter((d) => d.status === 'completed').length,
  }

  if (!unit || !progress) {
    return <div className="rise"><p>請先到「我的」建立棟樓戶結構。</p></div>
  }

  const ring = 2 * Math.PI * 42
  const offset = ring - (progress.percent / 100) * ring

  return (
    <div className="rise">
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <div className="eyebrow">SITE INSPECTION</div>
          <div className="serif" style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>
            {projectName}
          </div>
          <div style={{ color: 'var(--ink-soft)', fontSize: 13, fontWeight: 600, marginTop: 2 }}>
            {unit.buildingName}・{unit.floor}・{unit.code}戶
          </div>
        </div>
        <button type="button" className="btn btn-ghost" style={{ minHeight: 40, borderRadius: 999 }} onClick={() => setSwitchOpen(true)}>
          切換戶別
        </button>
      </header>

      <div className="hero-stack">
        <div className="layer l3" />
        <div className="layer l2" />
        <section className="glass-green hero-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 700 }}>目前查驗戶別</div>
              <div className="serif" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1, marginTop: 4 }}>
                {unit.code} 戶
              </div>
              <div style={{ marginTop: 4, opacity: 0.9, fontWeight: 600 }}>
                {unit.buildingName} {unit.floor}
              </div>
            </div>
            <div style={{ position: 'relative', width: 104, height: 104 }}>
              <svg width="104" height="104" viewBox="0 0 104 104">
                <circle cx="52" cy="52" r="42" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="8" />
                <circle
                  cx="52"
                  cy="52"
                  r="42"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={ring}
                  strokeDashoffset={offset}
                  transform="rotate(-90 52 52)"
                  style={{ transition: 'stroke-dashoffset 0.4s ease' }}
                />
              </svg>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'grid',
                  placeItems: 'center',
                  textAlign: 'center',
                }}
              >
                <div>
                  <div className="nums" style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
                    {progress.percent}%
                  </div>
                  <div style={{ fontSize: 10, opacity: 0.85, fontWeight: 700 }}>完成率</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 14 }}>
            <div className="status-pill">
              <span className="n nums" style={{ color: '#F0D2A8' }}>{stats.repair}</span>
              <span className="l">待改善</span>
            </div>
            <div className="status-pill">
              <span className="n nums" style={{ color: '#B7D3E8' }}>{stats.reinspect}</span>
              <span className="l">待複驗</span>
            </div>
            <div className="status-pill">
              <span className="n nums" style={{ color: '#E8B4AB' }}>{stats.returned}</span>
              <span className="l">退回</span>
            </div>
            <div className="status-pill">
              <span className="n nums">{stats.done}</span>
              <span className="l">已完成</span>
            </div>
          </div>
        </section>
      </div>

      <div className="section-row">
        <h2>查驗大項</h2>
        <span className="link">查看全部</span>
      </div>

      <div className="grid-2">
        {categories
          .filter((c) => c.active)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((cat) => (
            <CategoryCard
              key={cat.id}
              cat={cat}
              defectCount={unitDefects.filter((d) => d.categoryId === cat.id).length}
              onClick={() => onOpenCategory(cat.id)}
            />
          ))}
      </div>

      {switchOpen && <UnitSwitcher onClose={() => setSwitchOpen(false)} />}
    </div>
  )
}

function CategoryCard({
  cat,
  defectCount,
  onClick,
}: {
  cat: ChecklistCategory
  defectCount: number
  onClick: () => void
}) {
  return (
    <button type="button" className="glass cat-card" onClick={onClick}>
      <span className={`badge ${defectCount > 0 ? 'warn' : 'zero'}`}>{defectCount}</span>
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          background: cat.color,
          color: '#fff',
          display: 'grid',
          placeItems: 'center',
          fontWeight: 800,
          marginBottom: 10,
        }}
      >
        {cat.iconChar}
      </div>
      <div className="serif" style={{ fontSize: 18, fontWeight: 700 }}>{cat.name}</div>
      <div style={{ marginTop: 4, color: 'var(--ink-soft)', fontSize: 12, fontWeight: 600 }}>
        {cat.itemCount} 細項
      </div>
    </button>
  )
}
