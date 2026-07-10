import { MYR } from '../../../lib/restaurant/format'
import type { MenuItem, OrderItem } from '../../../lib/restaurant/types'

export default function OrderLinesList({
  items, menuById,
}: {
  items: OrderItem[]
  menuById: Map<string, MenuItem>
}) {
  return (
    <ul className="space-y-1 mb-3">
      {items.map((li) => {
        const mi = menuById.get(li.menu_item_id)
        return (
          <li key={li.id} className="flex justify-between text-sm">
            <span className={li.status === 'voided' ? 'line-through text-ink-400' : ''}>
              {li.quantity}× {mi?.name ?? 'Item'}
            </span>
            <span>{MYR(li.quantity * (Number(li.unit_price) + Number(li.modifiers_total)))}</span>
          </li>
        )
      })}
    </ul>
  )
}
