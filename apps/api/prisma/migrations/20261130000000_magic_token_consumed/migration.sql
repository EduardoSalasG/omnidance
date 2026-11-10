-- CreateTable
CREATE TABLE "MagicTokenUse" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MagicTokenUse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MagicTokenUse_tokenHash_key" ON "MagicTokenUse"("tokenHash");

-- CreateIndex
CREATE INDEX "MagicTokenUse_email_idx" ON "MagicTokenUse"("email");
