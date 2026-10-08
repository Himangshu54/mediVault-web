import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { initializeDatabase, query } from './db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const app = express()
const port = Number(process.env.PORT || 5000)
const uploadDirectory = path.join(__dirname, 'uploads')
const upload = multer({ dest: uploadDirectory, limits: { fileSize: 25 * 1024 * 1024 } })
const jwtSecret = process.env.JWT_SECRET || 'medivault-development-secret-change-me'
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be configured in production.')
const sessionDurationSeconds = 24 * 60 * 60

const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((origin) => origin.trim())
app.use(cors({ origin: allowedOrigins }))
app.use(express.json())
app.use('/uploads', express.static(uploadDirectory))

function normalizeEmail(email) { return String(email || '').trim().toLowerCase() }
function authRequired(role) {
  return async (req, res, next) => {
    try {
      const authorization = req.header('authorization') || ''
      const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
      if (!token) return res.status(401).json({ error: 'Authentication required.' })
      const claims = jwt.verify(token, jwtSecret)
      if (!claims.sub || !claims.role || (role && claims.role !== role)) return res.status(401).json({ error: 'Invalid session.' })
      const table = claims.role === 'doctor' ? 'doctors' : 'patients'
      const result = await query(`SELECT * FROM ${table} WHERE id = $1`, [claims.sub])
      if (!result.rows[0]) return res.status(401).json({ error: 'Invalid user.' })
      req.user = result.rows[0]
      req.auth = claims
      next()
    } catch (error) {
      if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') return res.status(401).json({ error: 'Session expired. Please sign in again.' })
      next(error)
    }
  }

}

app.patch('/api/patient/profile', authRequired('patient'), async (req, res, next) => {
  try {
    const age = Number(req.body.age)
    const phone = String(req.body.phone || '').trim()
    if (!Number.isInteger(age) || age < 1 || age > 149 || !phone) return res.status(400).json({ error: 'Valid age and phone are required.' })
    const result = await query('UPDATE patients SET age = $1, phone = $2 WHERE id = $3 RETURNING id, name, email, age, phone', [age, phone, req.user.id])
    res.json({ user: { ...result.rows[0], role: 'patient' } })
  } catch (error) { next(error) }
})

app.get('/api/health', async (_req, res, next) => {
  try { await query('SELECT 1'); res.json({ ok: true }) } catch (error) { next(error) }
})

app.post('/api/auth/signup', async (req, res, next) => {
  try {
    const { name, email, password, role, phone, age, specialization } = req.body
    const normalizedEmail = normalizeEmail(email)
    if (!name || !normalizedEmail || !password || !['doctor', 'patient'].includes(role)) return res.status(400).json({ error: 'Name, email, password, and valid role are required.' })
    const passwordHash = await bcrypt.hash(password, 12)
    const table = role === 'doctor' ? 'doctors' : 'patients'
    const values = role === 'doctor' ? [name.trim(), normalizedEmail, passwordHash, specialization || null, phone || null] : [name.trim(), normalizedEmail, passwordHash, phone || '', Number(age)]
    if (role === 'patient' && (!phone || !Number.isInteger(Number(age)))) return res.status(400).json({ error: 'Patient phone and age are required.' })
    const columns = role === 'doctor' ? '(name, email, password_hash, specialization, phone)' : '(name, email, password_hash, phone, age)'
    const result = await query(`INSERT INTO ${table} ${columns} VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email`, values)
    res.status(201).json({ user: { ...result.rows[0], role } })
  } catch (error) { if (error.code === '23505') return res.status(409).json({ error: 'Email already exists.' }); next(error) }
})

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { email, password, role } = req.body
    const normalizedEmail = normalizeEmail(email)
    if (!normalizedEmail || !password || !['doctor', 'patient'].includes(role)) return res.status(400).json({ error: 'Email, password, and role are required.' })
    const table = role === 'doctor' ? 'doctors' : 'patients'
    const result = await query(`SELECT * FROM ${table} WHERE email = $1`, [normalizedEmail])
    const user = result.rows[0]
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Incorrect credentials.' })
    const safeUser = { ...user }
    delete safeUser.password_hash
    const token = jwt.sign({ sub: String(user.id), role }, jwtSecret, { expiresIn: sessionDurationSeconds })
    res.json({ user: { ...safeUser, role }, token, expiresAt: Date.now() + sessionDurationSeconds * 1000 })
  } catch (error) { next(error) }
})

app.post('/api/doctor/reports', authRequired('doctor'), upload.single('report'), async (req, res, next) => {
  try {
    const { patientName, age, phone, reportType, comments } = req.body
    if (!patientName || !age || !phone || !reportType || !req.file) return res.status(400).json({ error: 'Patient details, report type, and file are required.' })
    const existing = await query('SELECT id, name, phone, age FROM patients WHERE LOWER(name) = LOWER($1) AND phone = $2', [patientName.trim(), phone.trim()])
    let patient = existing.rows[0]
    if (!patient) {
      const generatedPasswordHash = await bcrypt.hash(crypto.randomUUID(), 12)
      const patientResult = await query('INSERT INTO patients (name, phone, age, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, name, phone, age', [patientName.trim(), phone.trim(), Number(age), generatedPasswordHash])
      patient = patientResult.rows[0]
    }
    if (!patient) return res.status(409).json({ error: 'Unable to create or find patient.' })
    const reportId = `RPT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
    const fileKey = `uploads/${req.file.filename}`
    const result = await query(`
      INSERT INTO reports (report_id, doctor_id, patient_id, report_type, original_file_name, file_key, storage_provider, mime_type, file_size, comments)
      VALUES ($1, $2, $3, $4, $5, $6, 'local', $7, $8, $9)
      RETURNING *
    `, [reportId, req.user.id, patient.id, reportType.trim(), req.file.originalname, fileKey, req.file.mimetype, req.file.size, comments || null])
    res.status(201).json({ report: result.rows[0] })
  } catch (error) { next(error) }
})

app.get('/api/doctor/reports', authRequired('doctor'), async (req, res, next) => {
  try {
    const name = String(req.query.patientName || '').trim()
    const phone = String(req.query.phone || '').trim()
    const result = await query(`
      SELECT r.*, p.name AS patient_name, p.age, p.phone
      FROM reports r JOIN patients p ON p.id = r.patient_id
      WHERE r.doctor_id = $1 AND ($2 = '' OR LOWER(p.name) LIKE LOWER('%' || $2 || '%')) AND ($3 = '' OR p.phone LIKE '%' || $3 || '%')
      ORDER BY r.created_at DESC
      LIMIT 10
    `, [req.user.id, name, phone])
    res.json({ reports: result.rows })
  } catch (error) { next(error) }
})

app.get('/api/patient/doctors', authRequired('patient'), async (req, res, next) => {
  try {
    const result = await query(`SELECT DISTINCT d.id, d.name, d.email, d.specialization, d.phone FROM reports r JOIN doctors d ON d.id = r.doctor_id WHERE r.patient_id = $1 ORDER BY d.name`, [req.user.id])
    res.json({ doctors: result.rows })
  } catch (error) { next(error) }
})

app.get('/api/patient/reports', authRequired('patient'), async (req, res, next) => {
  try {
    const type = String(req.query.reportType || '').trim()
    const reportId = String(req.query.reportId || '').trim()
    const doctorName = String(req.query.doctorName || '').trim()
    const doctorId = String(req.query.doctorId || '').trim()
    const result = await query(`
      SELECT r.*, d.name AS doctor_name, d.specialization
      FROM reports r JOIN doctors d ON d.id = r.doctor_id
      WHERE r.patient_id = $1 AND ($2 = '' OR r.report_type ILIKE '%' || $2 || '%') AND ($3 = '' OR r.report_id ILIKE '%' || $3 || '%') AND ($4 = '' OR d.name ILIKE '%' || $4 || '%') AND ($5 = '' OR r.doctor_id::text = $5)
      ORDER BY r.created_at DESC
      LIMIT 10
    `, [req.user.id, type, reportId, doctorName, doctorId])
    res.json({ reports: result.rows })
  } catch (error) { next(error) }
})

app.get('/api/reports/:id/file', authRequired(), async (req, res, next) => {
  try {
    const userId = req.user.id
    const role = req.auth.role
    const accessColumn = role === 'doctor' ? 'doctor_id' : 'patient_id'
    const result = await query(`SELECT file_key, storage_provider, mime_type, original_file_name FROM reports WHERE (id::text = $1 OR report_id = $1) AND ${accessColumn} = $2`, [req.params.id, userId])
    const report = result.rows[0]
    if (!report) return res.status(404).json({ error: 'Report not found.' })
    if (report.storage_provider !== 'local') return res.status(501).json({ error: 'S3 file access is not configured yet.' })
    const filePath = path.resolve(__dirname, report.file_key)
    const fileName = path.basename(report.original_file_name).replace(/["\r\n]/g, '_')
    res.type(report.mime_type)
    if (req.query.download === '1') return res.download(filePath, fileName)
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`)
    res.sendFile(filePath)
  } catch (error) { next(error) }
})

app.use((error, _req, res, next) => { if (typeof res.status !== 'function') return next(error); console.error(error); res.status(500).json({ error: 'Internal server error.' }) })

initializeDatabase().then(() => app.listen(port, () => console.log(`MediVault API listening on port ${port}`))).catch((error) => { console.error('Database initialization failed:', error); process.exit(1) })
