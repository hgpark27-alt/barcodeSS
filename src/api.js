// Google Apps Script fetch 래퍼
// redirect: "follow" 필수 — Apps Script는 302 리다이렉트를 반환함
// Content-Type 미설정(= text/plain) → preflight(OPTIONS) 없음 → CORS 우회

const BASE = import.meta.env.VITE_APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbySKnwaZEyIgwJEq2npaLuSVojLT3EGXgOJLPnGlbWnn9RdZKmL6xuAsCFi2dAHfTQ0DA/exec'

export const isConfigured = () => !!BASE

// ── 시트 전체 읽기 → 2D 배열 (values[0] = 헤더)
export async function readSheet(sheet) {
  if (!BASE) throw new Error('APPS_SCRIPT_URL 미설정')
  const res = await fetch(`${BASE}?sheet=${encodeURIComponent(sheet)}`, {
    redirect: 'follow',
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error)
  return json.values   // [[header...], [row...], ...]
}

// ── 시트 전체 덮어쓰기 (헤더 포함)
export async function writeSheet(sheet, values) {
  if (!BASE) throw new Error('APPS_SCRIPT_URL 미설정')
  const res = await fetch(BASE, {
    method:   'POST',
    redirect: 'follow',
    body:     JSON.stringify({ sheet, action: 'write', values }),
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error)
  return json
}

// ── 단일 행 추가
export async function appendRow(sheet, row) {
  if (!BASE) throw new Error('APPS_SCRIPT_URL 미설정')
  const res = await fetch(BASE, {
    method:   'POST',
    redirect: 'follow',
    body:     JSON.stringify({ sheet, action: 'append', row }),
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error)
  return json
}

// ── 2D 배열 → 객체 배열 변환 (헤더행 기준)
export function toObjects(values) {
  if (!values || values.length < 1) return []
  const headers = values[0]
  return values.slice(1).map(row => {
    const obj = {}
    headers.forEach((h, i) => { obj[String(h)] = row[i] })
    return obj
  })
}

// ── 객체 배열 → 2D 배열 (헤더행 포함)
export function fromObjects(headers, rows) {
  return [headers, ...rows.map(r => headers.map(h => r[h] ?? ''))]
}

// ── CONFIG 시트 → { key: value } 맵
export async function readConfig() {
  const values = await readSheet('CONFIG')
  const obj = {}
  values.slice(1).forEach(([k, v]) => { if (k) obj[String(k)] = v })
  return obj
}

// ── CONFIG 단일 값 업데이트 (전체 rewrite)
export async function updateConfig(key, value, allValues) {
  const updated = allValues.map(row =>
    row[0] === key ? [key, String(value)] : row
  )
  return writeSheet('CONFIG', updated)
}
