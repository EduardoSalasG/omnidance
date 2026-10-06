-- CreateTable
CREATE TABLE "ScheduledJob" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "cronExpr" TEXT NOT NULL,
    "defaultCron" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Santiago',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "orphaned" BOOLEAN NOT NULL DEFAULT false,
    "runningRunId" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "nextRunAt" TIMESTAMP(3),
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "actorId" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "meta" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "htmlBody" TEXT NOT NULL,
    "audience" JSONB NOT NULL,
    "scheduleKind" TEXT NOT NULL,
    "runAt" TIMESTAMP(3),
    "cronExpr" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Santiago',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailCampaignRun" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "MailCampaignRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailCampaignRecipient" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "MailCampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledJob_key_key" ON "ScheduledJob"("key");

-- CreateIndex
CREATE INDEX "JobRun_jobId_startedAt_idx" ON "JobRun"("jobId", "startedAt");

-- CreateIndex
CREATE INDEX "MailCampaign_status_nextRunAt_idx" ON "MailCampaign"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "MailCampaignRun_campaignId_startedAt_idx" ON "MailCampaignRun"("campaignId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MailCampaignRecipient_runId_personId_key" ON "MailCampaignRecipient"("runId", "personId");

-- AddForeignKey
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ScheduledJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailCampaign" ADD CONSTRAINT "MailCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailCampaignRun" ADD CONSTRAINT "MailCampaignRun_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MailCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailCampaignRecipient" ADD CONSTRAINT "MailCampaignRecipient_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MailCampaignRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
