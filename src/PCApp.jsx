import { useState, useEffect, useRef, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import * as api from './api'
import UploadTab from './UploadTab'
import PartsTab from './PartsTab'
import './PCApp.css'

const APP_URL = 'https://hgpark27-alt.github.io/barcodeSS/'

// ── 시트 헤더 (Apps Script와 동일하게 유지)
const HDRS = {
  PARTS:      ['partNo', 'description', 'qtyThreshold', 'priceAsIs', 'priceToBe', 'cumulative', 'unit'],
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
  { id: 'parts',  label: '부품 관리' },
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
// 견적서 탭  (QUOTES 시트)
// QUOTES: id | quoteNo | poNo | kitId | items(JSON) | totalUSD | totalKRW | createdAt
// ──────────────────────────────────────────
function QuoteTab({ parts, ptnData, quotes, config, onSave }) {
  const [poNo,          setPoNo]          = useState('')
  const [selectedPartNo, setSelectedPartNo] = useState('')
  const [qty,           setQty]           = useState(1)
  const [exRate,        setExRate]        = useState(Number(config?.exchangeRate || 1350))
  const [msg,           setMsg]           = useState(null)
  const [loading,       setLoading]       = useState(false)
  const [done,          setDone]          = useState(null)

  const ptnEntry    = ptnData.find(p => p.poNo === poNo)
  const selectedPart = parts.find(p => p.partNo === selectedPartNo)

  // PTN에서 PO 선택 시 partNo 자동 매칭
  useEffect(() => {
    if (ptnEntry?.partNo) setSelectedPartNo(ptnEntry.partNo)
  }, [ptnEntry?.partNo])

  // 단가 계산
  const cum       = Number(selectedPart?.cumulative  || 0)
  const thr       = Number(selectedPart?.qtyThreshold || 0)
  const priceAsIs = Number(selectedPart?.priceAsIs   || 0)
  const priceToBe = Number(selectedPart?.priceToBe   || 0)

  let qtyAsIs = 0, qtyToBe = 0, totalUSD = 0
  if (selectedPart && qty > 0) {
    if (thr === 0 || cum >= thr) {
      qtyToBe = qty; totalUSD = qty * priceToBe
    } else if (cum + qty <= thr) {
      qtyAsIs = qty; totalUSD = qty * priceAsIs
    } else {
      qtyAsIs = thr - cum; qtyToBe = qty - qtyAsIs
      totalUSD = qtyAsIs * priceAsIs + qtyToBe * priceToBe
    }
  }
  const totalKRW = Math.round(totalUSD * exRate)

  const canSave = poNo.trim() && selectedPart && qty > 0 && totalUSD > 0

  const save = async () => {
    if (!canSave) return
    setLoading(true)
    try {
      const seq     = Number(config?.quoteSequence || 1)
      const quoteNo = `Q${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`
      const items   = JSON.stringify([{
        partNo:      selectedPart.partNo,
        description: selectedPart.description,
        qty, qtyAsIs, qtyToBe,
        priceAsIs, priceToBe, totalUSD,
        unit: selectedPart.unit || 'EA',
      }])
      const newQuote = {
        id:        uid(),
        quoteNo,
        poNo:      poNo.trim(),
        kitId:     '',
        items,
        totalUSD:  totalUSD.toFixed(2),
        totalKRW:  totalKRW.toString(),
        createdAt: now(),
      }
      await api.appendRow('QUOTES', HDRS.QUOTES.map(h => newQuote[h] ?? ''))

      // CONFIG quoteSequence 증가
      const cfgValues = await api.readSheet('CONFIG')
      await api.updateConfig('quoteSequence', seq + 1, cfgValues)

      // PARTS cumulative 업데이트
      const partsValues  = await api.readSheet('PARTS')
      const partsObjs    = api.toObjects(partsValues)
      const updatedParts = partsObjs.map(p =>
        p.partNo === selectedPart.partNo
          ? { ...p, cumulative: String(cum + qty) }
          : p
      )
      await api.writeSheet('PARTS', api.fromObjects(HDRS.PARTS, updatedParts))

      setDone(quoteNo)
      setMsg({ type: 'ok', text: `저장 완료: ${quoteNo}` })
      onSave()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    setLoading(false)
  }

  if (done) return (
    <div className="pc-tab-body">
      <div className="tab-title">견적서 생성</div>
      <div className="form-card">
        <div className="msg msg-ok">{msg?.text}</div>
        <div className="btn-row">
          <button className="btn-primary" onClick={() => {
            setDone(null); setPoNo(''); setSelectedPartNo(''); setQty(1); setMsg(null)
          }}>
            새 견적서
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="pc-tab-body">
      <div className="tab-title">견적서 생성</div>

      <div className="form-card">
        {/* PO 번호 */}
        <div className="form-row">
          <label>PO번호</label>
          <div style={{ display:'flex', gap:8, flex:1 }}>
            <input
              className="mono" style={{ flex:1 }}
              value={poNo} onChange={e => setPoNo(e.target.value)}
              placeholder="PO번호 직접 입력"
            />
            {ptnData.length > 0 && (
              <select
                value={poNo}
                onChange={e => setPoNo(e.target.value)}
                style={{ flexShrink:0, maxWidth:200 }}
              >
                <option value="">PTN에서 선택 ▾</option>
                {ptnData.map(p => (
                  <option key={p.poNo} value={p.poNo}>{p.poNo} · {p.partNo}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* 부품 선택 */}
        <div className="form-row">
          <label>부품 선택</label>
          <select value={selectedPartNo} onChange={e => setSelectedPartNo(e.target.value)}>
            <option value="">-- 부품 선택 --</option>
            {parts.map(p => (
              <option key={p.partNo} value={p.partNo}>{p.partNo} — {p.description}</option>
            ))}
          </select>
        </div>

        {/* 선택된 부품 정보 */}
        {selectedPart && (
          <div className="part-info-box">
            <div className="part-info-row">
              <span>As-is 단가</span>
              <strong>${Number(priceAsIs).toLocaleString('en', { minimumFractionDigits:2 })}</strong>
            </div>
            <div className="part-info-row">
              <span>To-be 단가</span>
              <strong>${Number(priceToBe).toLocaleString('en', { minimumFractionDigits:2 })}</strong>
            </div>
            <div className="part-info-row">
              <span>누적 사용</span>
              <strong className="mono">{cum} / {thr || '∞'}</strong>
              {thr > 0 && (
                <div className="cum-bar-wrap">
                  <div className="cum-bar" style={{ width: `${Math.min(100, thr > 0 ? (cum/thr)*100 : 0)}%` }} />
                </div>
              )}
            </div>
            <div className="part-info-row">
              <span>현재 적용 단가</span>
              <span className={`price-tier-badge ${thr === 0 || cum >= thr ? 'tobe' : 'asis'}`}>
                {thr === 0 || cum >= thr ? 'To-be' : 'As-is'}
              </span>
            </div>
          </div>
        )}

        {/* 수량 & 환율 */}
        <div className="form-row">
          <label>수량</label>
          <input type="number" min="1" value={qty}
            onChange={e => setQty(Math.max(1, Number(e.target.value)))} />
        </div>
        <div className="form-row">
          <label>환율 (₩/$)</label>
          <input type="number" value={exRate} onChange={e => setExRate(Number(e.target.value))} />
        </div>

        {/* 단가 분할 계산 결과 */}
        {selectedPart && qty > 0 && (
          <div className="price-breakdown-box">
            {qtyAsIs > 0 && (
              <div className="pb-row">
                <span className="price-tier-badge asis">As-is</span>
                <span className="mono">{qtyAsIs} {selectedPart.unit||'EA'} × ${priceAsIs.toLocaleString('en',{minimumFractionDigits:2})}</span>
                <span className="mono pb-total">${(qtyAsIs * priceAsIs).toLocaleString('en',{minimumFractionDigits:2})}</span>
              </div>
            )}
            {qtyToBe > 0 && (
              <div className="pb-row">
                <span className="price-tier-badge tobe">To-be</span>
                <span className="mono">{qtyToBe} {selectedPart.unit||'EA'} × ${priceToBe.toLocaleString('en',{minimumFractionDigits:2})}</span>
                <span className="mono pb-total">${(qtyToBe * priceToBe).toLocaleString('en',{minimumFractionDigits:2})}</span>
              </div>
            )}
            <div className="pb-total-row">
              <span>합계</span>
              <span className="mono">${totalUSD.toLocaleString('en',{minimumFractionDigits:2})}</span>
              <span className="mono" style={{color:'#64748b'}}>₩{totalKRW.toLocaleString()}</span>
            </div>
          </div>
        )}

        {msg && <div className={`msg msg-${msg.type}`}>{msg.text}</div>}

        <div className="btn-row">
          <button className="btn-primary" onClick={save} disabled={!canSave || loading}>
            {loading ? '저장중...' : '견적서 저장'}
          </button>
        </div>
      </div>
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
  const [tab,       setTab]       = useState('parts')
  const [parts,     setParts]     = useState([])
  const [ptnData,   setPtnData]   = useState([])
  const [quotes,    setQuotes]    = useState([])
  const [tradeDocs, setTradeDocs] = useState([])
  const [config,    setConfig]    = useState({})
  const [rawQuotes, setRawQuotes] = useState([])
  const [rawTrade,  setRawTrade]  = useState([])
  const [loading,   setLoading]   = useState(false)
  const [err,       setErr]       = useState(null)

  const load = useCallback(async () => {
    if (!api.isConfigured()) return
    setLoading(true)
    setErr(null)
    try {
      const [pV, qV, tV, cfg, ptnV] = await Promise.all([
        api.readSheet('PARTS'),
        api.readSheet('QUOTES'),
        api.readSheet('TRADE_DOCS'),
        api.readConfig(),
        api.readSheet('PTN'),
      ])
      setParts(api.toObjects(pV))
      setRawQuotes(qV); setQuotes(api.toObjects(qV))
      setRawTrade(tV);  setTradeDocs(api.toObjects(tV))
      setConfig(cfg)
      setPtnData(ptnV && ptnV.length > 0 ? api.toObjects(ptnV) : [])
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
          {tab === 'parts'  && <PartsTab  parts={parts}  onSave={load} />}
          {tab === 'quote'  && <QuoteTab  parts={parts}  ptnData={ptnData}  quotes={quotes} config={config} onSave={load} />}
          {tab === 'trade'  && <TradeTab  quotes={quotes} tradeDocs={tradeDocs} rawTradeDocs={rawTrade} onSave={load} />}
          {tab === 'upload' && <UploadTab />}
          {tab === 'list'   && <ListTab   quotes={quotes} tradeDocs={tradeDocs} onRefresh={load} />}
        </main>
      </div>
    </div>
  )
}
