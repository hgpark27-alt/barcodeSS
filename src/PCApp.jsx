import { useState, useEffect, useRef, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import * as api from './api'
import UploadTab from './UploadTab'
import './PCApp.css'

const APP_URL = 'https://hgpark27-alt.github.io/barcodeSS/'

// ── 시트 헤더 (Apps Script와 동일하게 유지)
const HDRS = {
  KITS:       ['id', 'name', 'parts', 'updatedAt'],
  QUOTES:     ['id', 'quoteNo', 'poNo', 'kitId', 'items', 'totalUSD', 'totalKRW', 'createdAt'],
  TRADE_DOCS: ['id', 'docNo', 'poNo', 'quoteId', 'sn', 'shipping', 'barcodeVal', 'status', 'createdAt'],
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function now() {
  return new Date().toLocaleString('ko-KR')
}

// ──────────────────────────────────────────
// 공통 헤더
// ──────────────────────────────────────────
const NAV_TABS = [
  { id: 'kits',   label: '키트 관리' },
  { id: 'quote',  label: '견적서' },
  { id: 'trade',  label: '거래명세서' },
  { id: 'upload', label: 'PTN 업로드' },
  { id: 'list',   label: '목록' },
]

function Header() {
  return (
    <header className="pc-hdr">
      <div className="pc-hdr-brand">
        <svg width="24" height="16" viewBox="0 0 28 18" fill="none" style={{ marginRight: 8 }}>
          <rect x="0" y="0" width="3" height="18" fill="#2563eb" rx="1"/>
          <rect x="5" y="3" width="2" height="12" fill="#2563eb" rx="1"/>
          <rect x="9" y="0" width="4" height="18" fill="#2563eb" rx="1"/>
          <rect x="15" y="3" width="2" height="12" fill="#2563eb" rx="1"/>
          <rect x="19" y="0" width="3" height="18" fill="#2563eb" rx="1"/>
          <rect x="24" y="3" width="4" height="12" fill="#2563eb" rx="1"/>
        </svg>
        씰마스터
      </div>
      <div className="pc-hdr-qr">
        <QRCodeSVG value={APP_URL} size={36} />
        <span className="pc-hdr-qr-label">모바일</span>
      </div>
    </header>
  )
}

function Sidebar({ tab, onTab }) {
  return (
    <nav className="pc-sidebar">
      {NAV_TABS.map(t => (
        <button key={t.id}
          className={`pc-nav-btn ${tab === t.id ? 'active' : ''}`}
          onClick={() => onTab(t.id)}>
          {t.label}
        </button>
      ))}
    </nav>
  )
}

// ──────────────────────────────────────────
// 키트 관리 탭  (KITS 시트)
// 키트: id | name | parts(JSON) | updatedAt
// ──────────────────────────────────────────
function KitsTab({ kits, rawKits, onSave }) {
  const [selected, setSelected] = useState(null)   // 편집 중인 키트
  const [name,     setName]     = useState('')
  const [partsRaw, setPartsRaw] = useState('[]')   // JSON 문자열
  const [msg,      setMsg]      = useState(null)
  const [loading,  setLoading]  = useState(false)

  const openEdit = (kit) => {
    setSelected(kit)
    setName(kit.name || '')
    setPartsRaw(typeof kit.parts === 'string' ? kit.parts : JSON.stringify(kit.parts || [], null, 2))
    setMsg(null)
  }

  const openNew = () => {
    setSelected({ id: uid(), name: '', parts: '[]', updatedAt: '' })
    setName('')
    setPartsRaw('[]')
    setMsg(null)
  }

  const save = async () => {
    if (!name.trim()) { setMsg({ type: 'error', text: '키트명 입력' }); return }
    try { JSON.parse(partsRaw) } catch { setMsg({ type: 'error', text: 'parts JSON 오류' }); return }

    setLoading(true)
    try {
      const updated = {
        ...selected,
        name:      name.trim(),
        parts:     partsRaw,
        updatedAt: now(),
      }
      // 기존이면 교체, 신규면 추가
      const exists = kits.find(k => k.id === updated.id)
      let newKits
      if (exists) {
        newKits = kits.map(k => k.id === updated.id ? updated : k)
      } else {
        newKits = [...kits, updated]
      }
      await api.writeSheet('KITS', api.fromObjects(HDRS.KITS, newKits))
      setMsg({ type: 'ok', text: '저장 완료' })
      onSave()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    setLoading(false)
  }

  const remove = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return
    setLoading(true)
    try {
      const newKits = kits.filter(k => k.id !== id)
      await api.writeSheet('KITS', api.fromObjects(HDRS.KITS, newKits))
      if (selected?.id === id) setSelected(null)
      onSave()
    } catch (e) { alert(e.message) }
    setLoading(false)
  }

  return (
    <div className="pc-tab-body">
      <div className="tab-title-row">
        <div className="tab-title">키트 관리 ({kits.length})</div>
        <button className="btn-primary" onClick={openNew}>+ 키트 추가</button>
      </div>

      <div className="kit-layout">
        {/* 목록 */}
        <div className="kit-list">
          {kits.length === 0
            ? <div className="empty-state">키트가 없습니다</div>
            : kits.map(k => (
              <div key={k.id}
                className={`kit-item ${selected?.id === k.id ? 'active' : ''}`}
                onClick={() => openEdit(k)}>
                <div className="kit-item-name">{k.name || '(이름없음)'}</div>
                <div className="kit-item-meta">{(() => {
                  try { const p = JSON.parse(k.parts); return `부품 ${p.length}개` } catch { return '부품 정보 없음' }
                })()} · {String(k.updatedAt || '').slice(0, 10)}</div>
              </div>
            ))
          }
        </div>

        {/* 편집 패널 */}
        {selected ? (
          <div className="form-card kit-edit">
            <div className="form-row">
              <label>키트명</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="SERVICE KIT 0247-06765" />
            </div>
            <div className="form-col">
              <label className="form-label-full">
                부품 목록 (JSON) — 예: [{`{"partNo":"0041-90314","desc":"SEAL","qty":2,"price":100}`}]
              </label>
              <textarea
                className="paste-area"
                value={partsRaw}
                onChange={e => setPartsRaw(e.target.value)}
                rows={8}
                placeholder='[{"partNo":"","desc":"","qty":1,"price":0}]'
              />
            </div>
            {msg && <div className={`msg msg-${msg.type}`}>{msg.text}</div>}
            <div className="btn-row">
              <button className="btn-primary" onClick={save} disabled={loading}>
                {loading ? '저장중...' : '저장'}
              </button>
              <button className="btn-danger" onClick={() => remove(selected.id)} disabled={loading}>삭제</button>
              <button className="btn-secondary" onClick={() => setSelected(null)}>닫기</button>
            </div>
          </div>
        ) : (
          <div className="kit-empty-panel">키트를 선택하거나 새로 추가하세요</div>
        )}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────
// 견적서 탭  (QUOTES 시트)
// QUOTES: id | quoteNo | poNo | kitId | items(JSON) | totalUSD | totalKRW | createdAt
// ──────────────────────────────────────────
function QuoteTab({ kits, quotes, config, rawQuotes, onSave }) {
  const [step,     setStep]     = useState('select')  // select → edit → done
  const [kitId,    setKitId]    = useState('')
  const [poNo,     setPoNo]     = useState('')
  const [items,    setItems]    = useState([])          // [{partNo, desc, qty, price, total}]
  const [exRate,   setExRate]   = useState(Number(config?.exchangeRate || 1350))
  const [msg,      setMsg]      = useState(null)
  const [loading,  setLoading]  = useState(false)

  const selectedKit = kits.find(k => k.id === kitId)

  const loadKit = () => {
    if (!selectedKit) return
    try {
      const parts = JSON.parse(selectedKit.parts || '[]')
      setItems(parts.map(p => ({
        partNo: p.partNo || '',
        desc:   p.desc   || '',
        qty:    Number(p.qty   || 1),
        price:  Number(p.price || 0),
      })))
      setStep('edit')
    } catch { setMsg({ type: 'error', text: 'parts JSON 오류' }) }
  }

  const totalUSD = items.reduce((s, it) => s + it.qty * it.price, 0)
  const totalKRW = Math.round(totalUSD * exRate)

  const nextQuoteNo = () => {
    const seq = Number(config?.quoteSequence || 1)
    return `Q${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`
  }

  const save = async () => {
    if (!poNo.trim()) { setMsg({ type: 'error', text: 'PO번호 입력' }); return }
    setLoading(true)
    try {
      const quoteNo = nextQuoteNo()
      const newQuote = {
        id:        uid(),
        quoteNo,
        poNo:      poNo.trim(),
        kitId,
        items:     JSON.stringify(items),
        totalUSD:  totalUSD.toFixed(2),
        totalKRW:  totalKRW.toString(),
        createdAt: now(),
      }
      await api.appendRow('QUOTES', HDRS.QUOTES.map(h => newQuote[h] ?? ''))

      // CONFIG quoteSequence 증가
      if (config) {
        const seq = Number(config.quoteSequence || 1) + 1
        const cfgValues = await api.readSheet('CONFIG')
        await api.updateConfig('quoteSequence', seq, cfgValues)
      }

      setMsg({ type: 'ok', text: `저장: ${quoteNo}` })
      setStep('done')
      onSave()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    setLoading(false)
  }

  return (
    <div className="pc-tab-body">
      <div className="tab-title">견적서 생성</div>

      {step === 'select' && (
        <div className="form-card">
          <div className="form-row">
            <label>키트 선택</label>
            <select value={kitId} onChange={e => setKitId(e.target.value)}>
              <option value="">-- 키트 선택 --</option>
              {kits.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>PO번호</label>
            <input value={poNo} onChange={e => setPoNo(e.target.value)} placeholder="PO25033100083" className="mono" />
          </div>
          <div className="form-row">
            <label>환율 (₩/$)</label>
            <input type="number" value={exRate} onChange={e => setExRate(Number(e.target.value))} />
          </div>
          {msg && <div className={`msg msg-${msg.type}`}>{msg.text}</div>}
          <button className="btn-primary" onClick={loadKit} disabled={!kitId}>다음 → 부품 확인</button>
        </div>
      )}

      {step === 'edit' && (
        <>
          <div className="form-card">
            <div className="quote-kit-name">{selectedKit?.name}</div>
            <div className="quote-po">PO: <span className="mono">{poNo}</span></div>
          </div>

          <div className="master-table-wrap">
            <table className="master-table">
              <thead>
                <tr>
                  <th>#</th><th>Part No.</th><th>Description</th>
                  <th>Qty</th><th>Unit Price ($)</th><th>Total ($)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td className="mono">
                      <input className="cell-input mono" value={it.partNo}
                        onChange={e => setItems(prev => prev.map((x, j) => j === i ? { ...x, partNo: e.target.value } : x))} />
                    </td>
                    <td>
                      <input className="cell-input" value={it.desc}
                        onChange={e => setItems(prev => prev.map((x, j) => j === i ? { ...x, desc: e.target.value } : x))} />
                    </td>
                    <td>
                      <input className="cell-input num" type="number" min="1" value={it.qty}
                        onChange={e => setItems(prev => prev.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))} />
                    </td>
                    <td>
                      <input className="cell-input num" type="number" min="0" step="0.01" value={it.price}
                        onChange={e => setItems(prev => prev.map((x, j) => j === i ? { ...x, price: Number(e.target.value) } : x))} />
                    </td>
                    <td className="right mono">${(it.qty * it.price).toLocaleString('en', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="total-row">
                  <td colSpan="5" className="right">합계</td>
                  <td className="right mono"><strong>${totalUSD.toLocaleString('en', { minimumFractionDigits: 2 })}</strong></td>
                </tr>
                <tr className="total-row">
                  <td colSpan="5" className="right">₩ (환율 {exRate.toLocaleString()})</td>
                  <td className="right mono"><strong>₩{totalKRW.toLocaleString()}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {msg && <div className={`msg msg-${msg.type}`}>{msg.text}</div>}
          <div className="btn-row">
            <button className="btn-secondary" onClick={() => setStep('select')}>← 다시</button>
            <button className="btn-primary" onClick={save} disabled={loading}>
              {loading ? '저장중...' : '견적서 저장'}
            </button>
          </div>
        </>
      )}

      {step === 'done' && (
        <div className="form-card">
          <div className="msg msg-ok">{msg?.text || '저장 완료'}</div>
          <div className="btn-row">
            <button className="btn-primary" onClick={() => { setStep('select'); setKitId(''); setPoNo(''); setMsg(null) }}>
              새 견적서
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────
// 거래명세서 탭  (TRADE_DOCS 시트)
// TRADE_DOCS: id|docNo|poNo|quoteId|sn|shipping|barcodeVal|status|createdAt
// ──────────────────────────────────────────
function TradeTab({ quotes, tradeDocs, rawTradeDocs, onSave }) {
  const [quoteId, setQuoteId] = useState('')
  const [sn,      setSn]      = useState('')
  const [msg,     setMsg]     = useState(null)
  const [loading, setLoading] = useState(false)
  const barcodeRef = useRef(null)

  const selectedQuote = quotes.find(q => q.id === quoteId)

  // JsBarcode 렌더링
  useEffect(() => {
    if (!selectedQuote || !barcodeRef.current) return
    const po = selectedQuote.poNo || ''
    if (!po) return
    import('jsbarcode').then(({ default: JsBarcode }) => {
      try {
        JsBarcode(barcodeRef.current, 'GM:' + po, {
          format: 'CODE128', displayValue: true,
          fontSize: 14, height: 80, margin: 10,
          background: '#ffffff', lineColor: '#000000',
        })
      } catch {}
    })
  }, [selectedQuote])

  const save = async () => {
    if (!selectedQuote) { setMsg({ type: 'error', text: 'Quote 선택' }); return }
    if (!sn.trim()) { setMsg({ type: 'error', text: 'SN 입력' }); return }
    setLoading(true)
    try {
      const poNo = selectedQuote.poNo || ''
      const doc = {
        id:         uid(),
        docNo:      `D${Date.now().toString(36).toUpperCase()}`,
        poNo,
        quoteId:    selectedQuote.id,
        sn:         sn.trim(),
        shipping:   '',
        barcodeVal: 'GM:' + poNo,
        status:     '거명완료',
        createdAt:  now(),
      }
      await api.appendRow('TRADE_DOCS', HDRS.TRADE_DOCS.map(h => doc[h] ?? ''))
      setMsg({ type: 'ok', text: `거래명세서 저장: ${doc.docNo}` })
      onSave()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    setLoading(false)
  }

  return (
    <div className="pc-tab-body">
      <div className="tab-title">거래명세서 생성 · 인쇄</div>

      <div className="form-card no-print">
        <div className="form-row">
          <label>Quote 선택</label>
          <select value={quoteId} onChange={e => { setQuoteId(e.target.value); setSn('') }}>
            <option value="">-- Quote 선택 --</option>
            {quotes.map(q => (
              <option key={q.id} value={q.id}>
                {q.quoteNo} | {q.poNo} | ${Number(q.totalUSD || 0).toLocaleString()}
              </option>
            ))}
          </select>
        </div>
        {selectedQuote && (
          <div className="form-row">
            <label>S/N <span className="req">*</span></label>
            <input value={sn} onChange={e => setSn(e.target.value)} placeholder="시리얼 넘버" className="mono" />
          </div>
        )}
        {msg && <div className={`msg msg-${msg.type}`}>{msg.text}</div>}
        {selectedQuote && (
          <div className="btn-row">
            <button className="btn-secondary" onClick={save} disabled={loading}>
              {loading ? '저장중...' : '저장'}
            </button>
            <button className="btn-primary" onClick={() => window.print()}>인쇄</button>
          </div>
        )}
      </div>

      {selectedQuote && (
        <div className="invoice-preview" id="invoice-print-area">
          <div className="invoice-header">
            <div className="invoice-company">
              <div className="invoice-company-name">한솔아이원스</div>
              <div className="invoice-company-sub">HANSOL IONES Co., Ltd.</div>
            </div>
            <div className="invoice-title-block">
              <div className="invoice-title">거 래 명 세 서</div>
              <div className="invoice-date">{new Date().toLocaleDateString('ko-KR')}</div>
            </div>
          </div>

          <div className="invoice-info-grid">
            {[
              ['Quote No.', selectedQuote.quoteNo],
              ['PO번호', selectedQuote.poNo],
              ['S/N', sn || '-'],
              ['합계 (USD)', `$${Number(selectedQuote.totalUSD || 0).toLocaleString('en', { minimumFractionDigits: 2 })}`],
              ['합계 (KRW)', `₩${Number(selectedQuote.totalKRW || 0).toLocaleString()}`],
            ].map(([label, value]) => (
              <div key={label} className="info-item">
                <span className="info-label">{label}</span>
                <span className="info-value mono">{value}</span>
              </div>
            ))}
          </div>

          <div className="invoice-barcode-section">
            <div className="barcode-label">PO 바코드 (거래명세서 검증용)</div>
            <svg ref={barcodeRef} />
            <div className="barcode-hint">모바일에서 이 바코드를 먼저 스캔하세요</div>
          </div>

          <div className="invoice-footer">
            <div className="footer-note">
              씰마스터 시스템 자동 생성 · 검증: 거래명세서BC → PTN BC → 제품SN BC
            </div>
            <div className="footer-sig">
              <div className="sig-box">담당자</div>
              <div className="sig-box">확인자</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────
// 목록 탭
// ──────────────────────────────────────────
function ListTab({ quotes, tradeDocs, onRefresh }) {
  const [view, setView] = useState('quotes')

  return (
    <div className="pc-tab-body">
      <div className="tab-title-row">
        <div className="mode-toggle">
          <button className={view === 'quotes' ? 'active' : ''} onClick={() => setView('quotes')}>견적서</button>
          <button className={view === 'trade'  ? 'active' : ''} onClick={() => setView('trade')}>거래명세서</button>
        </div>
        <button className="btn-icon" onClick={onRefresh} title="새로고침">↺</button>
      </div>

      {view === 'quotes' && (
        <div className="master-table-wrap">
          {quotes.length === 0
            ? <div className="empty-state">견적서가 없습니다</div>
            : (
              <table className="master-table">
                <thead>
                  <tr><th>#</th><th>Quote No.</th><th>PO번호</th><th>합계 USD</th><th>합계 KRW</th><th>생성일시</th></tr>
                </thead>
                <tbody>
                  {quotes.map((q, i) => (
                    <tr key={q.id}>
                      <td>{i + 1}</td>
                      <td className="mono">{q.quoteNo}</td>
                      <td className="mono">{q.poNo}</td>
                      <td className="right">${Number(q.totalUSD || 0).toLocaleString('en', { minimumFractionDigits: 2 })}</td>
                      <td className="right">₩{Number(q.totalKRW || 0).toLocaleString()}</td>
                      <td className="small">{String(q.createdAt || '').slice(0, 16)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      )}

      {view === 'trade' && (
        <div className="master-table-wrap">
          {tradeDocs.length === 0
            ? <div className="empty-state">거래명세서가 없습니다</div>
            : (
              <table className="master-table">
                <thead>
                  <tr><th>#</th><th>Doc No.</th><th>PO번호</th><th>SN</th><th>Shipping#</th><th>상태</th><th>생성일시</th></tr>
                </thead>
                <tbody>
                  {tradeDocs.map((d, i) => (
                    <tr key={d.id}>
                      <td>{i + 1}</td>
                      <td className="mono">{d.docNo}</td>
                      <td className="mono">{d.poNo}</td>
                      <td className="mono">{d.sn || '-'}</td>
                      <td className="mono">{d.shipping || '-'}</td>
                      <td>
                        <span className="status-badge" style={{ background: d.status === '검증PASS' ? '#22c55e' : '#3b82f6' }}>
                          {d.status || '-'}
                        </span>
                      </td>
                      <td className="small">{String(d.createdAt || '').slice(0, 16)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────
// 루트 PC App
// ──────────────────────────────────────────
export default function PCApp() {
  const [tab,       setTab]       = useState('kits')
  const [kits,      setKits]      = useState([])
  const [quotes,    setQuotes]    = useState([])
  const [tradeDocs, setTradeDocs] = useState([])
  const [config,    setConfig]    = useState({})
  const [rawKits,   setRawKits]   = useState([])
  const [rawQuotes, setRawQuotes] = useState([])
  const [rawTrade,  setRawTrade]  = useState([])
  const [loading,   setLoading]   = useState(false)
  const [err,       setErr]       = useState(null)

  const load = useCallback(async () => {
    if (!api.isConfigured()) return
    setLoading(true)
    setErr(null)
    try {
      const [kV, qV, tV, cfg] = await Promise.all([
        api.readSheet('KITS'),
        api.readSheet('QUOTES'),
        api.readSheet('TRADE_DOCS'),
        api.readConfig(),
      ])
      setRawKits(kV);  setKits(api.toObjects(kV))
      setRawQuotes(qV); setQuotes(api.toObjects(qV))
      setRawTrade(tV);  setTradeDocs(api.toObjects(tV))
      setConfig(cfg)
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="pc-root">
      <Header />

      {!api.isConfigured() && (
        <div className="api-setup-banner">
          <strong>설정 필요</strong> — GitHub Secret <code>VITE_APPS_SCRIPT_URL</code>을 추가하고 재배포하세요.
        </div>
      )}
      {loading && <div className="loading-bar">로딩중...</div>}
      {err && <div className="api-err-banner">오류: {err}</div>}

      <div className="pc-body">
        <Sidebar tab={tab} onTab={setTab} />
        <main className="pc-main">
          {tab === 'kits'   && <KitsTab   kits={kits}    rawKits={rawKits}   onSave={load} />}
          {tab === 'quote'  && <QuoteTab  kits={kits}    quotes={quotes}     config={config} rawQuotes={rawQuotes} onSave={load} />}
          {tab === 'trade'  && <TradeTab  quotes={quotes} tradeDocs={tradeDocs} rawTradeDocs={rawTrade} onSave={load} />}
          {tab === 'upload' && <UploadTab />}
          {tab === 'list'   && <ListTab   quotes={quotes} tradeDocs={tradeDocs} onRefresh={load} />}
        </main>
      </div>
    </div>
  )
}
