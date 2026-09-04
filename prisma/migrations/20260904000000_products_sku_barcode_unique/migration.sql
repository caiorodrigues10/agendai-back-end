-- Normalize empty SKU/barcode and enforce tenant-scoped uniqueness (NULL allowed multiple times).
UPDATE products SET sku = NULL WHERE sku IS NOT NULL AND btrim(sku) = '';
UPDATE products SET barcode = NULL WHERE barcode IS NOT NULL AND btrim(barcode) = '';

CREATE UNIQUE INDEX IF NOT EXISTS products_barbershop_sku_key
  ON products ("barbershopId", sku)
  WHERE sku IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS products_barbershop_barcode_key
  ON products ("barbershopId", barcode)
  WHERE barcode IS NOT NULL;
