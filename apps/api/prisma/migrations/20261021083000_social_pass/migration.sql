-- CreateTable
CREATE TABLE "SocialPass" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "stripeSubId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "tierCode" TEXT NOT NULL DEFAULT 'SOCIAL_PASS',
    "creditsPerPeriod" INTEGER NOT NULL DEFAULT 4,
    "creditsBalance" INTEGER NOT NULL DEFAULT 0,
    "lastCreditResetAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SocialPass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPassLedger" (
    "id" TEXT NOT NULL,
    "passId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialPassLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialPass_personId_key" ON "SocialPass"("personId");
CREATE UNIQUE INDEX "SocialPass_stripeSubId_key" ON "SocialPass"("stripeSubId");
CREATE INDEX "SocialPassLedger_personId_createdAt_idx" ON "SocialPassLedger"("personId", "createdAt");
CREATE INDEX "SocialPassLedger_passId_idx" ON "SocialPassLedger"("passId");

-- AddForeignKey
ALTER TABLE "SocialPass" ADD CONSTRAINT "SocialPass_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SocialPassLedger" ADD CONSTRAINT "SocialPassLedger_passId_fkey" FOREIGN KEY ("passId") REFERENCES "SocialPass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SocialPassLedger" ADD CONSTRAINT "SocialPassLedger_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
