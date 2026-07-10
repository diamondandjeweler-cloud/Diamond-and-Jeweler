import { Card, CardBody } from '../../../components/ui'
import { MYR, minutesAgo } from '../../../lib/restaurant/format'
import type { Order, RestaurantTable } from '../../../lib/restaurant/types'

export default function OrderListPanel({
  orders, tableById, activeId, search, onSearchChange, onSelect,
}: {
  orders: Order[]
  tableById: Map<string, RestaurantTable>
  activeId: string | null
  search: string
  onSearchChange: (value: string) => void
  onSelect: (orderId: string) => void
}) {
  return (
    <Card>
      <CardBody>
        <h2 className="font-display text-lg mb-3">Open orders</h2>
        <input
          type="search"
          placeholder="Search table, name, phone, id…"
          className="w-full mb-3"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {orders.length === 0 ? (
          <div className="text-sm text-ink-500 py-6 text-center">No matching orders</div>
        ) : (
          <ul className="space-y-2">
            {orders.map((o) => {
              const tbl = tableById.get(o.table_id ?? '')
              return (
                <li key={o.id}>
                  <button
                    onClick={() => onSelect(o.id)}
                    className={`w-full text-left p-2 rounded-md border ${
                      activeId === o.id ? 'border-brand-600 bg-brand-50' : 'border-ink-200 hover:bg-ink-50'
                    }`}
                  >
                    <div className="flex justify-between">
                      <div>
                        <div className="font-medium">
                          {tbl ? `Table ${tbl.table_number}` : o.order_type}
                          {o.customer_name && ` · ${o.customer_name}`}
                        </div>
                        <div className="text-xs text-ink-500">#{o.id.slice(0,6)} · {minutesAgo(o.created_at)}m</div>
                      </div>
                      <div className="font-display">{MYR(Number(o.total))}</div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}
