import { useState, useRef } from 'react'
import * as api from './api'

const PTN_HDRS = ['poNo', 'pkgId', 'partNo']

// PTN PDF 한 파일 파싱 → [{ poNo, pkgId, partNo }]
async function parsePtnPdf(file, pdfjsLib) {
  const buf = await file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise
  const results = []

  for (let p = 1; p <= doc.numPages; p++) {
    const page    = await doc.getPage(p)
    const content = await page.getTextContent()
    const strs    = content.items.map(it => it.str).filter(s => s && s.trim())

    let poNo = null, pkgId = null, partNo = null
    for (let i = 0; i < strs.length; i++) {
      if (strs[i].includes('(3S) PKG ID:'))       pkgId  = strs[i + 1]?.trim() || null
      if (strs[i].includes('(K) AMAT ORDER NO:')) poNo   = (strs[i + 1]?.trim() || '').split(' + ')[0].trim() || null
      if (strs[i].includes('(P) AMAT PART NO:'))  partNo = strs[i + 1]?.trim() || null
    }

    if (poNo && pkgId) {
      results.push({ poNo, pkgId, partNo: partNo || '-' })
    }
  }
  return results
}

export default function UploadTab() {
  const [rows,       setRows]       = useState([])   // 파싱 결과
  const [status,     setStatus]     = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [saveResult, setSaveResult] = useState(null) // { added, skipped }
  const fileRef = useRef()
  const dropRef = useRef()

  // ── PDF 파일 파싱
  async function handleFiles(files) {
    if (!files.length) return
    setLoading(true)
    setStatus({ type: 'info', text: `${files.length}개 파일 파싱 중...` })
    setRows([])
    setSaveResult(null)

    try {
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url
      ).href

      const all = []
      for (const file of files) {
        all.push(...await parsePtnPdf(file, pdfjsLib))
      }

      // 이번 업로드 내 중복 제거 (마지막 것 기준)
      const map = new Map()
      for (const r of all) map.set(r.poNo, r)
      const deduped = [...map.values()]

      setRows(deduped)
      setStatus({ type: 'ok', text: `${deduped.length}건 파싱 완료` })
    } catch (e) {
      setStatus({ type: 'error', text: `파싱 오류: ${e.message}` })
    }
    setLoading(false)
  }

  // ── PTN 시트에 저장 (중복 PO 스킵)
  async function handleSave() {
    setLoading(true)
    setSaveResult(null)
    try {
      // 기존 PTN 데이터 읽기
      const existing = await api.readSheet('PTN')
      const existingObjs = api.toObjects(existing)
      const existingPoSet = new Set(existingObjs.map(r => r.poNo))

      // 신규만 필터
      const newRows = rows.filter(r => !existingPoSet.has(r.poNo))
      const skipped = rows.length - newRows.length

      if (newRows.length === 0) {
        setStatus({ type: 'info', text: `전부 중복 — 추가된 데이터 없음 (${skipped}건 스킵)` })
        setSaveResult({ added: 0, skipped })
        setLoading(false)
        return
      }

      // 기존 + 신규 합쳐서 전체 write
      const merged = [...existingObjs, ...newRows]
      await api.writeSheet('PTN', api.fromObjects(PTN_HDRS, merged))

      setSaveResult({ added: newRows.length, skipped })
      setStatus({ type: 'ok', text: `${newRows.length}건 저장 완료 / ${skipped}건 중복 스킵` })
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

  return (
    <div className="pc-tab-body">
      <div className="tab-title">PTN 라벨 업로드</div>

      <div
        ref={dropRef}
        className="upload-dropzone"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
      >
        <div className="upload-icon">↑</div>
        <div className="upload-hint">PDF 파일을 드래그하거나 클릭하여 선택</div>
        <div className="upload-hint-sub">여러 파일 동시 가능 · 각 페이지에서 PO / PKG ID / Part No. 추출</div>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          multiple
          style={{ display: 'none' }}
          onChange={e => handleFiles([...e.target.files])}
        />
      </div>

      {status && <div className={`msg msg-${status.type}`}>{status.text}</div>}

      {rows.length > 0 && (
        <>
          <div className="master-table-wrap">
            <table className="master-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>PO번호</th>
                  <th>PKG ID (Shipping#)</th>
                  <th>Part No.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.poNo}>
                    <td>{i + 1}</td>
                    <td className="mono">{r.poNo}</td>
                    <td className="mono upload-shipping">{r.pkgId}</td>
                    <td className="mono">{r.partNo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!saveResult && (
            <div className="btn-row">
              <button className="btn-primary" onClick={handleSave} disabled={loading}>
                {loading ? '저장중...' : `PTN 시트에 저장 (${rows.length}건)`}
              </button>
            </div>
          )}

          {saveResult && (
            <div className="btn-row">
              <button className="btn-secondary" onClick={() => { setRows([]); setStatus(null); setSaveResult(null) }}>
                새 파일 업로드
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
