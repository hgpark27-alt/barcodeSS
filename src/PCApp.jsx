import { useState, useEffect, useRef, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { api } from './api'
import './PCApp.css'

const APP_URL = 'https://hgpark27-alt.github.io/barcodeSS/'
const STATUS_COLOR = {
  '견적완료': '#f59e0b',
  '거명완료': '#3b82f6',
  'PTN완료':  '#8b5cf6',
  '검증PASS': '#22c55e',
}

// ──────────────────────────────────────────
// 상단 공통 헤더
// ──────────────────────────────────────────
function Header({ tab, onTab }) {
  const tabs = [
    { id: 'quotation', label: '① 견적서' },
    { id: 'invoice',   label: '② 거래명세서' },
    { id: 'ptn',       label: '③ PTN' },
    { id: 'list',      label: '목록' },
  ]
  return (
    <header className="pc-hdr">
      <div className="pc-hdr-brand">
        <svg width="28" height="18" viewBox="0 0 28 18" fill="none" style={{marginRight:8}}>
          <rect x="0" y="0" width="3" height="18" fill="#2563eb" rx="1"/>
          <rect x="5" y="3" width="2" height="12" fill="#2563eb" rx="1"/>
          <rect x="9" y="0" width="4" height="18" fill="#2563eb" rx="1"/>
          <rect x="15" y="3" width="2" height="12" fill="#2563eb" rx="1"/>
          <rect x="19" y="0" width="3" height="18" fill="#2563eb" rx="1"/>
          <rect x="24" y="3" width="4" height="12" fill="#2563eb" rx="1"/>
        </svg>
        씰마스터
      </div>
      <nav className="pc-hdr-nav">
        {tabs.map(t => (
          <button key={t.id}
            className={`pc-nav-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => onTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="pc-hdr-qr">
        <QRCodeSVG value={APP_URL} size={40} />
        <span className="pc-hdr-qr-label">모바일</span>
      </div>
    </header>
  )
}

// ──────────────────────────────────────────
// 견적서 탭
// ──────────────────────────────────────────
function QuotationTab({ onSaved }) {
  const [mode, setMode]     = useState('form')  // 'form' | 'paste'
  const [form, setForm]     = useState({ po: '', sjbun: '', sn: '', price: '' })
  const [paste, setPaste]   = useState('')
  const [parsed, setParsed] = useState([])
  const [msg, setMsg]       = useState(null)
  const [loading, setLoading] = useState(false)

  const f = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }))

  const saveForm = async () => {
    if (!form.po) { setMsg({ type: 'error', text: 'PO번호를 입력하세요.' }); return }
    setLoading(true)
    try {
      const res = await api.addQuotation({ po: form.po.trim(), sjbun: form.sjbun.trim(), sn: form.sn.trim(), price: form.price })
      if (res.error) setMsg({ type: 'error', text: res.error })
      else { setMsg({ type: 'ok', text: `저장 완료: ${form.po}` }); setForm({ po: '', sjbun: '', sn: '', price: '' }); onSaved?.() }
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    setLoading(false)
  }

  const parsePaste = () => {
    const lines = paste.trim().split('\n').filter(l => l.trim())
    if (!lines.length) return
    const rows = lines.map(l => l.split('\t').map(c => c.trim()))
    // 헤더 자동감지: PO, 0247, SN, Price 포함 여부 확인
    const firstRow = rows[0].map(c => c.toLowerCase())
    let startIdx = 0
    let colPO = -1, colSJ = -1, colSN = -1, colPrice = -1

    // 헤더행 감지
    if (firstRow.some(c => c.includes('po') || c.includes('0247') || c.includes('sn') || c.includes('price'))) {
      startIdx = 1
      firstRow.forEach((c, i) => {
        if (c.includes('po') && colPO === -1)    colPO    = i
        if ((c.includes('0247') || c.includes('수주') || c.includes('주번')) && colSJ === -1) colSJ = i
        if (c === 'sn' && colSN === -1)          colSN    = i
        if (c.includes('price') || c.includes('usd')) colPrice = i
      })
    }

    // 기본 컬럼 순서 (PO | 0247# | SN | Price)
    if (colPO === -1)    colPO    = 0
    if (colSJ === -1)    colSJ    = 1
    if (colSN === -1)    colSN    = 2
    if (colPrice === -1) colPrice = 3

    const items = rows.slice(startIdx).map(r => ({
      po:    r[colPO]    || '',
      sjbun: r[colSJ]    || '',
      sn:    r[colSN]    || '',
      price: r[colPrice] || '',
    })).filter(r => r.po)

    setParsed(items)
  }

  const savePaste = async () => {
    if (!parsed.length) return
    setLoading(true)
    let ok = 0, fail = 0
    for (const item of parsed) {
      try {
        const res = await api.addQuotation(item)
        if (res.error) fail++
        else ok++
      } catch { fail++ }
    }
    setMsg({ type: ok > 0 ? 'ok' : 'error', text: `저장: ${ok}건 성공, ${fail}건 실패` })
    if (ok > 0) { setParsed([]); setPaste(''); onSaved?.() }
    setLoading(false)
  }

  return (
    <div className="pc-tab-body">
      <div className="tab-title">견적서 등록</div>

      <div className="mode-toggle">
        <button className={mode === 'form' ? 'active' : ''} onClick={() => setMode('form')}>개별 입력</button>
        <button className={mode === 'paste' ? 'active' : ''} onClick={() => setMode('paste')}>엑셀 붙여넣기</button>
      </div>

      {msg && (
        <div className={`msg msg-${msg.type}`}>{msg.text}
          <button className="msg-close" onClick={() => setMsg(null)}>×</button>
        </div>
      )}

      {mode === 'form' && (
        <div className="form-card">
          <div className="form-row">
            <label>PO번호 <span className="req">*</span></label>
            <input value={form.po} onChange={f('po')} placeholder="PO25033100083" className="mono" />
          </div>
          <div className="form-row">
            <label>수주번호(0247#)</label>
            <input value={form.sjbun} onChange={f('sjbun')} placeholder="0247-XXXX" className="mono" />
          </div>
          <div className="form-row">
            <label>SN (선택)</label>
            <input value={form.sn} onChange={f('sn')} placeholder="나중에 입력 가능" className="mono" />
          </div>
          <div className="form-row">
            <label>Price (USD)</label>
            <input value={form.price} onChange={f('price')} placeholder="1234.56" type="number" step="0.01" />
          </div>
          <button className="btn-primary" onClick={saveForm} disabled={loading}>
            {loading ? '저장중...' : '저장'}
          </button>
        </div>
      )}

      {mode === 'paste' && (
        <div className="form-card">
          <p className="hint">엑셀에서 복사 후 붙여넣기. 컬럼 순서: <b>PO번호 | 수주번호(0247#) | SN | Price_USD</b><br />
            헤더행(첫 줄)이 있으면 자동 감지합니다.</p>
          <textarea
            className="paste-area"
            placeholder="엑셀 셀 복사 후 Ctrl+V"
            value={paste}
            onChange={e => { setPaste(e.target.value); setParsed([]) }}
            rows={6}
          />
          <div className="btn-row">
            <button className="btn-secondary" onClick={parsePaste} disabled={!paste.trim()}>파싱 확인</button>
            {parsed.length > 0 && (
              <button className="btn-primary" onClick={savePaste} disabled={loading}>
                {loading ? '저장중...' : `${parsed.length}건 저장`}
              </button>
            )}
          </div>

          {parsed.length > 0 && (
            <div className="preview-table-wrap">
              <table className="preview-table">
                <thead>
                  <tr><th>#</th><th>PO번호</th><th>0247#</th><th>SN</th><th>Price USD</th></tr>
                </thead>
                <tbody>
                  {parsed.map((r, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td className="mono">{r.po}</td>
                      <td className="mono">{r.sjbun || '-'}</td>
                      <td className="mono">{r.sn || '-'}</td>
                      <td className="right">{r.price || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────
// 거래명세서 탭
// ──────────────────────────────────────────
function InvoiceTab({ masterList, onUpdated }) {
  const [selected, setSelected] = useState(null)
  const [sn, setSn]             = useState('')
  const [msg, setMsg]           = useState(null)
  const [loading, setLoading]   = useState(false)
  const barcodeRef = useRef(null)

  // JsBarcode를 dynamic import로 로드
  useEffect(() => {
    if (!selected) return
    const po = selected['PO번호'] || ''
    if (!po || !barcodeRef.current) return

    import('jsbarcode').then(({ default: JsBarcode }) => {
      try {
        JsBarcode(barcodeRef.current, 'GM:' + po, {
          format:       'CODE128',
          displayValue: true,
          fontSize:     14,
          height:       80,
          margin:       10,
          background:   '#ffffff',
          lineColor:    '#000000',
        })
      } catch {}
    })
  }, [selected])

  const handleSelect = (po) => {
    const rec = masterList.find(r => r['PO번호'] === po)
    setSelected(rec || null)
    setSn(rec?.['SN'] || '')
    setMsg(null)
  }

  const saveSN = async () => {
    if (!selected || !sn.trim()) { setMsg({ type: 'error', text: 'SN을 입력하세요.' }); return }
    setLoading(true)
    try {
      const res = await api.updateSN(selected['PO번호'], sn.trim())
      if (res.error) setMsg({ type: 'error', text: res.error })
      else { setMsg({ type: 'ok', text: 'SN 저장됨 (상태: 거명완료)' }); onUpdated?.() }
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    setLoading(false)
  }

  const handlePrint = () => window.print()

  return (
    <div className="pc-tab-body">
      <div className="tab-title">거래명세서 생성 · 인쇄</div>

      <div className="form-card no-print">
        <div className="form-row">
          <label>PO 선택</label>
          <select onChange={e => handleSelect(e.target.value)} defaultValue="">
            <option value="" disabled>-- PO 선택 --</option>
            {masterList.map(r => (
              <option key={r['PO번호']} value={r['PO번호']}>
                {r['PO번호']} {r['0247#'] ? `(${r['0247#']})` : ''} [{r['상태'] || ''}]
              </option>
            ))}
          </select>
        </div>

        {selected && (
          <>
            <div className="form-row">
              <label>SN <span className="req">*</span></label>
              <input value={sn} onChange={e => setSn(e.target.value)} placeholder="시리얼 넘버" className="mono" />
            </div>
            {msg && <div className={`msg msg-${msg.type}`}>{msg.text}</div>}
            <div className="btn-row">
              <button className="btn-secondary" onClick={saveSN} disabled={loading}>
                {loading ? '저장중...' : 'SN 저장'}
              </button>
              <button className="btn-primary" onClick={handlePrint}>인쇄</button>
            </div>
          </>
        )}
      </div>

      {/* ── 거래명세서 인쇄 영역 ── */}
      {selected && (
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
            <div className="info-item">
              <span className="info-label">PO번호</span>
              <span className="info-value mono">{selected['PO번호']}</span>
            </div>
            <div className="info-item">
              <span className="info-label">수주번호</span>
              <span className="info-value mono">{selected['0247#'] || '-'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">S/N</span>
              <span className="info-value mono">{sn || selected['SN'] || '-'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Price (USD)</span>
              <span className="info-value">
                {selected['Price_USD'] ? `$ ${Number(selected['Price_USD']).toLocaleString('en', { minimumFractionDigits: 2 })}` : '-'}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">Shipping#</span>
              <span className="info-value mono">{selected['Shipping#'] || '미입력'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">상태</span>
              <span className="info-value">
                <span className="status-badge" style={{ background: STATUS_COLOR[selected['상태']] || '#6b7280' }}>
                  {selected['상태'] || '-'}
                </span>
              </span>
            </div>
          </div>

          <div className="invoice-barcode-section">
            <div className="barcode-label">PO 바코드 (거래명세서 검증용)</div>
            <svg ref={barcodeRef} />
            <div className="barcode-hint">모바일 스캐너에서 이 바코드를 먼저 스캔하세요</div>
          </div>

          <div className="invoice-footer">
            <div className="footer-note">
              이 거래명세서는 씰마스터 시스템에서 자동 생성되었습니다.<br />
              검증: 거래명세서BC → PTN BC → 제품SN BC 순서로 스캔
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
// PTN 탭
// ──────────────────────────────────────────
function PTNTab({ masterList, onUpdated }) {
  const [selected,  setSelected]  = useState(null)
  const [shipping,  setShipping]  = useState('')
  const [pdfText,   setPdfText]   = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [msg,       setMsg]       = useState(null)
  const [loading,   setLoading]   = useState(false)

  const handleSelect = (po) => {
    const rec = masterList.find(r => r['PO번호'] === po)
    setSelected(rec || null)
    setShipping(rec?.['Shipping#'] || '')
    setMsg(null)
  }

  const handlePDF = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPdfLoading(true)
    setPdfText('')
    try {
      const pdfjsLib = await import('pdfjs-dist')
      const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default

      const buf  = await file.arrayBuffer()
      const pdf  = await pdfjsLib.getDocument({ data: buf }).promise
      let text   = ''
      for (let i = 1; i <= pdf.numPages; i++) {
        const page    = await pdf.getPage(i)
        const content = await page.getTextContent()
        text += content.items.map(item => item.str).join(' ') + '\n'
      }
      setPdfText(text)

      // Shipping# 자동 감지: "Ship" 뒤 단어, 또는 1~3자리 숫자+슬래시+숫자 패턴
      const shipMatch = text.match(/[Ss]hip(?:ping)?[\s#:]*([A-Z0-9\-]{4,20})/i)
      if (shipMatch) setShipping(shipMatch[1])
    } catch (e) {
      setMsg({ type: 'error', text: 'PDF 읽기 실패: ' + e.message })
    }
    setPdfLoading(false)
  }

  const save = async () => {
    if (!selected) { setMsg({ type: 'error', text: 'PO를 선택하세요.' }); return }
    if (!shipping.trim()) { setMsg({ type: 'error', text: 'Shipping#를 입력하세요.' }); return }
    setLoading(true)
    try {
      const res = await api.updateShipping(selected['PO번호'], shipping.trim())
      if (res.error) setMsg({ type: 'error', text: res.error })
      else { setMsg({ type: 'ok', text: 'Shipping# 저장됨 (상태: PTN완료)' }); onUpdated?.() }
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    setLoading(false)
  }

  return (
    <div className="pc-tab-body">
      <div className="tab-title">PTN — Shipping# 입력</div>

      <div className="form-card">
        <div className="form-row">
          <label>PO 선택</label>
          <select onChange={e => handleSelect(e.target.value)} defaultValue="">
            <option value="" disabled>-- PO 선택 --</option>
            {masterList.filter(r => !r['Shipping#']).map(r => (
              <option key={r['PO번호']} value={r['PO번호']}>
                {r['PO번호']} [{r['상태'] || ''}]
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label>PTN PDF 업로드 <span className="hint-text">(선택)</span></label>
          <input type="file" accept=".pdf" onChange={handlePDF} />
        </div>

        {pdfLoading && <div className="msg msg-info">PDF 분석중...</div>}

        {pdfText && (
          <div className="ptn-extracted">
            <div className="ptn-label">추출된 텍스트 (첫 500자)</div>
            <pre className="ptn-text">{pdfText.slice(0, 500)}</pre>
          </div>
        )}

        <div className="form-row">
          <label>Shipping# <span className="req">*</span></label>
          <input
            value={shipping}
            onChange={e => setShipping(e.target.value)}
            placeholder="PDF에서 자동감지 또는 직접 입력"
            className="mono"
          />
        </div>

        {msg && <div className={`msg msg-${msg.type}`}>{msg.text}</div>}

        <button className="btn-primary" onClick={save} disabled={loading || !selected || !shipping.trim()}>
          {loading ? '저장중...' : 'Shipping# 저장'}
        </button>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────
// 마스터 목록 탭
// ──────────────────────────────────────────
function MasterListTab({ masterList, onRefresh }) {
  const [filter, setFilter] = useState('')

  const filtered = filter
    ? masterList.filter(r =>
        Object.values(r).some(v => String(v).toLowerCase().includes(filter.toLowerCase()))
      )
    : masterList

  return (
    <div className="pc-tab-body">
      <div className="tab-title-row">
        <div className="tab-title">마스터 목록 ({masterList.length}건)</div>
        <div className="list-actions">
          <input
            className="filter-input"
            placeholder="검색..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
          <button className="btn-icon" onClick={onRefresh} title="새로고침">↺</button>
        </div>
      </div>

      {filtered.length === 0
        ? <div className="empty-state">데이터가 없습니다.</div>
        : (
          <div className="master-table-wrap">
            <table className="master-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>PO번호</th>
                  <th>0247#</th>
                  <th>SN</th>
                  <th>Price USD</th>
                  <th>Shipping#</th>
                  <th>상태</th>
                  <th>생성일시</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td className="mono">{r['PO번호']}</td>
                    <td className="mono">{r['0247#'] || '-'}</td>
                    <td className="mono">{r['SN'] || '-'}</td>
                    <td className="right">{r['Price_USD'] ? `$${Number(r['Price_USD']).toLocaleString('en', { minimumFractionDigits: 2 })}` : '-'}</td>
                    <td className="mono">{r['Shipping#'] || '-'}</td>
                    <td>
                      <span className="status-badge"
                        style={{ background: STATUS_COLOR[r['상태']] || '#6b7280' }}>
                        {r['상태'] || '-'}
                      </span>
                    </td>
                    <td className="small">{r['생성일시'] ? String(r['생성일시']).slice(0, 16) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    </div>
  )
}

// ──────────────────────────────────────────
// 루트 PC App
// ──────────────────────────────────────────
export default function PCApp() {
  const [tab, setTab]           = useState('quotation')
  const [masterList, setMasterList] = useState([])
  const [apiErr, setApiErr]     = useState(null)

  const loadMaster = useCallback(() => {
    if (!api.isConfigured()) return
    api.getMasterList()
      .then(data => { if (Array.isArray(data)) setMasterList(data) })
      .catch(e => setApiErr(e.message))
  }, [])

  useEffect(() => { loadMaster() }, [loadMaster])

  return (
    <div className="pc-root">
      <Header tab={tab} onTab={setTab} />

      {!api.isConfigured() && (
        <div className="api-setup-banner">
          <strong>설정 필요</strong> — Google Apps Script URL이 없습니다.
          <code>.env.local</code> 파일에 <code>VITE_APPS_SCRIPT_URL=https://...</code> 를 추가하고 재빌드 하세요.
          <a href="https://github.com/hgpark27-alt/barcodeSS#readme" target="_blank" rel="noreferrer">설정 가이드</a>
        </div>
      )}

      {apiErr && (
        <div className="api-err-banner">API 오류: {apiErr}</div>
      )}

      <main className="pc-main">
        {tab === 'quotation' && <QuotationTab onSaved={loadMaster} />}
        {tab === 'invoice'   && <InvoiceTab   masterList={masterList} onUpdated={loadMaster} />}
        {tab === 'ptn'       && <PTNTab        masterList={masterList} onUpdated={loadMaster} />}
        {tab === 'list'      && <MasterListTab masterList={masterList} onRefresh={loadMaster} />}
      </main>
    </div>
  )
}
