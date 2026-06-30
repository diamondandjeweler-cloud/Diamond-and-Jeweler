import type { ReactNode } from 'react'
import RoleGate from './RoleGate'
import type { RestaurantRole } from '../types/db'

// Restaurant OS access seam. The Restaurant OS is a separate module bolted onto
// the recruitment core (see App.tsx, the VITE_ENABLE_RESTAURANT seam). This gate
// owns the restaurant access policy so the route block in App.tsx never has to
// hard-code which roles may enter the Restaurant OS shell.
//
// Allowed: platform `admin` + the restaurant role (`restaurant_staff`). Anyone
// else is bounced to /home by the underlying RoleGate. This is a client-side UX
// gate only — the real boundary is server-side RLS on the `restaurant` schema.
const RESTAURANT_ROLE: RestaurantRole = 'restaurant_staff'

export default function RestaurantGate({ children }: { children: ReactNode }) {
  // Delegate the loading / no-profile / role-mismatch handling to RoleGate so
  // the restaurant routes behave exactly like every other role-gated route.
  return <RoleGate allow={['admin', RESTAURANT_ROLE]}>{children}</RoleGate>
}
