import { useState, useRef } from 'react'
import * as api from './api'

const HDRS_TRADE = ['id', 'docNo', 'poNo', 'quoteId', 'sn', 'shipping', 'barcodeVal', 'status', 'createdAt']

// PTN PDF 한 파일 파싱 → [{ poNo, shipping, partNo, fileName, page }]
async function parsePtnPdf(file, pdfjsLib) {
  const buf = await file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise
  const results = []

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const strs = content.items.map(it => it.str).filter(s => s && s.trim())

    let poNo = null, shipping = null, partNo = null
    for (let i = 0; i < strs.length; i++) {
      if (strs[i].includes('(3S) PKG ID:'))        shipping = strs[i + 1]?.trim() || null
      if (strs[i].includes('(K) AMAT ORDER NO:'))  poNo     = (strs[i + 1]?.trim() || '').split(' + ')[0].trim() || null
      if (strs[i].includes('(P) AMAT PART NO:'))   partNo   = strs[i + 1]?.trim() || null
    }

    if (poNo && shipping) {
      results.push({ poNo, shipping, partNo: partNo || '-', fileName: file.name, page: p })
    }
  }
  return results
}

export default function UploadTab({ tradeDocs, rawTrade, onApply }) {
  const [rows,    setRows]    = useState([])   // [{ poNo, shipping, partNo, fileName, page, matched }]
  const [status,  setStatus]  = useState(null) // { type: 'ok'|'error'|'info', text }
  const [loading, setLoading] = useState(false)
  const [applied, setApplied] = useState(false)
  const fileRef = useRef()
  const dropRef = useRef()

  // ── PDF 파일 읽기 & 파싱
  async function handleFiles(files) {
    if (!files.length) return
    setLoading(true)
    setStatus({ type: 'info', text: `${files.length}개 파일 파싱 중...` })
    setRows([])
    setApplied(false)

    try {
      const pdfjsLib = await import('pdfjs-dist')
      const workerUrl = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).href
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

      const all = []
      for (const file of files) {
        const parsed = await parsePtnPdf(file, pdfjsLib)
        all.push(...parsed)
      }

      // 중복 제거 (같은 PO 여러 파일에 걸쳐 있을 때 마지막 것 우선)
      const dedupMap = new Map()
      for (const r of all) dedupMap.set(r.poNo, r)
      const deduped = [...dedupMap.values()]

      // TRADE_DOCS 매칭 여부 표시
      const marked = deduped.map(r => ({
        ...r,
        matched: tradeDocs.some(d => d.poNo === r.poNo),
      }))

      setRows(marked)
      const matchedCount = marked.filter(r => r.matched).length
      setStatus({
        type: matchedCount > 0 ? 'ok' : 'info',
        text: `${deduped.length}건 파싱 완료 — TRADE_DOCS 매칭 ${matchedCount}건`,
      })
    } catch (e) {
      setStatus({ type: 'error', text: `파싱 오류: ${e.message}` })
    }
    setLoading(false)
  }

  // ── TRADE_DOCS shipping 필드 일괄 업데이트
  async function applyToTradeDocs() {
    const matched = rows.filter(r => r.matched)
    if (!matched.length) return

    setLoading(true)
    try {
      const hdrs = rawTrade[0] || HDRS_TRADE
      const shippingIdx = hdrs.indexOf('shipping')
      const poNoIdx     = hdrs.indexOf('poNo')

      const updated = rawTrade.map((row, i) => {
        if (i === 0) return row
        const rowPo = row[poNoIdx]
        const m = matched.find(r => r.poNo === rowPo)
        if (m) {
          const newRow = [...row]
          newRow[shippingIdx] = m.shipping
          return newRow
        }
        return row
      })

      await api.writeSheet('TRADE_DOCS', updated)
      setApplied(true)
      setStatus({ type: 'ok', text: `Shipping# ${matched.length}건 TRADE_DOCS에 저장됨` })
      onApply(updated)
    } catch (e) {
      setStatus({ type: 'error', text: e.message })
    }
    setLoading(false)
  }

  // ── 드래그 앤 드롭
  function onDragOver(e) { e.preventDefault(); dropRef.current?.classList.add('drag-over') }
  function onDragLeave()  { dropRef.current?.classList.remove('drag-over') }
  function onDrop(e) {
    e.preventDefault()
    dropRef.current?.classList.remove('drag-over')
    const files = [...e.dataTransfer.files].filter(f => f.type === 'application/pdf')
    handleFiles(files)
  }

  const matchedCount = rows.filter(r => r.matched).length

  return (
    <div className="pc-tab-body">
      <div className="tab-title-row">
        <div className="tab-title">PTN 라벨 업로드</div>
        <span className="tab-sub">PDF에서 PO ↔ Shipping# 추출 → TRADE_DOCS 자동 업데이트</span>
      </div>

      {/* 드롭존 */}
      <div
        ref={dropRef}
        className="upload-dropzone"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
      >
        <div className="upload-icon">↑</div>
        <div className="upload-hint">PDF 파일을 여기에 드래그하거나 클릭하여 선택</div>
        <div className="upload-hint-sub">여러 파일 동시 선택 가능 · 각 페이지에서 PO & Shipping# 자동 추출</div>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          multiple
          style={{ display: 'none' }}
          onChange={e => handleFiles([...e.target.files])}
        />
      </div>

      {/* 상태 메시지 */}
      {status && <div className={`msg msg-${status.type}`}>{status.text}</div>}

      {/* 파싱 결과 테이블 */}
      {rows.length > 0 && (
        <>
          <div className="master-table-wrap">
            <table className="master-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>PO번호</th>
                  <th>Shipping# (PKG ID)</th>
                  <th>Part No.</th>
                  <th>파일</th>
                  <th>P</th>
                  <th>매칭</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.poNo} className={r.matched ? '' : 'row-unmatched'}>
                    <td>{i + 1}</td>
                    <td className="mono">{r.poNo}</td>
                    <td className="mono upload-shipping">{r.shipping}</td>
                    <td className="mono small">{r.partNo}</td>
                    <td className="small">{r.fileName}</td>
                    <td className="small">{r.page}</td>
                    <td>
                      {r.matched
                        ? <span className="match-badge match-ok">매칭</span>
                        : <span className="match-badge match-no">미매칭</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {matchedCount > 0 && !applied && (
            <div className="btn-row">
              <button
                className="btn-primary"
                onClick={applyToTradeDocs}
                disabled={loading}
              >
                {loading ? '저장중...' : `TRADE_DOCS Shipping# 업데이트 (${matchedCount}건)`}
              </button>
            </div>
          )}

          {applied && (
            <div className="btn-row">
              <button className="btn-secondary" onClick={() => { setRows([]); setStatus(null); setApplied(false) }}>
                새 파일 업로드
              </button>
            </div>
          )}

          {rows.some(r => !r.matched) && (
            <div className="upload-warn">
              미매칭 {rows.filter(r => !r.matched).length}건 — TRADE_DOCS에 해당 PO 거래명세서가 없습니다.
              먼저 거래명세서 탭에서 해당 PO로 거래명세서를 생성하세요.
            </div>
          )}
        </>
      )}
    </div>
  )
}
