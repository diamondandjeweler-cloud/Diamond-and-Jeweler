import { Badge } from '../../../components/ui'
import type { OrgMember } from '../../../lib/restaurant/types'

/* ─────────────────────────────────────────────
   ORG MEMBERS TABLE (presentational — members state stays in OrgTab)
───────────────────────────────────────────── */

export function OrgMembersTable({ members, isOwner, onRemove }: {
  members: Array<OrgMember & { email?: string; full_name?: string }>
  isOwner: boolean
  onRemove: (userId: string) => void
}) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-ink-400 border-b border-ink-100">
        <th className="pb-2 font-medium">User ID</th>
        <th className="pb-2 font-medium">Role</th>
        <th className="pb-2 font-medium">Joined</th>
        {isOwner && <th />}
      </tr></thead>
      <tbody>
        {members.map((m) => (
          <tr key={m.id} className="border-b border-ink-50 last:border-0">
            <td className="py-2 font-mono text-xs text-ink-500">{m.user_id.slice(0, 8)}…</td>
            <td className="py-2">
              <Badge tone={m.is_owner ? 'amber' : 'gray'}>{m.is_owner ? 'Owner' : 'Member'}</Badge>
            </td>
            <td className="py-2 text-ink-400">{new Date(m.created_at).toLocaleDateString()}</td>
            {isOwner && (
              <td className="py-2 text-right">
                <button
                  type="button"
                  onClick={() => void onRemove(m.user_id)}
                  className="text-red-500 hover:text-red-700 text-xs px-2 py-1 rounded hover:bg-red-50"
                >
                  Remove
                </button>
              </td>
            )}
          </tr>
        ))}
        {members.length === 0 && (
          <tr><td colSpan={4} className="py-4 text-center text-ink-400">No members yet.</td></tr>
        )}
      </tbody>
    </table>
  )
}
