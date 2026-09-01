# Diagrama de entidades (principais)

```
Company ──┬── User ── Role ── Permission
          ├── Setting
          ├── Product ── Category / Brand / Unit
          │      ├── Batch ── StockMovement
          │      ├── PriceHistory
          │      └── SaleOrderItem / PurchaseOrderItem
          ├── Supplier ── PurchaseOrder ── PurchaseReceipt
          ├── Customer ── Pet
          │      ├── Tag (N:N)
          │      └── SaleOrder ── SalePayment ── PaymentMethod
          ├── Coupon ── CouponUsage
          ├── Campaign ── CampaignCustomer
          └── AuditLog
```

## Índices críticos

- `products`: internalCode, barcode, name, active
- `customers`: document, email, phone, whatsapp
- `sale_orders`: saleDate, status, channel
- `batches`: productId + expiresAt
- `stock_movements`: productId + createdAt
