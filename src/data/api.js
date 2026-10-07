const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

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
  return request('/doctor/reports', { method: 'POST', headers: { 'x-user-id': userId }, body })
}

export function getDoctorReports(userId, query) {
  return request(`/doctor/reports?patientName=${encodeURIComponent(query.patientName)}&phone=${encodeURIComponent(query.phone)}`, { headers: { 'x-user-id': userId } })
}

export function getPatientDoctors(userId) { return request('/patient/doctors', { headers: { 'x-user-id': userId } }) }
export function getPatientReports(userId, query) { const type = query.type || ''; const reportId = query.id || ''; const doctorName = query.doctorName || ''; return request(`/patient/reports?reportType=${encodeURIComponent(type)}&reportId=${encodeURIComponent(reportId)}&doctorName=${encodeURIComponent(doctorName)}${query.doctorId ? `&doctorId=${encodeURIComponent(query.doctorId)}` : ''}`, { headers: { 'x-user-id': userId } }) }
export function updatePatientProfile(userId, profile) { return request('/patient/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-user-id': userId }, body: JSON.stringify(profile) }) }

export async function getReportFile(userId, role, reportId) {
  const response = await fetch(`${API_URL}/reports/${encodeURIComponent(reportId)}/file`, { headers: { 'x-user-id': userId, 'x-user-role': role } })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || 'Unable to open report.')
  }
  return response.blob()
}
