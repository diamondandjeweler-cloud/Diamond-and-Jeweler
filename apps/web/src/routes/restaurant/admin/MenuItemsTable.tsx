import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { Badge, Button, Card, CardBody } from '../../../components/ui'
import type { MenuCategory, MenuItem } from '../../../lib/restaurant/types'
import { MYR } from '../../../lib/restaurant/format'

/* ─────────────────────────────────────────────
   MENU ITEMS TABLE (presentational — state stays in MenuTab)
───────────────────────────────────────────── */

export function MenuItemsTable({ items, categoryById, expandedMods, onEdit, onToggleMods, onDelete, renderExpanded }: {
  items: MenuItem[]
  categoryById: Map<string, MenuCategory>
  expandedMods: string | null
  onEdit: (m: MenuItem) => void
  onToggleMods: (id: string) => void
  onDelete: (m: MenuItem) => void
  renderExpanded: (m: MenuItem) => ReactNode
}) {
  return (
    <Card><CardBody className="p-0">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-500 bg-ink-50">
          <tr>
            <th className="p-3">Photo</th>
            <th className="p-3">Name</th>
            <th className="p-3">Category</th>
            <th className="p-3">Course</th>
            <th className="p-3 text-right">Price</th>
            <th className="p-3">Hours</th>
            <th className="p-3">Active</th>
            <th className="p-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((m) => {
            const cat = m.category_id ? categoryById.get(m.category_id) : undefined
            const modsOpen = expandedMods === m.id
            return (
              <Fragment key={m.id}>
                <tr className="border-t border-ink-100 hover:bg-ink-50/50">
                  <td className="p-3">
                    {m.image_url
                      ? <img src={m.image_url} alt={m.name} loading="lazy" decoding="async" className="w-10 h-10 rounded-lg object-cover border border-ink-100" />
                      : <div className="w-10 h-10 rounded-lg bg-ink-100 flex items-center justify-center text-ink-300">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                        </div>
                    }
                  </td>
                  <td className="p-3 font-medium">{m.name}</td>
                  <td className="p-3 text-ink-500">{cat?.name ?? '—'}</td>
                  <td className="p-3"><Badge tone="gray">{m.course_type}</Badge></td>
                  <td className="p-3 text-right font-medium">{MYR(Number(m.price))}</td>
                  <td className="p-3 text-xs text-ink-500">
                    {m.available_from && m.available_until
                      ? `${m.available_from}–${m.available_until}`
                      : m.available_from ? `From ${m.available_from}` : '—'}
                  </td>
                  <td className="p-3">
                    {m.is_active ? <Badge tone="green">on</Badge> : <Badge tone="red">off</Badge>}
                  </td>
                  <td className="p-3 space-x-1 whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => onEdit(m)}>Edit</Button>
                    <Button variant="ghost" size="sm" className="text-brand-700"
                      onClick={() => onToggleMods(m.id)}>
                      Add-ons {modsOpen ? '▲' : '▼'}
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-600"
                      onClick={() => onDelete(m)}>
                      Delete
                    </Button>
                  </td>
                </tr>
                {modsOpen && (
                  <tr className="border-t border-brand-100 bg-brand-50/40">
                    <td colSpan={8} className="p-0">
                      {renderExpanded(m)}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </CardBody></Card>
  )
}
