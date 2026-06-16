import { useState, useEffect, useRef } from 'react'
import { readBarcodesFromImageData, setZXingModuleOverrides } from 'zxing-wasm/reader'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import { QRCodeSVG } from 'qrcode.react'
import './App.css'

const APP_URL = 'https://hgpark27-alt.github.io/barcodeSS/'
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

setZXingModuleOverrides({ locateFile: (p) => p.endsWith('.wasm') ? wasmUrl : p })

const BARCODE_FORMATS = ['Code128', 'Code39', 'EAN13', 'EAN8', 'UPCA', 'UPCE', 'ITF', 'Codabar']

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

export default function App() {
  const [scanning, setScanning] = useState(false)
  const [tab, setTab]           = useState('scan')
  const [items, setItems]       = useState([])
  const [error, setError]       = useState(null)
  const [rawView, setRawView]   = useState(false)
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const logRef    = useRef(null)
  const flashRef  = useRef(null)
  const seenRef   = useRef(new Set())

  const triggerFeedback = () => {
    navigator.vibrate?.(80)
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)()
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 1046
      gain.gain.setValueAtTime(0.4, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.12)
    } catch {}
    const el = flashRef.current
    if (el) {
      el.classList.remove('flash-active')
      void el.offsetWidth
      el.classList.add('flash-active')
    }
  }

  const dbgLog = (msg) => { if (logRef.current) logRef.current.textContent = msg }

  const startScan      = () => { setError(null); setScanning(true) }
  const stopScan       = () => setScanning(false)
  const switchToResult = () => { setScanning(false); setTab('result') }
  const clearAll       = () => { setItems([]); seenRef.current.clear(); setRawView(false) }

  useEffect(() => {
    if (!scanning) return

    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const ctx  = canvas.getContext('2d', { willReadFrequently: true })
    let stream = null
    let animId = null
    let active = true
    let busy   = false
    let tick   = 0

    const handleCode = (text) => {
      dbgLog('인식: ' + text.slice(0, 60))
      if (!active || seenRef.current.has(text)) return
      seenRef.current.add(text)
      triggerFeedback()
      const clean = text.replace(/[\x00-\x1f␀-␟]/g, '')
      setItems(prev => [{ ...parseLabel(text), raw: clean }, ...prev])
    }

    const capture = (targetW) => {
      const vW = video.videoWidth
      const vH = video.videoHeight
      const w  = Math.min(vW, targetW)
      const h  = Math.round(vH * w / vW)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width  = w
        canvas.height = h
      }
      ctx.drawImage(video, 0, 0, w, h)
      return { data: ctx.getImageData(0, 0, w, h), w, h }
    }

    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
        })
      } catch (e) {
        if (!active) return
        dbgLog('카메라오류: ' + e.message)
        setError('카메라 권한을 허용해주세요.')
        setScanning(false)
        return
      }
      if (!active) { stream.getTracks().forEach(t => t.stop()); return }

      video.srcObject = stream
      video.play().catch(() => {})
      dbgLog('카메라 시작됨 — zxing-wasm 로드중...')

      try { await readBarcodesFromImageData(new ImageData(1, 1), { formats: ['Code128'] }) } catch {}

      dbgLog('준비완료 — 스캔중...')
      if (!active) return

      const scan = async () => {
        if (!active) return

        if (!busy && video.readyState >= 2 && video.videoWidth > 0) {
          busy = true
          tick++

          try {
            const vW = video.videoWidth

            // ① 빠른 패스: 1200px (바코드는 가로 해상도가 중요)
            const { data: fastData, w: fastW } = capture(1200)
            let results = await readBarcodesFromImageData(fastData, {
              formats: BARCODE_FORMATS,
              tryHarder:    false,
              tryRotate:    true,
              tryInvert:    false,
              tryDownscale: false,
              maxNumberOfSymbols: 1,
            })

            // ② 정밀 패스: 원본 해상도 + 전체 옵션 (3프레임마다)
            if (results.length === 0 && tick % 3 === 0) {
              const { data: fullData } = capture(vW)
              results = await readBarcodesFromImageData(fullData, {
                formats: BARCODE_FORMATS,
                tryHarder:    true,
                tryRotate:    true,
                tryInvert:    true,
                tryDownscale: true,
                maxNumberOfSymbols: 1,
              })
              dbgLog(`tick:${tick} | 정밀:${vW}px | ${results.length > 0 ? '인식!' : '없음'}`)
            } else if (results.length === 0) {
              dbgLog(`tick:${tick} | 빠른:${fastW}px | 없음`)
            }

            results.forEach(r => handleCode(r.text))
          } catch (e) {
            dbgLog('에러: ' + e.message)
          }
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
  }, [scanning])

  const share = async (text) => {
    try {
      if (navigator.share) await navigator.share({ text })
      else { await navigator.clipboard.writeText(text); alert('클립보드에 복사됐습니다') }
    } catch {}
  }
  const handleShare = () => {
    const rows = [...items].reverse()
    share('No.\tS/N\tP/N\tS/O\n' +
      rows.map((it, i) => `${i + 1}\t${it.sn || '-'}\t${it.pn || '-'}\t${it.so || '-'}`).join('\n'))
  }

  if (!isMobile) return (
    <div className="pc-landing">
      <div className="pc-card">
        <div className="pc-barcode-icon">
          <svg width="48" height="30" viewBox="0 0 48 30" fill="none">
            <rect x="0"  y="0" width="4"  height="30" fill="#18181b" rx="1.5"/>
            <rect x="7"  y="4" width="2"  height="22" fill="#18181b" rx="1"/>
            <rect x="12" y="0" width="5"  height="30" fill="#18181b" rx="1.5"/>
            <rect x="20" y="4" width="2"  height="22" fill="#18181b" rx="1"/>
            <rect x="25" y="0" width="4"  height="30" fill="#18181b" rx="1.5"/>
            <rect x="32" y="4" width="5"  height="22" fill="#18181b" rx="1"/>
            <rect x="40" y="0" width="2"  height="30" fill="#18181b" rx="1.5"/>
            <rect x="45" y="4" width="3"  height="22" fill="#18181b" rx="1"/>
          </svg>
        </div>
        <h1 className="pc-title">바코드 스캐너</h1>
        <p className="pc-desc">이 앱은 모바일에서 사용하도록 만들어졌습니다.<br />아래 QR코드를 스마트폰으로 찍어 여세요.</p>
        <div className="pc-qr">
          <QRCodeSVG value={APP_URL} size={180} bgColor="#fff" fgColor="#18181b" />
        </div>
        <p className="pc-url">{APP_URL}</p>
      </div>
    </div>
  )

  return (
    <div className="app">
      <div ref={flashRef} className="scan-flash" />
      <div className="watermark">한솔아이원스 박혜근 선임</div>

      <div className="tab-bar">
        <button className={`tab ${tab === 'scan' ? 'active' : ''}`}
          onClick={() => setTab('scan')}>스캔</button>
        <button className={`tab ${tab === 'result' ? 'active' : ''}`}
          onClick={switchToResult}>
          결과{items.length > 0 && <span className="badge">{items.length}</span>}
        </button>
      </div>

      <div className="scan-panel" style={{ display: tab === 'scan' ? 'flex' : 'none' }}>
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
                  <rect x="5" y="3" width="1" height="14" fill="#8e8e93" rx="0.5"/>
                  <rect x="8" y="1" width="3" height="18" fill="#8e8e93" rx="1"/>
                  <rect x="13" y="3" width="1" height="14" fill="#8e8e93" rx="0.5"/>
                  <rect x="16" y="1" width="2" height="18" fill="#8e8e93" rx="1"/>
                  <rect x="20" y="3" width="3" height="14" fill="#8e8e93" rx="0.5"/>
                  <rect x="25" y="1" width="1" height="18" fill="#8e8e93" rx="0.5"/>
                  <rect x="28" y="3" width="3" height="14" fill="#8e8e93" rx="1"/>
                </svg>
              </div>
              <span className="cam-idle-text">카메라 시작</span>
            </div>
          )}
        </div>
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {scanning
          ? <button className="btn-stop"  onClick={stopScan}>■ 스캔 종료</button>
          : <button className="btn-start" onClick={startScan}>스캔 시작</button>}

        {error && <p className="error">{error}</p>}
        <div ref={logRef} className="debug-log" />
        <div className={`scan-counter ${scanning && items.length > 0 ? 'counter--active' : !scanning && items.length > 0 ? 'counter--done' : 'counter--idle'} ${items.length >= 100 ? 'counter--3d' : items.length >= 10 ? 'counter--2d' : ''}`}>
          {items.length}
        </div>
      </div>

      <div className="result-panel" style={{ display: tab === 'result' ? 'flex' : 'none' }}>
        {items.length === 0
          ? <p className="empty">스캔된 항목이 없습니다</p>
          : <>
              <div className="result-header">
                <span className="result-count">{items.length}개</span>
                <div className="result-btns">
                  <button className="btn-share" onClick={handleShare}>공유</button>
                  <button className={`btn-raw-toggle ${rawView ? 'active' : ''}`}
                    onClick={() => setRawView(v => !v)}>원문</button>
                  <button className="btn-clear" onClick={clearAll}>초기화</button>
                </div>
              </div>
              {rawView
                ? <div className="raw-wrap">
                    {[...items].reverse().map((item, i) => (
                      <div key={i} className="raw-row">
                        <span className="raw-num">{i + 1}</span>
                        <span className="raw-text">{item.raw}</span>
                      </div>
                    ))}
                  </div>
                : <div className="table-wrap">
                    <table>
                      <thead><tr><th>#</th><th>S/N</th><th>P/N</th><th>S/O</th></tr></thead>
                      <tbody>
                        {items.map((item, i) => (
                          <tr key={i}>
                            <td className="td-num">{items.length - i}</td>
                            <td>{item.sn || '—'}</td>
                            <td>{item.pn || '—'}</td>
                            <td>{item.so || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
              }
            </>
        }
      </div>
    </div>
  )
}
