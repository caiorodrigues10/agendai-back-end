-- Catalog, inventory and retail sales.

CREATE TYPE "BusinessSegment" AS ENUM (
  'BARBERSHOP', 'HAIR_SALON', 'BEAUTY_STUDIO', 'NAIL_STUDIO',
  'LASH_BROW_STUDIO', 'AESTHETICS', 'SPA', 'OTHER'
);
CREATE TYPE "ProductType" AS ENUM ('RETAIL', 'CONSUMABLE', 'BOTH');
CREATE TYPE "StockMovementType" AS ENUM (
  'PURCHASE_RECEIPT', 'SALE', 'SALE_REFUND', 'INTERNAL_CONSUMPTION',
  'MANUAL_ADJUSTMENT', 'PURCHASE_REVERSAL'
);
CREATE TYPE "RetailSaleStatus" AS ENUM ('COMPLETED', 'CANCELED', 'REFUNDED');
CREATE TYPE "FiadoOrigin" AS ENUM ('MANUAL', 'SERVICE_COMPLETION', 'RETAIL_SALE');

ALTER TYPE "CrmFinancialEventKind" ADD VALUE IF NOT EXISTS 'PRODUCT_SOLD';
ALTER TYPE "CrmFinancialEventKind" ADD VALUE IF NOT EXISTS 'PRODUCT_REFUNDED';

ALTER TABLE "barbershops"
  ADD COLUMN "businessSegment" "BusinessSegment" NOT NULL DEFAULT 'OTHER';

ALTER TABLE "barbershop_onboardings"
  ADD COLUMN "segmentConfirmedAt" TIMESTAMP(3);

ALTER TABLE "fiados"
  ADD COLUMN "origin" "FiadoOrigin" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "retailSaleId" UUID,
  ADD COLUMN "creditAdjustedAmount" REAL NOT NULL DEFAULT 0;

ALTER TABLE "expenses"
  ADD COLUMN "inventoryReceiptId" UUID,
  ADD COLUMN "locked" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "product_categories" (
  "id" UUID NOT NULL,
  "barbershopId" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "color" VARCHAR(16) NOT NULL DEFAULT '#6B7280',
  "icon" VARCHAR(40) NOT NULL DEFAULT 'package',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "suppliers" (
  "id" UUID NOT NULL,
  "barbershopId" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "whatsapp" VARCHAR(20),
  "email" VARCHAR(120),
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "products" (
  "id" UUID NOT NULL,
  "barbershopId" UUID NOT NULL,
  "categoryId" UUID,
  "name" VARCHAR(160) NOT NULL,
  "description" VARCHAR(400),
  "sku" VARCHAR(60),
  "barcode" VARCHAR(80),
  "imageUrl" VARCHAR(500),
  "unitLabel" VARCHAR(40) NOT NULL DEFAULT 'unidade',
  "salePrice" REAL NOT NULL,
  "averageCost" REAL NOT NULL DEFAULT 0,
  "stockQty" REAL NOT NULL DEFAULT 0,
  "minStock" REAL NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "type" "ProductType" NOT NULL DEFAULT 'RETAIL',
  "trackStock" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_movements" (
  "id" UUID NOT NULL,
  "barbershopId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "type" "StockMovementType" NOT NULL,
  "quantity" REAL NOT NULL,
  "unitCost" REAL NOT NULL,
  "stockBefore" REAL NOT NULL,
  "stockAfter" REAL NOT NULL,
  "sourceType" VARCHAR(40) NOT NULL,
  "sourceId" UUID NOT NULL,
  "reason" VARCHAR(300),
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_receipts" (
  "id" UUID NOT NULL,
  "barbershopId" UUID NOT NULL,
  "supplierId" UUID,
  "supplierName" VARCHAR(200),
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "paymentMethod" VARCHAR(50),
  "total" REAL NOT NULL,
  "notes" TEXT,
  "createExpense" BOOLEAN NOT NULL DEFAULT true,
  "skipExpenseReason" VARCHAR(300),
  "reversedAt" TIMESTAMP(3),
  "reversedById" UUID,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_receipts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_receipt_items" (
  "id" UUID NOT NULL,
  "barbershopId" UUID NOT NULL,
  "receiptId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "quantity" REAL NOT NULL,
  "unitCost" REAL NOT NULL,
  CONSTRAINT "inventory_receipt_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "retail_sales" (
  "id" UUID NOT NULL,
  "barbershopId" UUID NOT NULL,
  "clientId" UUID,
  "soldById" UUID NOT NULL,
  "queueItemId" UUID,
  "appointmentId" UUID,
  "paymentMethod" VARCHAR(40) NOT NULL,
  "subtotal" REAL NOT NULL,
  "discount" REAL NOT NULL DEFAULT 0,
  "total" REAL NOT NULL,
  "totalCost" REAL NOT NULL,
  "status" "RetailSaleStatus" NOT NULL DEFAULT 'COMPLETED',
  "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idempotencyKey" VARCHAR(120) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "retail_sales_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "retail_sale_lines" (
  "id" UUID NOT NULL,
  "barbershopId" UUID NOT NULL,
  "saleId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "productName" VARCHAR(160) NOT NULL,
  "quantity" REAL NOT NULL,
  "unitPrice" REAL NOT NULL,
  "unitCost" REAL NOT NULL,
  "refundedQty" REAL NOT NULL DEFAULT 0,
  CONSTRAINT "retail_sale_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "retail_sale_refunds" (
  "id" UUID NOT NULL,
  "barbershopId" UUID NOT NULL,
  "saleId" UUID NOT NULL,
  "reason" VARCHAR(300) NOT NULL,
  "restock" BOOLEAN NOT NULL DEFAULT true,
  "refundMethod" VARCHAR(40) NOT NULL,
  "financialRefund" REAL NOT NULL,
  "outstandingCredit" REAL NOT NULL DEFAULT 0,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "retail_sale_refunds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "retail_sale_refund_lines" (
  "id" UUID NOT NULL,
  "barbershopId" UUID NOT NULL,
  "refundId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "quantity" REAL NOT NULL,
  "unitPrice" REAL NOT NULL,
  "unitCost" REAL NOT NULL,
  CONSTRAINT "retail_sale_refund_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "catalog_template_installs" (
  "id" UUID NOT NULL,
  "barbershopId" UUID NOT NULL,
  "segment" "BusinessSegment" NOT NULL,
  "version" VARCHAR(40) NOT NULL,
  "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "catalog_template_installs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fiado_adjustments" (
  "id" UUID NOT NULL,
  "barbershopId" UUID NOT NULL,
  "fiadoId" UUID NOT NULL,
  "amount" REAL NOT NULL,
  "reason" VARCHAR(300) NOT NULL,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiado_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_categories_barbershopId_name_key" ON "product_categories"("barbershopId", "name");
CREATE INDEX "product_categories_barbershopId_active_idx" ON "product_categories"("barbershopId", "active");
CREATE INDEX "suppliers_barbershopId_active_idx" ON "suppliers"("barbershopId", "active");
CREATE INDEX "products_barbershopId_active_idx" ON "products"("barbershopId", "active");
CREATE INDEX "products_barbershopId_name_idx" ON "products"("barbershopId", "name");
CREATE INDEX "products_barbershopId_sku_idx" ON "products"("barbershopId", "sku");
CREATE INDEX "products_barbershopId_barcode_idx" ON "products"("barbershopId", "barcode");
CREATE INDEX "stock_movements_barbershopId_createdAt_idx" ON "stock_movements"("barbershopId", "createdAt");
CREATE INDEX "stock_movements_productId_createdAt_idx" ON "stock_movements"("productId", "createdAt");
CREATE INDEX "stock_movements_sourceType_sourceId_idx" ON "stock_movements"("sourceType", "sourceId");
CREATE INDEX "inventory_receipts_barbershopId_receivedAt_idx" ON "inventory_receipts"("barbershopId", "receivedAt");
CREATE INDEX "inventory_receipt_items_barbershopId_idx" ON "inventory_receipt_items"("barbershopId");
CREATE INDEX "inventory_receipt_items_receiptId_idx" ON "inventory_receipt_items"("receiptId");
CREATE INDEX "inventory_receipt_items_productId_idx" ON "inventory_receipt_items"("productId");
CREATE UNIQUE INDEX "retail_sales_barbershopId_idempotencyKey_key" ON "retail_sales"("barbershopId", "idempotencyKey");
CREATE INDEX "retail_sales_barbershopId_soldAt_idx" ON "retail_sales"("barbershopId", "soldAt");
CREATE INDEX "retail_sales_clientId_idx" ON "retail_sales"("clientId");
CREATE INDEX "retail_sales_soldById_idx" ON "retail_sales"("soldById");
CREATE INDEX "retail_sales_status_idx" ON "retail_sales"("status");
CREATE INDEX "retail_sale_lines_barbershopId_idx" ON "retail_sale_lines"("barbershopId");
CREATE INDEX "retail_sale_lines_saleId_idx" ON "retail_sale_lines"("saleId");
CREATE INDEX "retail_sale_lines_productId_idx" ON "retail_sale_lines"("productId");
CREATE INDEX "retail_sale_refunds_saleId_idx" ON "retail_sale_refunds"("saleId");
CREATE INDEX "retail_sale_refunds_barbershopId_createdAt_idx" ON "retail_sale_refunds"("barbershopId", "createdAt");
CREATE INDEX "retail_sale_refund_lines_barbershopId_idx" ON "retail_sale_refund_lines"("barbershopId");
CREATE INDEX "retail_sale_refund_lines_refundId_idx" ON "retail_sale_refund_lines"("refundId");
CREATE UNIQUE INDEX "catalog_template_installs_barbershopId_segment_version_key" ON "catalog_template_installs"("barbershopId", "segment", "version");
CREATE UNIQUE INDEX "fiados_retailSaleId_key" ON "fiados"("retailSaleId");
CREATE UNIQUE INDEX "expenses_inventoryReceiptId_key" ON "expenses"("inventoryReceiptId");
CREATE INDEX "fiado_adjustments_fiadoId_idx" ON "fiado_adjustments"("fiadoId");
CREATE INDEX "fiado_adjustments_barbershopId_idx" ON "fiado_adjustments"("barbershopId");

ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_receipt_items" ADD CONSTRAINT "inventory_receipt_items_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "inventory_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_receipt_items" ADD CONSTRAINT "inventory_receipt_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "salon_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_queueItemId_fkey" FOREIGN KEY ("queueItemId") REFERENCES "queue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "retail_sale_lines" ADD CONSTRAINT "retail_sale_lines_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "retail_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retail_sale_lines" ADD CONSTRAINT "retail_sale_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retail_sale_refunds" ADD CONSTRAINT "retail_sale_refunds_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "retail_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retail_sale_refund_lines" ADD CONSTRAINT "retail_sale_refund_lines_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "retail_sale_refunds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retail_sale_refund_lines" ADD CONSTRAINT "retail_sale_refund_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "catalog_template_installs" ADD CONSTRAINT "catalog_template_installs_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiado_adjustments" ADD CONSTRAINT "fiado_adjustments_fiadoId_fkey" FOREIGN KEY ("fiadoId") REFERENCES "fiados"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiados" ADD CONSTRAINT "fiados_retailSaleId_fkey" FOREIGN KEY ("retailSaleId") REFERENCES "retail_sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_inventoryReceiptId_fkey" FOREIGN KEY ("inventoryReceiptId") REFERENCES "inventory_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'product_categories','suppliers','products','stock_movements','inventory_receipts',
    'inventory_receipt_items','retail_sales','retail_sale_lines','retail_sale_refunds',
    'retail_sale_refund_lines','catalog_template_installs','fiado_adjustments'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (COALESCE(current_setting(''app.current_barbershop_id'', true), '''') = '''' OR "barbershopId" = NULLIF(current_setting(''app.current_barbershop_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END $$;
