/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react'
import { loginUser, signupUser, updatePatientProfile } from '../data/api'

const AUTH_KEY = 'medivault.auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [worker, setWorker] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(AUTH_KEY))
      return stored?.token && stored.expiresAt > Date.now() ? stored : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (worker) localStorage.setItem(AUTH_KEY, JSON.stringify(worker))
    else localStorage.removeItem(AUTH_KEY)
  }, [worker])

  useEffect(() => {
    if (!worker) return undefined
    const remaining = worker.expiresAt - Date.now()
    const timer = window.setTimeout(() => setWorker(null), Math.max(0, remaining))
    return () => window.clearTimeout(timer)
  }, [worker])

  async function login(identifier, password, accountType) {
    try {
      const result = await loginUser(identifier, password, accountType === 'admin' ? 'patient' : 'doctor')
      const account = { ...result.user, accountType, token: result.token, expiresAt: result.expiresAt }
      setWorker(account)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  function logout() {
    setWorker(null)
  }

  async function signup(payload) { return signupUser(payload) }
  async function updateProfile(profile) {
    const result = await updatePatientProfile(worker.id, profile)
    setWorker((current) => ({ ...current, ...result.user }))
    return result.user
  }

  return <AuthContext.Provider value={{ worker, login, signup, updateProfile, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}

