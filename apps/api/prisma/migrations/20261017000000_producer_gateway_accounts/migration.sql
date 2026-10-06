-- CreateTable
CREATE TABLE "ProducerGatewayAccount" (
    "id" TEXT NOT NULL,
    "producerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "credentialsEnc" TEXT NOT NULL,
    "keyMask" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastError" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProducerGatewayAccount_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "gatewayAccountId" TEXT;

-- AlterTable
ALTER TABLE "GatewayTransaction" ADD COLUMN     "gatewayAccountId" TEXT;

-- CreateIndex
CREATE INDEX "ProducerGatewayAccount_producerId_status_idx" ON "ProducerGatewayAccount"("producerId", "status");

-- CreateIndex
CREATE INDEX "GatewayTransaction_gatewayAccountId_idx" ON "GatewayTransaction"("gatewayAccountId");

-- AddForeignKey
ALTER TABLE "ProducerGatewayAccount" ADD CONSTRAINT "ProducerGatewayAccount_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_gatewayAccountId_fkey" FOREIGN KEY ("gatewayAccountId") REFERENCES "ProducerGatewayAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
