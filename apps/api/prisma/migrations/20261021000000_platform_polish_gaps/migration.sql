-- platform-polish-gaps: opt-out de campañas + recipient por contexto

-- Baja de correos de campaña (link firmado en el footer)
ALTER TABLE "Person" ADD COLUMN "mailOptOutAt" TIMESTAMP(3);

-- Recipient por contexto: dedupKey distingue ciclos de una misma
-- persona dentro del run ("" = audiencia genérica, 1 por persona)
ALTER TABLE "MailCampaignRecipient" ADD COLUMN "dedupKey" TEXT NOT NULL DEFAULT '';
DROP INDEX "MailCampaignRecipient_runId_personId_key";
CREATE UNIQUE INDEX "MailCampaignRecipient_runId_personId_dedupKey_key" ON "MailCampaignRecipient"("runId", "personId", "dedupKey");
