-- producer-fee-model: descomposición de fee por pago + líneas de liquidación auditables
ALTER TABLE "Payment" ADD COLUMN "feeMode" TEXT,
  ADD COLUMN "platformFeeRate" DOUBLE PRECISION,
  ADD COLUMN "platformFeeNetClp" INTEGER,
  ADD COLUMN "platformFeeVatClp" INTEGER,
  ADD COLUMN "gatewayFeeExpected" INTEGER,
  ADD COLUMN "producerNetClp" INTEGER,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'CLP';

CREATE TABLE "PayoutLine" (
  "id" TEXT NOT NULL,
  "payoutId" TEXT NOT NULL,
  "paymentId" TEXT,
  "type" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayoutLine_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PayoutLine" ADD CONSTRAINT "PayoutLine_payoutId_fkey"
  FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutLine" ADD CONSTRAINT "PayoutLine_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "PayoutLine_payoutId_idx" ON "PayoutLine"("payoutId");
CREATE INDEX "PayoutLine_paymentId_idx" ON "PayoutLine"("paymentId");
