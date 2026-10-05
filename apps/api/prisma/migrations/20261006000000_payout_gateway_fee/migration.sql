-- AlterTable: línea GATEWAY_FEE_PASSTHROUGH de la liquidación de academia
-- (spec academy-saas-billing, S4): el costo Flow se descuenta del payout
-- como línea explícita separada del net — nunca escondida en platformFee.
ALTER TABLE "Payout" ADD COLUMN     "gatewayFee" INTEGER NOT NULL DEFAULT 0;
