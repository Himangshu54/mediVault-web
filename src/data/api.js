const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

function authHeaders(headers = {}) {
  try {
    const auth = JSON.parse(localStorage.getItem('medivault.auth'))
    return auth?.token ? { ...headers, Authorization: `Bearer ${auth.token}` } : headers
  } catch {
    return headers
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Request failed.')
  return data
}

export function loginUser(email, password, role) {
  return request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, role }) })
}

export function signupUser(payload) {
  return request('/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
}

export function createDoctorReport(userId, form) {
  const body = new FormData()
  body.append('patientName', form.patientName)
  body.append('age', form.age)
  body.append('phone', form.phone)
  body.append('reportType', form.type)
  body.append('comments', form.comments)
  body.append('report', form.file)
  return request('/doctor/reports', { method: 'POST', headers: authHeaders(), body })
}

export function getDoctorReports(_userId, query) {
  return request(`/doctor/reports?patientName=${encodeURIComponent(query.patientName)}&phone=${encodeURIComponent(query.phone)}`, { headers: authHeaders() })
}

export function getPatientDoctors() { return request('/patient/doctors', { headers: authHeaders() }) }
export function getPatientReports(_userId, query) { const type = query.type || ''; const reportId = query.id || ''; const doctorName = query.doctorName || ''; return request(`/patient/reports?reportType=${encodeURIComponent(type)}&reportId=${encodeURIComponent(reportId)}&doctorName=${encodeURIComponent(doctorName)}${query.doctorId ? `&doctorId=${encodeURIComponent(query.doctorId)}` : ''}`, { headers: authHeaders() }) }
export function updatePatientProfile(_userId, profile) { return request('/patient/profile', { method: 'PATCH', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(profile) }) }

export async function getReportFile(_userId, _role, reportId) {
  const response = await fetch(`${API_URL}/reports/${encodeURIComponent(reportId)}/file`, { headers: authHeaders() })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || 'Unable to open report.')
  }
  return response.blob()
}
