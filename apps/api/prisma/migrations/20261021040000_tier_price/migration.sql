-- Price book por mercado (spec multipais-foundation).
CREATE TABLE "TierPrice" (
    "id" TEXT NOT NULL,
    "tierCode" TEXT NOT NULL,
    "kind" "PlatformSubKind" NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL,
    "countryCode" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    CONSTRAINT "TierPrice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TierPrice_tierCode_kind_billingCycle_countryCode_key" ON "TierPrice"("tierCode", "kind", "billingCycle", "countryCode");
