const BASE = import.meta.env.VITE_APPS_SCRIPT_URL || ''

async function get(action, params = {}) {
  if (!BASE) throw new Error('APPS_SCRIPT_URL 미설정')
  const u = new URL(BASE)
  u.searchParams.set('action', action)
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, String(v)))
  const res = await fetch(u.toString())
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function post(body) {
  if (!BASE) throw new Error('APPS_SCRIPT_URL 미설정')
  // Content-Type 미설정 = text/plain → preflight 없음 (CORS 우회)
  const res = await fetch(BASE, { method: 'POST', body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export const api = {
  isConfigured: () => !!BASE,
  init:              ()              => get('init'),
  getMasterList:     ()              => get('list'),
  getVerifyList:     ()              => get('verifyList'),
  getByPO:           (po)            => get('getByPO', { po }),
  addQuotation:      (d)             => post({ action: 'addQuotation',   ...d }),
  updateSN:          (po, sn)        => post({ action: 'updateSN',       po, sn }),
  updateShipping:    (po, shipping)  => post({ action: 'updateShipping', po, shipping }),
  addVerification:   (d)             => post({ action: 'addVerification', ...d }),
  deleteByPO:        (po)            => post({ action: 'deleteByPO',     po }),
}
