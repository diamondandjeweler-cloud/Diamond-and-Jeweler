import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'
import type { Branch, Employee } from './types'
import { listBranches, listEmployees } from './store'
import { BRANCH_STORAGE_KEY, EMPLOYEE_STORAGE_KEY } from './format'

interface RestaurantCtx {
  loading: boolean
  branches: Branch[]
  branchId: string | null
  branch: Branch | null
  setBranchId: (id: string) => void
  refreshBranches: () => Promise<void>

  employees: Employee[]
  employeeId: string | null
  setEmployeeId: (id: string | null) => void
  employee: Employee | null
  refreshEmployees: () => Promise<void>

  error: string | null
}

const Ctx = createContext<RestaurantCtx | null>(null)

export function RestaurantProvider({ children }: { children: ReactNode }) {
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchId, setBranchIdState] = useState<string | null>(
    () => (typeof window !== 'undefined' ? localStorage.getItem(BRANCH_STORAGE_KEY) : null),
  )
  const [employees, setEmployees] = useState<Employee[]>([])
  const [employeeId, setEmployeeIdState] = useState<string | null>(
    () => (typeof window !== 'undefined' ? localStorage.getItem(EMPLOYEE_STORAGE_KEY) : null),
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const setBranchId = useCallback((id: string) => {
    setBranchIdState(id)
    try { localStorage.setItem(BRANCH_STORAGE_KEY, id) } catch { /* empty */ }
  }, [])

  const setEmployeeId = useCallback((id: string | null) => {
    setEmployeeIdState(id)
    try {
      if (id) localStorage.setItem(EMPLOYEE_STORAGE_KEY, id)
      else    localStorage.removeItem(EMPLOYEE_STORAGE_KEY)
    } catch { /* empty */ }
  }, [])

  const refreshBranches = useCallback(async () => {
    const list = await listBranches()
    setBranches(list)
    if (list.length && !list.find((b) => b.id === branchId)) {
      setBranchId(list[0].id)
    }
  }, [branchId, setBranchId])

  const refreshEmployees = useCallback(async () => {
    if (!branchId) { setEmployees([]); return }
    const list = await listEmployees(branchId)
    setEmployees(list)
    if (employeeId && !list.find((e) => e.id === employeeId)) {
      setEmployeeId(null)
    }
  }, [branchId, employeeId, setEmployeeId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setError(null)
        const bs = await listBranches()
        if (cancelled) return
        setBranches(bs)
        if (bs.length && !bs.find((b) => b.id === branchId)) {
          setBranchId(bs[0].id)
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!branchId) { setEmployees([]); return }
    void (async () => {
      try {
        const list = await listEmployees(branchId)
        setEmployees(list)
      } catch (e) {
        setError((e as Error).message)
      }
    })()
  }, [branchId])

  const branch = branches.find((b) => b.id === branchId) ?? null
  const employee = employees.find((e) => e.id === employeeId) ?? null

  return (
    <Ctx.Provider value={{
      loading, branches, branchId, branch, setBranchId, refreshBranches,
      employees, employeeId, setEmployeeId, employee, refreshEmployees,
      error,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useRestaurant(): RestaurantCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useRestaurant must be used inside <RestaurantProvider>')
  return c
}
