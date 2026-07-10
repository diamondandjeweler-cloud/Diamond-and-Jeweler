import { Badge } from '../../../components/ui'
import type { Order, RestaurantTable } from '../../../lib/restaurant/types'

export default function OrderPayHeader({
  order, table,
}: {
  order: Order
  table: RestaurantTable | null
}) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h2 className="font-display text-xl">Order #{order.id.slice(0,8)}</h2>
        <div className="text-sm text-ink-500">
          {order.order_type}
          {table && <> · Table {table.table_number}</>}
          {order.customer_name && <> · {order.customer_name}</>}
        </div>
      </div>
      <Badge tone={order.status === 'paid' ? 'gray' : 'brand'}>{order.status}</Badge>
    </div>
  )
}
