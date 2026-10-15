-- CreateTable
CREATE TABLE "ActorSegment" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rules" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActorSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActorSegmentMembership" (
    "id" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActorSegmentMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActorSegment_actorType_actorId_name_key" ON "ActorSegment"("actorType", "actorId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ActorSegmentMembership_segmentId_personId_key" ON "ActorSegmentMembership"("segmentId", "personId");

-- AddForeignKey
ALTER TABLE "ActorSegmentMembership" ADD CONSTRAINT "ActorSegmentMembership_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "ActorSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
