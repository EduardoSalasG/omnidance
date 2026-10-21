-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "jurisdiction" TEXT;

-- CreateTable
CREATE TABLE "LegalText" (
    "id" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "requiredScopes" TEXT[] DEFAULT ARRAY['essential']::TEXT[],
    "granular" BOOLEAN NOT NULL DEFAULT false,
    "draftNote" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalText_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "scopes" JSONB NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegalText_jurisdiction_active_idx" ON "LegalText"("jurisdiction", "active");
CREATE UNIQUE INDEX "LegalText_jurisdiction_version_key" ON "LegalText"("jurisdiction", "version");
CREATE INDEX "ConsentRecord_personId_acceptedAt_idx" ON "ConsentRecord"("personId", "acceptedAt");

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
