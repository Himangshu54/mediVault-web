/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react'

const AUTH_KEY = 'healthnext.auth'
const demoEmployee = {
  id: 'WORKER001',
  name: 'Sunita Kumari',
  email: 'sunita.kumari@healthnext.org',
  role: 'Field Health Worker',
  accountType: 'employee',
}
const demoAdmin = {
  id: 'ADMIN001',
  name: 'Dr. Arjun Mehta',
  email: 'admin@healthnext.org',
  role: 'Organization Administrator',
  accountType: 'admin',
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [worker, setWorker] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(AUTH_KEY))
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (worker) localStorage.setItem(AUTH_KEY, JSON.stringify(worker))
    else localStorage.removeItem(AUTH_KEY)
  }, [worker])

  function login(identifier, password, accountType) {
    const normalized = identifier.trim().toUpperCase()
    const account = accountType === 'admin' ? demoAdmin : demoEmployee
    if ((normalized === account.id || identifier.trim().toLowerCase() === account.email) && password === (accountType === 'admin' ? 'admin123' : 'worker123')) {
      setWorker(account)
      return { success: true }
    }
    return { success: false, error: `The ${accountType === 'admin' ? 'Organization ID' : 'Worker ID'} or password is incorrect.` }
  }

  function logout() {
    setWorker(null)
  }

  return <AuthContext.Provider value={{ worker, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}

export { demoAdmin, demoEmployee }
