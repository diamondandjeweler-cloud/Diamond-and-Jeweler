/**
 * Restaurant Operating System — shared types.
 * Mirrors the `restaurant.*` Postgres schema 1:1.
 * Kept isolated so this module can be lifted to its own project cleanly.
 */

export type PlanTier = 'starter' | 'pro' | 'enterprise'

export interface Organization {
  id: string
  name: string
  plan_tier: PlanTier
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface OrgMember {
  id: string
  organization_id: string
  user_id: string
  is_owner: boolean
  invited_by: string | null
  created_at: string
}

export type BranchStatus = 'active' | 'inactive' | 'archived'
export type TableStatus  = 'free' | 'occupied' | 'reserved' | 'cleaning' | 'out_of_service'
export type TableShape   = 'round' | 'square' | 'rectangle' | 'booth'
export type TableArea    = 'indoor' | 'outdoor' | 'bar' | 'patio' | 'private'
export type CourseType   = 'appetizer' | 'main' | 'dessert' | 'drink' | 'side' | 'any'
export type OrderType    = 'dinein' | 'takeaway' | 'delivery' | 'bar'
export type OrderSource  = 'waiter' | 'kiosk' | 'qr' | 'grab' | 'foodpanda' | 'shopee'
export type OrderStatus  = 'active' | 'sent' | 'partial' | 'ready' | 'served' | 'paid' | 'closed' | 'voided'
export type OrderItemStatus = 'pending' | 'held' | 'fired' | 'preparing' | 'ready' | 'served' | 'voided' | 'rejected'
export type TicketStatus = 'pending' | 'acknowledged' | 'started' | 'ready' | 'completed' | 'rejected'
export type EmployeeRole = 'waiter' | 'kitchen' | 'bar' | 'cashier' | 'host' | 'storekeeper' | 'shift_manager' | 'admin' | 'owner'
export type PaymentMethod = 'cash' | 'card' | 'qr' | 'gift_card' | 'loyalty' | 'voucher' | 'bank_transfer'
export type PaymentStatus = 'pending' | 'completed' | 'refunded' | 'failed' | 'voided'
export type PromotionType = 'time_based' | 'bogo' | 'combo' | 'coupon' | 'membership' | 'table_area' | 'percent_off' | 'flat_off'
export type ReservationStatus = 'confirmed' | 'seated' | 'cancelled' | 'no_show' | 'completed'
export type WaitlistStatus = 'waiting' | 'notified' | 'seated' | 'abandoned' | 'cancelled'
export type InventoryTxnType = 'sale' | 'receive' | 'waste' | 'transfer_out' | 'transfer_in' | 'adjustment' | 'reserve' | 'release'
export type WasteReason = 'expired' | 'remake' | 'broken' | 'spill' | 'overcook' | 'customer_return' | 'prep_error' | 'other'

export interface Branch {
  id: string
  organization_id: string
  name: string
  address: string | null
  timezone: string | null
  status: BranchStatus
  created_at: string
  updated_at: string
}

export interface RestaurantTable {
  id: string
  branch_id: string
  table_number: string
  capacity: number
  shape: TableShape | null
  area: TableArea | null
  status: TableStatus
  pos_x: number | null
  pos_y: number | null
  last_status_change: string | null
}

export interface Section {
  id: string
  branch_id: string
  name: string
}

export interface Reservation {
  id: string
  branch_id: string
  table_id: string | null
  customer_name: string
  phone: string | null
  party_size: number
  reservation_time: string
  duration_minutes: number
  status: ReservationStatus
  notes: string | null
  reminder_sent_at: string | null
}

export interface WaitlistEntry {
  id: string
  branch_id: string
  customer_name: string
  phone: string | null
  party_size: number
  requested_at: string
  estimated_wait_minutes: number | null
  seated_at: string | null
  status: WaitlistStatus
}

export interface MenuCategory {
  id: string
  branch_id: string | null
  name: string
  sort_order: number
  icon: string | null
  is_active: boolean
}

export interface MenuItem {
  id: string
  branch_id: string
  category_id: string | null
  name: string
  description: string | null
  price: number
  station: string | null
  image_url: string | null
  is_active: boolean
  course_type: CourseType
  available_from: string | null
  available_until: string | null
  platform_ids: Record<string, string>
}

export interface Modifier {
  id: string
  menu_item_id: string
  name: string
  price_delta: number
  is_active: boolean
}

export interface Ingredient {
  id: string
  branch_id: string
  name: string
  unit: string
  current_stock: number
  reorder_level: number | null
  cost_per_unit: number
  supplier_id: string | null
  is_active: boolean
}

export interface Recipe {
  menu_item_id: string
  ingredient_id: string
  quantity: number
}

export interface Employee {
  id: string
  branch_id: string
  organization_id: string
  auth_user_id: string | null
  name: string
  role: EmployeeRole
  hourly_rate: number | null
  pin: string | null
  rfid: string | null
  is_active: boolean
}

export interface Timesheet {
  id: string
  employee_id: string
  branch_id: string
  clock_in: string
  clock_out: string | null
  total_hours: number | null
  overtime_hours: number | null
  break_minutes: number | null
  approved_by: string | null
  notes: string | null
}

export interface Membership {
  id: string
  branch_id: string | null
  name: string | null
  phone: string | null
  email: string | null
  points: number
  birthday: string | null
  tier: 'bronze' | 'silver' | 'gold' | 'platinum'
}

export interface Order {
  id: string
  branch_id: string
  table_id: string | null
  seat_number: number | null
  order_type: OrderType
  source: OrderSource
  external_order_id: string | null
  customer_name: string | null
  customer_phone: string | null
  membership_id: string | null
  waiter_id: string | null
  status: OrderStatus
  subtotal: number
  discount: number
  tax: number
  tip: number
  total: number
  pickup_time: string | null
  delivery_address: string | null
  delivery_fee: number | null
  notes: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
}

export interface OrderItem {
  id: string
  order_id: string
  menu_item_id: string
  quantity: number
  unit_price: number
  modifier_ids: string[]
  modifiers_total: number
  special_instruction: string | null
  course_type: CourseType
  status: OrderItemStatus
  voided_reason: string | null
  voided_by: string | null
  voided_at: string | null
  created_at: string
}

export interface CourseFiring {
  id: string
  order_id: string
  course_number: number
  course_type: string
  fired_at: string | null
  cleared_at: string | null
  status: 'held' | 'fired' | 'served' | 'cleared'
  fired_by: string | null
}

export interface KitchenTicket {
  id: string
  branch_id: string
  order_id: string
  order_item_id: string | null
  station: string
  status: TicketStatus
  acknowledged_at: string | null
  started_at: string | null
  ready_at: string | null
  completed_at: string | null
  rejected_reason: string | null
  assigned_to: string | null
  created_at: string
}

export interface InventoryTransaction {
  id: string
  branch_id: string
  ingredient_id: string
  quantity: number
  type: InventoryTxnType
  unit_cost: number | null
  reference_order_id: string | null
  reference_po_id: string | null
  reason: string | null
  created_by: string | null
  created_at: string
}

export interface PurchaseOrder {
  id: string
  branch_id: string
  supplier_id: string | null
  status: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled'
  expected_date: string | null
  sent_at: string | null
  received_at: string | null
  total_cost: number
  created_by: string | null
  notes: string | null
  created_at: string
}

export interface PurchaseOrderLine {
  id: string
  po_id: string
  ingredient_id: string
  ordered_qty: number
  received_qty: number | null
  unit_cost: number
  line_total: number
}

export interface Supplier {
  id: string
  branch_id: string | null
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  lead_time_days: number | null
  notes: string | null
  is_active: boolean
}

export interface Payment {
  id: string
  order_id: string
  amount: number
  method: PaymentMethod
  status: PaymentStatus
  receipt_no: string | null
  reference: string | null
  processed_by: string | null
  refunded_by: string | null
  refunded_at: string | null
  refund_reason: string | null
  created_at: string
}

export interface CashierShift {
  id: string
  branch_id: string
  employee_id: string
  opened_at: string
  closed_at: string | null
  opening_float: number
  expected_cash: number | null
  actual_cash: number | null
  variance: number | null
  x_report_json: unknown
  z_report_json: unknown
  approved_by: string | null
  notes: string | null
}

export interface Promotion {
  id: string
  branch_id: string | null
  name: string
  type: PromotionType
  rule_json: Record<string, unknown>
  start_date: string | null
  end_date: string | null
  is_active: boolean
  code: string | null
  usage_limit: number | null
  usage_count: number
}

export interface AuditLog {
  id: string
  branch_id: string | null
  user_id: string | null
  employee_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  old_value: unknown
  new_value: unknown
  reason: string | null
  ip_address: string | null
  created_at: string
}

export interface WasteLog {
  id: string
  branch_id: string
  ingredient_id: string | null
  order_id: string | null
  quantity: number
  reason: WasteReason
  value_cost: number | null
  created_by: string | null
  created_at: string
}

export interface StockTransfer {
  id: string
  from_branch_id: string
  to_branch_id: string
  status: 'draft' | 'sent' | 'received' | 'cancelled'
  ingredient_id: string
  quantity: number
  unit_cost: number
  created_by: string | null
  received_by: string | null
  created_at: string
  sent_at: string | null
  received_at: string | null
  notes: string | null
}

/* ------------------ Aggregates used in UI ------------------ */

export interface CartLine {
  menuItem: MenuItem
  quantity: number
  modifiers: Modifier[]
  specialInstruction?: string
  tempKey: string   // local id in cart
}

export interface OrderSummary extends Order {
  items: OrderItem[]
  table?: RestaurantTable | null
  payments?: Payment[]
}
