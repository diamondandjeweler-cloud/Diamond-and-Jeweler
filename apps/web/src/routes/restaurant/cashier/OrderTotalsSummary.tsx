import { MYR } from '../../../lib/restaurant/format'
import type { Order } from '../../../lib/restaurant/types'

export default function OrderTotalsSummary({
  order, paid, remaining,
}: {
  order: Order
  paid: number
  remaining: number
}) {
  return (
    <dl className="text-sm space-y-1 mb-4 border-t pt-3">
      <div className="flex justify-between"><dt className="text-ink-500">Subtotal</dt><dd>{MYR(Number(order.subtotal))}</dd></div>
      {Number(order.discount) > 0 && <div className="flex justify-between text-emerald-700"><dt>Discount</dt><dd>−{MYR(Number(order.discount))}</dd></div>}
      <div className="flex justify-between"><dt className="text-ink-500">Tax</dt><dd>{MYR(Number(order.tax))}</dd></div>
      {Number(order.tip) > 0 && <div className="flex justify-between"><dt className="text-ink-500">Tip</dt><dd>{MYR(Number(order.tip))}</dd></div>}
      <div className="flex justify-between font-display text-lg"><dt>Total</dt><dd>{MYR(Number(order.total))}</dd></div>
      <div className="flex justify-between text-ink-500"><dt>Paid</dt><dd>{MYR(paid)}</dd></div>
      <div className="flex justify-between text-lg"><dt>Balance</dt><dd>{MYR(remaining)}</dd></div>
    </dl>
  )
}
