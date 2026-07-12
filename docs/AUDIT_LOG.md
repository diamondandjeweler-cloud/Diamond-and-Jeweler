# Audit Log — deferred / residual findings

Out-of-scope or partially-mitigated issues are logged here (AGENTS.md §4.4), not
fixed inline. One change, one concern.

| Date | ID | Residual | Reason deferred |
|------|----|----------|-----------------|
| 2026-07-11 | M1 | `restaurant.orders` anon INSERT (`rst_anon_insert_orders`) still lets an anonymous guest create an order against **any** tenant's branch. 0183 added a structural table_id↔branch_id consistency check, but full mitigation (an **active-branch** gate + per-source **rate limiting** + a **signed-QR token** binding the insert to the scanned table) needs live data verification and app-flow context that cannot be safely asserted in SQL without risking the guest-ordering flow. Order volume/tenant should be monitored until a signed-token QR issuance path exists. |

---

## 2026-07-12 — Wave A execution log

Deferrals and out-of-scope/un-verifiable items encountered during the **path-to-100 Wave A** execution
are recorded here by each batch (per AGENTS.md §4.4 — logged, not force-shipped). One row per deferral;
cite the item ID and the concrete reason.

| Date | Batch | Item | Residual / what was NOT done | Reason deferred |
|------|-------|------|------------------------------|-----------------|
| 2026-07-12 | 1 (DOCS) | — | No deferrals — all seven doc items (A5, A18, A16, A17, A13-doc, A20-doc, AUDIT_LOG header) completed. | — |

