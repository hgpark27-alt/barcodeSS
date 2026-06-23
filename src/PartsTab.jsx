import { useState } from 'react'
import * as api from './api'

// 부품 마스터 헤더
const PARTS_HDRS = ['partNo', 'description', 'qtyThreshold', 'priceAsIs', 'priceToBe', 'cumulative', 'unit']

function priceBadge(part) {
  const cum = Number(part.cumulative || 0)
  const thr = Number(part.qtyThreshold || 0)
  if (thr === 0) return { label: 'To-be', cls: 'tobe' }
  if (cum >= thr) return { label: 'To-be', cls: 'tobe' }
  if (cum / thr > 0.8) return { label: '임박', cls: 'imminent' }
  return { label: 'As-is', cls: 'asis' }
}

export default function PartsTab({ parts, onSave }) {
  const [selected, setSelected] = useState(null)
  const [partNo,      setPartNo]      = useState('')
  const [description, setDescription] = useState('')
  const [qtyThreshold, setQtyThreshold] = useState(0)
  const [priceAsIs,   setPriceAsIs]   = useState(0)
  const [priceToBe,   setPriceToBe]   = useState(0)
  const [cumulative,  setCumulative]  = useState(0)
  const [unit,        setUnit]        = useState('EA')
  const [msg,         setMsg]         = useState(null)
  const [loading,     setLoading]     = useState(false)

  const openNew = () => {
    setSelected({ __isNew: true })
    setPartNo(''); setDescription('')
    setQtyThreshold(0); setPriceAsIs(0); setPriceToBe(0)
    setCumulative(0); setUnit('EA')
    setMsg(null)
  }

  const openEdit = (part) => {
    setSelected(part)
    setPartNo(part.partNo || '')
    setDescription(part.description || '')
    setQtyThreshold(Number(part.qtyThreshold || 0))
    setPriceAsIs(Number(part.priceAsIs || 0))
    setPriceToBe(Number(part.priceToBe || 0))
    setCumulative(Number(part.cumulative || 0))
    setUnit(part.unit || 'EA')
    setMsg(null)
  }

  const save = async () => {
    if (!partNo.trim()) { setMsg({ type: 'error', text: 'Part No. 필수 입력' }); return }
    setLoading(true)
    try {
      const updated = {
        partNo:       partNo.trim(),
        description:  description.trim(),
        qtyThreshold: String(qtyThreshold),
        priceAsIs:    String(priceAsIs),
        priceToBe:    String(priceToBe),
        cumulative:   String(cumulative),
        unit:         unit.trim() || 'EA',
      }
      let newParts
      if (selected?.__isNew) {
        // 중복 확인
        if (parts.find(p => p.partNo === updated.partNo)) {
          setMsg({ type: 'error', text: '이미 존재하는 Part No.' })
          setLoading(false)
          return
        }
        newParts = [...parts, updated]
      } else {
        newParts = parts.map(p => p.partNo === selected.partNo ? updated : p)
      }
      await api.writeSheet('PARTS', api.fromObjects(PARTS_HDRS, newParts))
      setMsg({ type: 'ok', text: '저장 완료' })
      onSave()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    setLoading(false)
  }

  const remove = async () => {
    if (!selected || selected.__isNew) return
    if (!confirm(`"${selected.partNo}" 를 삭제하시겠습니까?`)) return
    setLoading(true)
    try {
      const newParts = parts.filter(p => p.partNo !== selected.partNo)
      await api.writeSheet('PARTS', api.fromObjects(PARTS_HDRS, newParts))
      setSelected(null)
      onSave()
    } catch (e) { alert(e.message) }
    setLoading(false)
  }

  return (
    <div className="pc-tab-body">
      <div className="tab-title-row">
        <div className="tab-title">부품 관리 ({parts.length})</div>
        <button className="btn-primary" onClick={openNew}>+ 부품 추가</button>
      </div>

      <div className="kit-layout">
        {/* 부품 목록 */}
        <div className="kit-list">
          {parts.length === 0
            ? <div className="empty-state">부품이 없습니다</div>
            : parts.map(p => {
                const badge = priceBadge(p)
                return (
                  <div key={p.partNo}
                    className={`kit-item ${selected?.partNo === p.partNo ? 'active' : ''}`}
                    onClick={() => openEdit(p)}>
                    <div className="kit-item-name" style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span className={`price-tier-badge ${badge.cls}`} style={{ fontSize:10 }}>{badge.label}</span>
                      <span className="mono" style={{ fontSize:12 }}>{p.partNo}</span>
                    </div>
                    <div className="kit-item-meta">
                      {p.description
                        ? p.description.slice(0, 40) + (p.description.length > 40 ? '…' : '')
                        : '설명 없음'}
                    </div>
                    <div className="kit-item-meta">
                      누적: {Number(p.cumulative||0)} / {Number(p.qtyThreshold||0)||'∞'} &nbsp;·&nbsp;
                      As-is: ${Number(p.priceAsIs||0).toLocaleString('en',{minimumFractionDigits:2})} &nbsp;·&nbsp;
                      To-be: ${Number(p.priceToBe||0).toLocaleString('en',{minimumFractionDigits:2})}
                    </div>
                  </div>
                )
              })
          }
        </div>

        {/* 편집 패널 */}
        {selected ? (
          <div className="form-card kit-edit">
            <div className="form-row">
              <label>Part No. <span className="req">*</span></label>
              <input
                value={partNo}
                onChange={e => setPartNo(e.target.value)}
                placeholder="0247-06936B"
                className="mono"
                disabled={!selected.__isNew}
              />
            </div>
            <div className="form-row">
              <label>Description</label>
              <input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="SERVICE KIT, FEP, 300MM EPI PRIME QUARTZ"
              />
            </div>
            <div className="form-row">
              <label>Q'ty 기준</label>
              <input
                type="number" min="0"
                value={qtyThreshold}
                onChange={e => setQtyThreshold(Number(e.target.value))}
                placeholder="0 = 없음"
              />
            </div>
            <div className="form-row">
              <label>As-is 단가 ($)</label>
              <input
                type="number" min="0" step="0.01"
                value={priceAsIs}
                onChange={e => setPriceAsIs(Number(e.target.value))}
              />
            </div>
            <div className="form-row">
              <label>To-be 단가 ($)</label>
              <input
                type="number" min="0" step="0.01"
                value={priceToBe}
                onChange={e => setPriceToBe(Number(e.target.value))}
              />
            </div>
            <div className="form-row">
              <label>누적 사용</label>
              <input
                type="number" min="0"
                value={cumulative}
                onChange={e => setCumulative(Number(e.target.value))}
                title="수동 보정 가능"
              />
            </div>
            <div className="form-row">
              <label>단위</label>
              <input
                value={unit}
                onChange={e => setUnit(e.target.value)}
                placeholder="EA"
              />
            </div>

            {msg && <div className={`msg msg-${msg.type}`}>{msg.text}</div>}

            <div className="btn-row">
              <button className="btn-primary" onClick={save} disabled={loading}>
                {loading ? '저장중...' : '저장'}
              </button>
              {!selected.__isNew && (
                <button className="btn-danger" onClick={remove} disabled={loading}>삭제</button>
              )}
              <button className="btn-secondary" onClick={() => setSelected(null)}>닫기</button>
            </div>
          </div>
        ) : (
          <div className="kit-empty-panel">부품을 선택하거나 새로 추가하세요</div>
        )}
      </div>
    </div>
  )
}
