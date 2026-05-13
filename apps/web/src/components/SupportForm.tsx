import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../state/useSession'

type Category = 'enquiry' | 'bug' | 'feature' | 'payment'
type PaymentSubType = 'pending' | 'failed' | 'refund' | 'wrong_amount' | 'receipt'

const CATEGORY_LABEL: Record<Category, string> = {
  enquiry: 'General enquiry',
  bug: 'Something is broken',
  feature: 'Feature request',
  payment: 'Payment issue',
}

const PAYMENT_SUB_LABEL: Record<PaymentSubType, string> = {
  pending: 'Paid but account not activated',
  failed: 'Was charged but got an error',
  refund: 'Request a refund',
  wrong_amount: 'Charged the wrong amount',
  receipt: 'Need a receipt or invoice',
}

export default function SupportForm() {
  const { session, profile } = useSession()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<Category>('enquiry')
  const [paymentSubType, setPaymentSubType] = useState<PaymentSubType>('pending')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentTransactionId, setPaymentTransactionId] = useState('')
  const [summary, setSummary] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [created, setCreated] = useState(false)
  const [openCount, setOpenCount] = useState(0)

  useEffect(() => {
    if (!session) return
    supabase
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .in('status', ['open', 'in_progress'])
      .then(({ count }) => setOpenCount(count ?? 0))
  }, [session, created])

  const reset = useCallback(() => {
    setCategory('enquiry')
    setPaymentSubType('pending')
    setPaymentAmount('')
    setPaymentTransactionId('')
    setSummary('')
    setErr(null)
    setCreated(false)
  }, [])

  const submit = useCallback(async () => {
    if (submitting) return
    const trimmed = summary.trim()
    if (trimmed.length < 10) {
      setErr('Please describe the issue in at least 10 characters.')
      return
    }
    setSubmitting(true); setErr(null)
    const amountNum = category === 'payment' && paymentAmount.trim()
      ? Number(paymentAmount.replace(/[^0-9.]/g, ''))
      : null
    const { error } = await supabase.from('support_tickets').insert({
      user_id: session!.user.id,
      category,
      payment_sub_type: category === 'payment' ? paymentSubType : null,
      summary: trimmed,
      payment_amount: amountNum && Number.isFinite(amountNum) ? amountNum : null,
      payment_transaction_id: category === 'payment' && paymentTransactionId.trim() ? paymentTransactionId.trim() : null,
      transcript: [{ from: 'user', content: trimmed }],
      status: 'open',
    })
    setSubmitting(false)
    if (error) { setErr(error.message); return }
    setCreated(true)
  }, [submitting, summary, category, paymentSubType, paymentAmount, paymentTransactionId, session])

  if (!session || !profile) return null
  if (location.pathname === '/consent' || location.pathname === '/login') return null

  return (
    <>
      <button
        type="button"
        aria-label="Open support form"
        onClick={() => { setOpen((o) => !o); if (created) reset() }}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-brand-700 text-white shadow-lg hover:bg-brand-800 transition-all flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        )}
        {!open && openCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {openCount > 9 ? '9+' : openCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 w-[22rem] max-w-[calc(100vw-3rem)] max-h-[calc(100dvh-8rem)] flex flex-col rounded-2xl shadow-2xl border border-ink-200 bg-white overflow-hidden animate-slide-up"
          role="dialog"
          aria-label="Contact support"
        >
          <div className="flex items-center gap-3 px-4 py-3 bg-brand-700 text-white shrink-0">
            <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold shrink-0">DNJ</div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm leading-tight">Contact Support</div>
              <div className="text-[11px] text-brand-200">We reply within 1 business day</div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {created ? (
              <div className="text-sm text-ink-700 space-y-3">
                <div className="rounded-lg bg-green-50 border border-green-200 text-green-800 px-3 py-2 text-sm">
                  Ticket created — our team will follow up within 1 business day.
                </div>
                <button
                  type="button"
                  className="text-xs text-brand-700 hover:underline"
                  onClick={reset}
                >
                  Submit another
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block">
                  <span className="block text-xs font-medium text-ink-700 mb-1">What do you need help with?</span>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as Category)}
                    disabled={submitting}
                    className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
                  >
                    {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
                      <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                    ))}
                  </select>
                </label>

                {category === 'payment' && (
                  <>
                    <label className="block">
                      <span className="block text-xs font-medium text-ink-700 mb-1">Type of payment issue</span>
                      <select
                        value={paymentSubType}
                        onChange={(e) => setPaymentSubType(e.target.value as PaymentSubType)}
                        disabled={submitting}
                        className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
                      >
                        {(Object.keys(PAYMENT_SUB_LABEL) as PaymentSubType[]).map((s) => (
                          <option key={s} value={s}>{PAYMENT_SUB_LABEL[s]}</option>
                        ))}
                      </select>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="block text-xs font-medium text-ink-700 mb-1">Amount (RM)</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          disabled={submitting}
                          placeholder="e.g. 9.90"
                          className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
                        />
                      </label>
                      <label className="block">
                        <span className="block text-xs font-medium text-ink-700 mb-1">Transaction ID</span>
                        <input
                          type="text"
                          value={paymentTransactionId}
                          onChange={(e) => setPaymentTransactionId(e.target.value)}
                          disabled={submitting}
                          placeholder="Optional"
                          className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
                        />
                      </label>
                    </div>
                  </>
                )}

                <label className="block">
                  <span className="block text-xs font-medium text-ink-700 mb-1">
                    Tell us what happened
                    <span className="text-ink-400 font-normal"> (required)</span>
                  </span>
                  <textarea
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    disabled={submitting}
                    rows={5}
                    placeholder="Describe the issue, what you were doing, and what you expected…"
                    className="w-full resize-none rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
                  />
                </label>

                {err && (
                  <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-xs">{err}</div>
                )}

                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={submitting || summary.trim().length < 10}
                  className="w-full h-10 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-40 transition-colors"
                >
                  {submitting ? 'Submitting…' : 'Submit ticket'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
