-- CreateTable
CREATE TABLE "MailCampaignSent" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailCampaignSent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MailCampaignSent_campaignId_dedupKey_key" ON "MailCampaignSent"("campaignId", "dedupKey");

-- CreateIndex
CREATE INDEX "MailCampaignSent_campaignId_idx" ON "MailCampaignSent"("campaignId");

-- AddForeignKey
ALTER TABLE "MailCampaignSent" ADD CONSTRAINT "MailCampaignSent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MailCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
