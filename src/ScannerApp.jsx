import { useState, useEffect, useRef, useCallback } from 'react'
import { readBarcodesFromImageData, setZXingModuleOverrides } from 'zxing-wasm/reader'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import * as api from './api'
import './App.css'

setZXingModuleOverrides({ locateFile: (p) => p.endsWith('.wasm') ? wasmUrl : p })

const FORMATS = ['Code128', 'Code39', 'DataMatrix', 'EAN13', 'EAN8', 'UPCA', 'UPCE', 'ITF', 'Codabar']

function parseLabel(raw) {
  const s = raw.replace(/[\x00-\x1f␀-␟]/g, '')
  const pIdx = s.indexOf('P')
  const sIdx = s.indexOf('S', pIdx + 1)
  const tIdx = s.indexOf('1T', sIdx + 1)
  const lIdx = s.indexOf('4LK', tIdx + 1)
  const pn = pIdx >= 0 && sIdx > pIdx ? s.slice(pIdx + 1, sIdx) : ''
  const sn = sIdx >= 0 && tIdx > sIdx ? s.slice(sIdx + 1, tIdx) : ''
  const so = tIdx >= 0 && lIdx > tIdx ? s.slice(tIdx + 2, lIdx) : ''
  return { pn, sn, so }
}

function detectType(raw) {
  const clean = raw.replace(/[\x00-\x1f␀-␟]/g, '')

  if (clean.startsWith('GM:')) {
    return { type: 'gc', po: clean.slice(3), raw: clean }
  }

  const p = parseLabel(raw)
  if (p.sn && p.pn) {
    return { type: 'sn', ...p, raw: clean }
  }

  return { type: 'ptn', raw: clean }
}

const EMPTY_SESSION = { gc: null, ptn: null, sn: null }

const STATUS_LABEL = { gc: '거명BC', ptn: 'PTN BC', sn: 'SN BC' }

export default function ScannerApp() {
  const [scanning, setScanning]   = useState(false)
  const [tab, setTab]             = useState('scan')
  const [passItems, setPassItems] = useState([])
  const [error, setError]         = useState(null)
  const [masterData, setMasterData] = useState([])
  const [session, setSession]     = useState(EMPTY_SESSION)
  const [passResult, setPassResult] = useState(null) // { ok, po, msg }

  const videoRef   = useRef(null)
  const canvasRef  = useRef(null)
  const logRef     = useRef(null)
  const flashRef   = useRef(null)
  const sessionRef = useRef(EMPTY_SESSION)
  const masterRef  = useRef([])

  // TRADE_DOCS 로드 (거래명세서 목록 — PO·SN·Shipping# 검증용)
  useEffect(() => {
    if (!api.isConfigured()) return
    api.readSheet('TRADE_DOCS')
      .then(values => {
        const rows = api.toObjects(values)
        setMasterData(rows)
        masterRef.current = rows
      })
      .catch(() => {})
  }, [])

  const dbgLog = (msg) => { if (logRef.current) logRef.current.textContent = msg }

  const beep = (freq, dur = 0.12, type = 'sine', vol = 0.4) => {
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)()
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = type; osc.frequency.value = freq
      gain.gain.setValueAtTime(vol, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
      osc.start(); osc.stop(ctx.currentTime + dur)
    } catch {}
  }

  const triggerScanFeedback = () => {
    navigator.vibrate?.(60)
    beep(880, 0.08)
    const el = flashRef.current
    if (el) { el.classList.remove('flash-active'); void el.offsetWidth; el.classList.add('flash-active') }
  }

  const triggerPassFeedback = () => {
    navigator.vibrate?.([80, 40, 80, 40, 160])
    ;[880, 1046, 1318].forEach((f, i) => setTimeout(() => beep(f, 0.15), i * 140))
    const el = flashRef.current
    if (el) { el.classList.remove('flash-active', 'flash-pass', 'flash-fail'); void el.offsetWidth; el.classList.add('flash-active', 'flash-pass') }
  }

  const triggerFailFeedback = () => {
    navigator.vibrate?.([200, 80, 200])
    beep(220, 0.35, 'sawtooth', 0.3)
    const el = flashRef.current
    if (el) { el.classList.remove('flash-active', 'flash-pass', 'flash-fail'); void el.offsetWidth; el.classList.add('flash-active', 'flash-fail') }
  }

  const resetSession = useCallback(() => {
    sessionRef.current = EMPTY_SESSION
    setSession(EMPTY_SESSION)
  }, [])

  const checkPass = useCallback(async (sess) => {
    const { gc, ptn, sn } = sess
    const master = masterRef.current

    // 마스터 미설정이면 PO만 맞으면 PASS (관대 모드)
    if (master.length === 0) {
      triggerPassFeedback()
      setPassResult({ ok: true, po: gc.po, msg: '마스터 미연동 — 스캔 완료' })
      setPassItems(prev => [{
        po: gc.po, sjbun: '', sn: sn.sn || '', shipping: ptn.raw,
        passedAt: new Date().toLocaleString('ko-KR')
      }, ...prev])
      resetSession()
      setTimeout(() => setPassResult(null), 3000)
      return
    }

    // TRADE_DOCS에서 거래명세서 BC(PO)로 레코드 찾기
    const record = master.find(r => String(r['poNo'] || r['barcodeVal'] || '').includes(gc.po))
    if (!record) {
      triggerFailFeedback()
      setPassResult({ ok: false, po: gc.po, msg: `PO '${gc.po}' 거래명세서에 없음` })
      dbgLog(`FAIL: PO '${gc.po}' 없음`)
      setTimeout(() => setPassResult(null), 4000)
      resetSession()
      return
    }

    const masterSN       = String(record['sn']       || '').trim()
    const masterShipping = String(record['shipping']  || '').trim()

    const snOk       = !masterSN       || masterSN === sn.sn
    const shippingOk = !masterShipping || ptn.raw.includes(masterShipping)

    if (snOk && shippingOk) {
      triggerPassFeedback()
      const item = {
        poNo:      gc.po,
        sn:        sn.sn,
        shipping:  masterShipping || ptn.raw.slice(0, 30),
        passedAt:  new Date().toLocaleString('ko-KR'),
      }
      setPassResult({ ok: true, po: gc.po, msg: '검증 PASS' })
      setPassItems(prev => [item, ...prev])
      // TRADE_DOCS 상태를 검증PASS로 업데이트 (전체 재쓰기)
      try {
        const values = await api.readSheet('TRADE_DOCS')
        const updated = values.map((row, i) => {
          if (i === 0) return row  // 헤더
          if (String(row[2]).includes(gc.po)) {  // col 2 = poNo
            const r = [...row]; r[7] = '검증PASS'; return r
          }
          return row
        })
        await api.writeSheet('TRADE_DOCS', updated)
      } catch {}
      resetSession()
      setTimeout(() => setPassResult(null), 3000)
    } else {
      triggerFailFeedback()
      const detail = `SN:${snOk ? 'OK' : 'NG'}(${sn.sn}≠${masterSN}) Shipping:${shippingOk ? 'OK' : 'NG'}`
      setPassResult({ ok: false, po: gc.po, msg: '불일치 — ' + detail })
      dbgLog('FAIL: ' + detail)
      setTimeout(() => setPassResult(null), 5000)
      resetSession()
    }
  }, [resetSession])

  const startScan       = () => { setError(null); setScanning(true) }
  const stopScan        = () => setScanning(false)
  const switchToResult  = () => { setScanning(false); setTab('result') }

  useEffect(() => {
    if (!scanning) return

    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const ctx    = canvas.getContext('2d', { willReadFrequently: true })
    let stream   = null
    let animId   = null
    let active   = true
    let busy     = false
    let tick     = 0

    const handleCode = (raw) => {
      const detected = detectType(raw)
      const { type }  = detected
      const current   = sessionRef.current

      if (current[type] !== null) return   // 이미 이 타입 스캔됨

      dbgLog(`[${type}] ${detected.raw?.slice(0, 50)}`)
      triggerScanFeedback()

      const next = { ...current, [type]: detected }
      sessionRef.current = next
      setSession({ ...next })

      if (next.gc && next.ptn && next.sn) {
        checkPass(next)
      }
    }

    const capture = (targetW) => {
      const vW = video.videoWidth
      const vH = video.videoHeight
      const w  = Math.min(vW, targetW)
      const h  = Math.round(vH * w / vW)
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
      ctx.drawImage(video, 0, 0, w, h)
      return { data: ctx.getImageData(0, 0, w, h), w }
    }

    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
        })
      } catch (e) {
        if (!active) return
        setError('카메라 권한을 허용해주세요.')
        setScanning(false)
        return
      }
      if (!active) { stream.getTracks().forEach(t => t.stop()); return }

      video.srcObject = stream
      video.play().catch(() => {})
      dbgLog('카메라 시작 — zxing 로드중...')
      try { await readBarcodesFromImageData(new ImageData(1, 1), { formats: ['Code128'] }) } catch {}
      dbgLog('준비완료 — 스캔중... (GM: 거명 / ANSI: SN / 기타: PTN)')
      if (!active) return

      const scan = async () => {
        if (!active) return
        if (!busy && video.readyState >= 2 && video.videoWidth > 0) {
          busy = true; tick++
          try {
            const vW = video.videoWidth
            const { data: fastData, w: fw } = capture(1200)
            let results = await readBarcodesFromImageData(fastData, {
              formats: FORMATS, tryHarder: false, tryRotate: true,
              tryInvert: false, tryDownscale: false, maxNumberOfSymbols: 1,
            })
            if (results.length === 0 && tick % 3 === 0) {
              const { data: fullData } = capture(vW)
              results = await readBarcodesFromImageData(fullData, {
                formats: FORMATS, tryHarder: true, tryRotate: true,
                tryInvert: true, tryDownscale: true, maxNumberOfSymbols: 1,
              })
              dbgLog(`tick:${tick} | 정밀:${vW}px | ${results.length > 0 ? '인식!' : '없음'}`)
            } else if (results.length === 0) {
              dbgLog(`tick:${tick} | 빠른:${fw}px | 없음`)
            }
            results.forEach(r => handleCode(r.text))
          } catch (e) { dbgLog('에러: ' + e.message) }
          busy = false
        }
        animId = requestAnimationFrame(scan)
      }
      animId = requestAnimationFrame(scan)
    })()

    return () => {
      active = false
      cancelAnimationFrame(animId)
      stream?.getTracks().forEach(t => t.stop())
      video.srcObject = null
    }
  }, [scanning, checkPass])

  const share = async () => {
    const text = 'No.\tPO번호\t0247#\tSN\tShipping#\tPASS일시\n' +
      [...passItems].reverse().map((it, i) =>
        `${i + 1}\t${it.po}\t${it.sjbun}\t${it.sn}\t${it.shipping}\t${it.passedAt}`
      ).join('\n')
    try {
      if (navigator.share) await navigator.share({ text })
      else { await navigator.clipboard.writeText(text); alert('클립보드에 복사됐습니다') }
    } catch {}
  }

  const sessionKeys   = ['gc', 'ptn', 'sn']
  const sessionDone   = sessionKeys.filter(k => session[k] !== null).length
  const apiConfigured = api.isConfigured()

  return (
    <div className="app">
      <div ref={flashRef} className="scan-flash" />

      {/* PASS / FAIL 결과 오버레이 */}
      {passResult && (
        <div className={`pass-overlay ${passResult.ok ? 'pass-ok' : 'pass-fail'}`}>
          <div className="pass-icon">{passResult.ok ? '✅' : '❌'}</div>
          <div className="pass-po">{passResult.po}</div>
          <div className="pass-msg">{passResult.msg}</div>
        </div>
      )}

      <div className="watermark">씰마스터 v1</div>

      {!apiConfigured && (
        <div className="api-warn">
          API 미설정 — 스캔은 되지만 Google Sheets에 저장 안됨
        </div>
      )}

      <div className="tab-bar">
        <button className={`tab ${tab === 'scan' ? 'active' : ''}`}
          onClick={() => setTab('scan')}>스캔</button>
        <button className={`tab ${tab === 'result' ? 'active' : ''}`}
          onClick={switchToResult}>
          결과{passItems.length > 0 && <span className="badge">{passItems.length}</span>}
        </button>
      </div>

      {/* ─── 스캔 탭 ─── */}
      <div className="scan-panel" style={{ display: tab === 'scan' ? 'flex' : 'none' }}>

        {/* 세션 상태 표시 */}
        <div className="session-bar">
          {sessionKeys.map(k => (
            <div key={k} className={`session-chip ${session[k] ? 'chip-done' : 'chip-empty'}`}>
              {session[k] ? '✓' : '○'} {STATUS_LABEL[k]}
              {k === 'gc' && session[k] && (
                <span className="chip-sub">{session.gc.po}</span>
              )}
            </div>
          ))}
        </div>

        <div className="camera-wrap">
          <video ref={videoRef} playsInline muted
            style={{ display: scanning ? 'block' : 'none',
                     position: 'absolute', inset: 0,
                     width: '100%', height: '100%', objectFit: 'cover' }} />
          {scanning && (
            <>
              <div className="scan-line" />
              <div className="scan-guide-top" />
              <div className="scan-guide-bottom" />
            </>
          )}
          {!scanning && (
            <div className="cam-idle">
              <div className="cam-idle-icon">
                <svg width="32" height="20" viewBox="0 0 32 20" fill="none">
                  <rect x="1" y="1" width="2" height="18" fill="#8e8e93" rx="1"/>
                  <rect x="5" y="3" width="1" height="14" fill="#8e8e93" rx=".5"/>
                  <rect x="8" y="1" width="3" height="18" fill="#8e8e93" rx="1"/>
                  <rect x="13" y="3" width="1" height="14" fill="#8e8e93" rx=".5"/>
                  <rect x="16" y="1" width="2" height="18" fill="#8e8e93" rx="1"/>
                  <rect x="20" y="3" width="3" height="14" fill="#8e8e93" rx=".5"/>
                  <rect x="25" y="1" width="1" height="18" fill="#8e8e93" rx=".5"/>
                  <rect x="28" y="3" width="3" height="14" fill="#8e8e93" rx="1"/>
                </svg>
              </div>
              <span className="cam-idle-text">카메라 시작</span>
            </div>
          )}
        </div>
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        <div className="scan-progress">
          {sessionDone}/3 스캔 완료
          {sessionDone > 0 && (
            <button className="btn-reset-session" onClick={resetSession}>세션 초기화</button>
          )}
        </div>

        {scanning
          ? <button className="btn-stop"  onClick={stopScan}>■ 스캔 종료</button>
          : <button className="btn-start" onClick={startScan}>스캔 시작</button>}

        {error && <p className="error">{error}</p>}
        <div ref={logRef} className="debug-log" />
      </div>

      {/* ─── 결과 탭 ─── */}
      <div className="result-panel" style={{ display: tab === 'result' ? 'flex' : 'none' }}>
        {passItems.length === 0
          ? <p className="empty">PASS된 항목이 없습니다</p>
          : <>
              <div className="result-header">
                <span className="result-count">PASS {passItems.length}건</span>
                <div className="result-btns">
                  <button className="btn-share" onClick={share}>공유</button>
                  <button className="btn-clear" onClick={() => setPassItems([])}>초기화</button>
                </div>
              </div>
              <div className="pass-table-wrap">
                <table className="pass-table">
                  <thead>
                    <tr>
                      <th>#</th><th>PO번호</th><th>SN</th><th>일시</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...passItems].map((it, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td className="mono">{it.po}</td>
                        <td className="mono">{it.sn || '-'}</td>
                        <td className="small">{it.passedAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
        }
      </div>
    </div>
  )
}
