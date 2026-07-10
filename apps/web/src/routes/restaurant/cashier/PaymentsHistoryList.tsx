import { MYR } from '../../../lib/restaurant/format'
import type { Payment } from '../../../lib/restaurant/types'

export default function PaymentsHistoryList({
  payments, onRequestRefund,
}: {
  payments: Payment[]
  onRequestRefund: (p: Payment) => void
}) {
  return (
    <div className="mt-4 pt-4 border-t">
      <div className="text-xs text-ink-500 uppercase tracking-wide mb-2">Payments</div>
      <ul className="space-y-1 text-sm">
        {payments.map((p) => (
          <li key={p.id} className="flex items-center justify-between">
            <span className={p.status === 'refunded' ? 'line-through' : ''}>
              {p.method} · {MYR(Number(p.amount))}
              {p.receipt_no && <span className="ml-2 text-xs text-ink-400">{p.receipt_no}</span>}
            </span>
            {p.status === 'completed' && (
              <button className="text-xs text-red-500" onClick={() => onRequestRefund(p)}>
                Refund
              </button>
            )}
            {p.status === 'refunded' && <span className="text-xs text-red-500">refunded</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
