-- academy-presale-codes: codigo 100% emitido por la academia por venta
-- cobrada en efectivo; vinculo codigo-acuerdo; medio declarado de la orden.
ALTER TYPE "DiscountCodeType" ADD VALUE 'ACADEMY_PRESALE';

ALTER TABLE "DiscountCode" ADD COLUMN "academySaleAgreementId" TEXT;
CREATE INDEX "DiscountCode_academySaleAgreementId_idx" ON "DiscountCode"("academySaleAgreementId");

ALTER TABLE "Payment" ADD COLUMN "methodLabel" TEXT;
