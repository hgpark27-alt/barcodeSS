// ════════════════════════════════════════════════════════════
//  씰마스터 앱 — Google Apps Script 백엔드
//
//  [설치 방법]
//  1. 이 Google Spreadsheet 열기
//     https://docs.google.com/spreadsheets/d/1GVU10lk0Q81ur1JZBnY2lrJn_I2SETpaj_vyvcWJvtc
//  2. 확장 프로그램 → Apps Script
//  3. Code.gs 내용 전체 지우고 이 파일 내용 붙여넣기
//  4. 저장 (Ctrl+S)
//  5. 배포 → 새 배포 → 유형: 웹 앱
//     - 다음 사용자로 실행: 나 (Me)
//     - 액세스 권한: 모든 사용자 (Anyone)
//  6. 배포 → 복사된 URL → .env.local 파일에 붙여넣기
//     VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec
//
//  [시트 초기화]
//  배포 후 브라우저에서 아래 URL 한 번 열기 (시트 자동 생성):
//  https://script.google.com/macros/s/.../exec?action=init
// ════════════════════════════════════════════════════════════

const MASTER = '마스터'
const VERIFY = '검증결과'

const M_HEADERS = ['PO번호', '0247#', 'SN', 'Price_USD', 'Shipping#', '상태', '생성일시', '거명일시', 'PTN일시']
const V_HEADERS = ['PO번호', '0247#', 'SN', 'Shipping#', 'PASS일시', '스캔담당']

function initSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()

  function ensureSheet(name, headers, color) {
    let sh = ss.getSheetByName(name)
    if (!sh) {
      sh = ss.insertSheet(name)
      sh.appendRow(headers)
      sh.setFrozenRows(1)
      sh.getRange(1, 1, 1, headers.length)
        .setFontWeight('bold')
        .setBackground(color)
        .setFontColor('#ffffff')
      sh.setColumnWidths(1, headers.length, 140)
    }
    return sh
  }

  ensureSheet(MASTER, M_HEADERS, '#1e2a3a')
  ensureSheet(VERIFY, V_HEADERS, '#1a3a1a')
}

function doGet(e) {
  try {
    initSheets_()
    const a  = (e.parameter.action || '').trim()
    const ss = SpreadsheetApp.getActiveSpreadsheet()

    if (a === 'init') return respond({ ok: true, msg: '시트 초기화 완료' })

    if (a === 'list') {
      return respond(toObjects_(ss.getSheetByName(MASTER)))
    }

    if (a === 'verifyList') {
      return respond(toObjects_(ss.getSheetByName(VERIFY)))
    }

    if (a === 'getByPO') {
      const po   = (e.parameter.po || '').trim()
      const rows = toObjects_(ss.getSheetByName(MASTER))
      const found = rows.find(r => String(r['PO번호']).trim() === po)
      return respond(found || null)
    }

    return respond({ error: '알 수 없는 action: ' + a })
  } catch (err) {
    return respond({ error: err.toString() })
  }
}

function doPost(e) {
  try {
    initSheets_()
    const b   = JSON.parse(e.postData.contents)
    const a   = (b.action || '').trim()
    const ss  = SpreadsheetApp.getActiveSpreadsheet()
    const msh = ss.getSheetByName(MASTER)
    const vsh = ss.getSheetByName(VERIFY)
    const now = new Date().toLocaleString('ko-KR')

    // 견적서 저장
    if (a === 'addQuotation') {
      if (!b.po) return respond({ error: 'PO번호 필수' })
      const existing = findRow_(msh, b.po)
      if (existing > 0) return respond({ error: `PO '${b.po}' 이미 존재 (행 ${existing})` })
      msh.appendRow([b.po, b.sjbun || '', b.sn || '', b.price || '', '', '견적완료', now, '', ''])
      return respond({ ok: true })
    }

    // 거래명세서 SN 업데이트
    if (a === 'updateSN') {
      if (!b.po || !b.sn) return respond({ error: 'po, sn 필수' })
      const row = findRow_(msh, b.po)
      if (!row) return respond({ error: `PO '${b.po}' 없음` })
      msh.getRange(row, 3).setValue(b.sn)
      msh.getRange(row, 6).setValue('거명완료')
      msh.getRange(row, 8).setValue(now)
      return respond({ ok: true })
    }

    // PTN Shipping# 업데이트
    if (a === 'updateShipping') {
      if (!b.po || !b.shipping) return respond({ error: 'po, shipping 필수' })
      const row = findRow_(msh, b.po)
      if (!row) return respond({ error: `PO '${b.po}' 없음` })
      msh.getRange(row, 5).setValue(b.shipping)
      msh.getRange(row, 6).setValue('PTN완료')
      msh.getRange(row, 9).setValue(now)
      return respond({ ok: true })
    }

    // 바코드 검증 PASS
    if (a === 'addVerification') {
      if (!b.po) return respond({ error: 'po 필수' })
      vsh.appendRow([b.po, b.sjbun || '', b.sn || '', b.shipping || '', now, b.operator || '모바일'])
      const row = findRow_(msh, b.po)
      if (row) msh.getRange(row, 6).setValue('검증PASS')
      return respond({ ok: true })
    }

    // 레코드 삭제
    if (a === 'deleteByPO') {
      if (!b.po) return respond({ error: 'po 필수' })
      const row = findRow_(msh, b.po)
      if (!row) return respond({ error: `PO '${b.po}' 없음` })
      msh.deleteRow(row)
      return respond({ ok: true })
    }

    return respond({ error: '알 수 없는 action: ' + a })
  } catch (err) {
    return respond({ error: err.toString() })
  }
}

function findRow_(sheet, po) {
  const vals = sheet.getDataRange().getValues()
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === String(po).trim()) return i + 1
  }
  return 0
}

function toObjects_(sheet) {
  if (!sheet) return []
  const data = sheet.getDataRange().getValues()
  if (data.length < 2) return []
  const h = data[0]
  return data.slice(1).map(row => {
    const o = {}
    h.forEach((k, i) => { o[String(k)] = row[i] })
    return o
  })
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
}
