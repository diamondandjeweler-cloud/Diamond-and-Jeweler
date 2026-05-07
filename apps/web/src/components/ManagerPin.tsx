import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Alert, Button } from './ui'

/**
 * Modal that gates a sensitive op (void, refund, override, variance) behind
 * a manager PIN. Resolves with the manager's employee_id on success and logs
 * a manager_approval row.
 *
 * Usage:
 *   <ManagerPin open={x} branchId={b} action="void_item" reason="Customer changed mind"
 *               entityId={li.id} entityType="order_item"
 *               onApprove={(mgrId) => doTheVoid(mgrId)} onCancel={() => setX(false)} />
 */
export default function ManagerPin({
  open, branchId, action, entityType, entityId, reason: initialReason, onApprove, onCancel,
}: {
  open: boolean
  branchId: string
  action: 'void_item' | 'refund' | 'discount_override' | 'shift_variance' | 'price_change' | 'time_edit' | 'remake'
  entityType?: string
  entityId?: string | null
  reason?: string
  onApprove: (managerId: string) => void
  onCancel: () => void
}) {
  const [pin, setPin] = useState('')
  const [reason, setReason] = useState(initialReason ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const pinInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setPin(''); setReason(initialReason ?? ''); setErr(null); setBusy(false)
      // Focus the PIN input when the modal opens (modal-scoped focus, not page-load autoFocus).
      requestAnimationFrame(() => pinInputRef.current?.focus())
    }
  }, [open, initialReason])

  if (!open) return null

  const submit = async () => {
    if (!pin.trim()) { setErr('PIN required'); return }
    if (action !== 'shift_variance' && !reason.trim()) { setErr('Reason required'); return }
    setBusy(true); setErr(null)
    try {
      const db = supabase.schema('restaurant' as never) as unknown as ReturnType<typeof supabase.schema>
      const { data: mgrId, error } = await db.rpc('verify_manager_pin', { p_branch_id: branchId, p_pin: pin.trim() })
      if (error) throw error
      if (!mgrId) { setErr('Invalid PIN — manager only'); setBusy(false); return }
      // Log approval (best-effort)
      try {
        await db.from('manager_approval').insert({
          branch_id: branchId, manager_id: mgrId, action,
          entity_type: entityType, entity_id: entityId ?? null,
          reason: reason || null,
        })
      } catch { /* tolerate */ }
      onApprove(mgrId as string)
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Manager approval">
      <button type="button" aria-label="Close" className="absolute inset-0 w-full h-full cursor-default" onClick={onCancel} tabIndex={-1} />
      <div className="bg-white rounded-2xl max-w-sm w-full p-5 relative z-10">
        <div className="eyebrow mb-1">Manager approval</div>
        <h3 className="font-display text-xl mb-1 capitalize">{action.replace(/_/g, ' ')}</h3>
        <p className="text-xs text-ink-500 mb-3">A manager (shift manager / admin / owner) must enter their PIN to authorise this.</p>
        <div className="field mb-3">
          <label htmlFor="manager-pin-input" className="field-label">Manager PIN</label>
          <input ref={pinInputRef} id="manager-pin-input" type="password" inputMode="numeric" maxLength={6} value={pin}
            onChange={(e) => setPin(e.target.value)} placeholder="••••" className="w-full" />
        </div>
        {action !== 'shift_variance' && (
          <div className="field mb-3">
            <label htmlFor="manager-pin-reason" className="field-label">Reason</label>
            <textarea id="manager-pin-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full" placeholder="Why this is being approved" />
          </div>
        )}
        {err && <Alert tone="red">{err}</Alert>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="brand" onClick={submit} loading={busy}>Authorise</Button>
        </div>
      </div>
    </div>
  )
}
