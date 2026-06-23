// ════════════════════════════════════════════════════════════
//  씰마스터 앱 — Google Apps Script 백엔드
//
//  [설치 방법]
//  1. 이 스프레드시트 열기
//     https://docs.google.com/spreadsheets/d/1GVU10lk0Q81ur1JZBnY2lrJn_I2SETpaj_vyvcWJvtc
//  2. 확장 프로그램 → Apps Script
//  3. Code.gs 내용 전부 지우고 이 파일 내용 붙여넣기
//  4. 저장 (Ctrl+S)
//  5. 배포 → 새 배포 → 유형: 웹앱
//     - 다음 사용자로 실행: 나
//     - 액세스 권한: 모든 사용자
//  6. 배포 URL → GitHub Secret "VITE_APPS_SCRIPT_URL" 에 저장
//
//  [시트 초기화] 배포 후 아래 URL 한 번만 열기:
//  {배포URL}?sheet=__init__
// ════════════════════════════════════════════════════════════

const SHEET_ID = "1GVU10lk0Q81ur1JZBnY2lrJn_I2SETpaj_vyvcWJvtc"

// 시트별 헤더 정의
const HEADERS = {
  KITS:       ["id", "name", "parts", "updatedAt"],
  QUOTES:     ["id", "quoteNo", "poNo", "kitId", "items", "totalUSD", "totalKRW", "createdAt"],
  TRADE_DOCS: ["id", "docNo", "poNo", "quoteId", "sn", "shipping", "barcodeVal", "status", "createdAt"],
  CONFIG:     ["key", "value"],
  ADD:        ["key", "value"],
}

const CONFIG_DEFAULTS = [
  ["exchangeRate", "1350"],
  ["quoteSequence", "1"],
]
const ADD_DEFAULTS = [
  ["icpmsPrice", "0"],
  ["lpcPrice", "0"],
]

// ── GET: ?sheet=KITS → { ok, values: [[...]] }
function doGet(e) {
  try {
    const sheetName = (e.parameter.sheet || "").trim()

    // 시트 초기화 요청
    if (sheetName === "__init__") {
      initSheets_()
      return ok({ msg: "시트 초기화 완료" })
    }

    if (!sheetName) return ok({ error: "sheet 파라미터 필요" })

    const ss    = SpreadsheetApp.openById(SHEET_ID)
    const sheet = ss.getSheetByName(sheetName)
    if (!sheet) return ok({ error: `시트 '${sheetName}' 없음. ?sheet=__init__ 먼저 실행` })

    const values = sheet.getDataRange().getValues()
    return ok({ ok: true, values })
  } catch (err) {
    return ok({ error: err.toString() })
  }
}

// ── POST: { sheet, action, values } → { ok }
// action: "write" → 전체 덮어쓰기 (시트 초기화 후 setValues)
// action: "append" → 마지막 행에 추가 (헤더 유지)
function doPost(e) {
  try {
    const body      = JSON.parse(e.postData.contents)
    const sheetName = (body.sheet || "").trim()
    const action    = (body.action || "write").trim()

    if (!sheetName) return ok({ error: "sheet 필드 필요" })

    const ss    = SpreadsheetApp.openById(SHEET_ID)
    const sheet = ss.getSheetByName(sheetName)
    if (!sheet) return ok({ error: `시트 '${sheetName}' 없음` })

    if (action === "write") {
      // 전체 덮어쓰기
      const values = body.values
      if (!values || !values.length) return ok({ error: "values 필요" })
      sheet.clearContents()
      sheet.getRange(1, 1, values.length, values[0].length).setValues(values)
    }

    else if (action === "append") {
      // 단일 행 추가
      const row = body.row
      if (!row || !row.length) return ok({ error: "row 필요" })
      sheet.appendRow(row)
    }

    else {
      return ok({ error: `알 수 없는 action: ${action}` })
    }

    return ok({ ok: true })
  } catch (err) {
    return ok({ error: err.toString() })
  }
}

// ── 헬퍼 ──

function initSheets_() {
  const ss = SpreadsheetApp.openById(SHEET_ID)

  Object.entries(HEADERS).forEach(([name, headers]) => {
    let sheet = ss.getSheetByName(name)
    if (!sheet) {
      sheet = ss.insertSheet(name)
      sheet.appendRow(headers)
      sheet.setFrozenRows(1)
      sheet.getRange(1, 1, 1, headers.length)
        .setFontWeight("bold")
        .setBackground("#1e2a3a")
        .setFontColor("#ffffff")
      sheet.setColumnWidths(1, headers.length, 150)

      // 기본값 세팅
      if (name === "CONFIG") CONFIG_DEFAULTS.forEach(r => sheet.appendRow(r))
      if (name === "ADD")    ADD_DEFAULTS.forEach(r => sheet.appendRow(r))
    }
  })
}

function ok(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
}
