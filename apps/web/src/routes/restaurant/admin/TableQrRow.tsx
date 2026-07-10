import { Button } from '../../../components/ui'
import type { RestaurantTable } from '../../../lib/restaurant/types'

/* ─────────────────────────────────────────────
   TABLE QR DETAIL ROW (presentational — toggle state stays in TablesTab)
───────────────────────────────────────────── */

export function TableQrRow({ table, branchId }: { table: RestaurantTable; branchId: string }) {
  return (
    <tr className="border-t border-brand-100 bg-brand-50">
      <td colSpan={6} className="p-4">
        <div className="flex items-center gap-6">
          <img
            alt={`QR for table ${table.table_number}`}
            width={120} height={120}
            src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(`${window.location.origin}/menu/${branchId}?table=${table.id}`)}`}
            className="rounded-lg border border-ink-200 bg-white p-1"
          />
          <div>
            <div className="font-medium text-ink-900 mb-1">Table {table.table_number} — Guest Menu QR</div>
            <div className="text-xs text-ink-500 mb-3 break-all font-mono">{window.location.origin}/menu/{branchId}?table={table.id}</div>
            <Button asChild variant="ghost" size="sm">
              <a href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(`${window.location.origin}/menu/${branchId}?table=${table.id}`)}`}
                download={`table-${table.table_number}-qr.png`} target="_blank" rel="noreferrer" className="mr-2">
                Download PNG
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href={`/menu/${branchId}?table=${table.id}`} target="_blank" rel="noreferrer">
                Preview menu →
              </a>
            </Button>
          </div>
        </div>
      </td>
    </tr>
  )
}
