-- CreateEnum
CREATE TYPE "RoleStatus" AS ENUM ('PENDING', 'SANDBOX', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('PERSONA', 'EMPRESA');

-- CreateEnum
CREATE TYPE "Genre" AS ENUM ('SALSA', 'BACHATA', 'CUBANO', 'OTHER');

-- CreateEnum
CREATE TYPE "DanceRole" AS ENUM ('LEADER', 'FOLLOWER', 'SWITCH');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('SOCIAL', 'PRACTICA', 'GALA', 'CONGRESS', 'COMPETITION');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'LIVE', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PassType" AS ENUM ('PAID', 'ARTIST', 'STAFF', 'COMP', 'LIST', 'FREE_WINDOW');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('ACTIVE', 'USED', 'TRANSFERRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('INVITED', 'CONFIRMED', 'DECLINED', 'DISCARDED', 'EXPIRED', 'RATED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'SINGLE', 'CLASS_PACK', 'PERIOD', 'TRIAL');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'TRIAL', 'FROZEN', 'ONLINE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID');

-- CreateEnum
CREATE TYPE "DiscountCodeType" AS ENUM ('CUMPLEANOS', 'CORTESIA', 'CASO_BORDE_PUERTA', 'CAMPAIGN', 'WINBACK', 'STAFF_COMP');

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "name" TEXT NOT NULL,
    "photoUrl" TEXT,
    "instagram" TEXT,
    "passwordHash" TEXT,
    "qrSecret" TEXT NOT NULL,
    "isLightAccount" BOOLEAN NOT NULL DEFAULT false,
    "isDemoAccount" BOOLEAN NOT NULL DEFAULT false,
    "pendingProfileAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "onboarding" JSONB,
    "flowCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "requestable" BOOLEAN NOT NULL DEFAULT false,
    "isSuperuser" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Permission" (
    "key" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleKey" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleKey","permissionKey")
);

-- CreateTable
CREATE TABLE "PersonRole" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" "RoleStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalProfile" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "giro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Style" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "genre" "Genre" NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "Style_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonStyleRole" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "styleId" TEXT NOT NULL,
    "role" "DanceRole" NOT NULL,
    "level" TEXT,

    CONSTRAINT "PersonStyleRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL,
    "aId" TEXT NOT NULL,
    "bId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "capacity" INTEGER,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "logoUrl" TEXT,
    "hours" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "ownerId" TEXT,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSeries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "producerId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "genres" "Genre"[] DEFAULT ARRAY[]::"Genre"[],
    "genreMix" JSONB,
    "program" JSONB,
    "recurrence" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "EventSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT,
    "venueId" TEXT,
    "venueText" TEXT,
    "venueNotes" TEXT,
    "producerId" TEXT,
    "hostId" TEXT,
    "academyId" TEXT,
    "type" "EventType" NOT NULL DEFAULT 'SOCIAL',
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "genres" "Genre"[] DEFAULT ARRAY[]::"Genre"[],
    "genreMix" JSONB,
    "program" JSONB,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER,
    "tablesTotal" INTEGER,
    "tableSeatMax" INTEGER,
    "tableSeatsTotal" INTEGER,
    "presalePrice" INTEGER,
    "doorPrice" INTEGER,
    "presaleCap" INTEGER,
    "doorCap" INTEGER,
    "serviceFeeClp" INTEGER,
    "doorAppFeeClp" INTEGER,
    "doorCashFeeClp" INTEGER,
    "platformFeePct" DOUBLE PRECISION,
    "primeThreshold" INTEGER,
    "happyHourMinutes" INTEGER NOT NULL DEFAULT 30,
    "photosUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rsvp" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rsvp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventDay" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "label" TEXT,

    CONSTRAINT "EventDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleBlock" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "styleId" TEXT,
    "djId" TEXT,

    CONSTRAINT "ScheduleBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventDj" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "slotNote" TEXT,

    CONSTRAINT "EventDj_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntryPass" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" "PassType" NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 0,
    "validUntil" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntryPass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventDayId" TEXT,
    "ownerId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "listPrice" INTEGER NOT NULL,
    "serviceFee" INTEGER NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'ACTIVE',
    "giftedFromId" TEXT,
    "discountCodeId" TEXT,
    "claimToken" TEXT,
    "claimedAt" TIMESTAMP(3),
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checkin" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "passId" TEXT,
    "staffId" TEXT,
    "method" TEXT NOT NULL DEFAULT 'SCAN',
    "inAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "note" TEXT,

    CONSTRAINT "Checkin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAssignment" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'DOOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestList" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "label" TEXT,
    "specialPrice" INTEGER,

    CONSTRAINT "GuestList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestListEntry" (
    "id" TEXT NOT NULL,
    "guestListId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestListEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Waitlist" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeriesPass" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "price" INTEGER NOT NULL,

    CONSTRAINT "SeriesPass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableReservation" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "partySize" INTEGER NOT NULL,
    "tableNo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TableReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueMenu" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "pdfUrl" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "VenueMenu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongSuggestion" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SongSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DanceSession" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "inviteeId" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "status" "SessionStatus" NOT NULL DEFAULT 'INVITED',
    "styleId" TEXT,
    "retroDeclared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DanceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionRating" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "global" INTEGER NOT NULL,
    "connection" INTEGER,
    "comfort" INTEGER,
    "musicality" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRating" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "music" INTEGER,
    "occupation" INTEGER,
    "organization" INTEGER,
    "floorComfort" INTEGER,
    "temperature" INTEGER,
    "lightingSound" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "defaultReward" JSONB,
    "isPlatform" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MissionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mission" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "templateId" TEXT NOT NULL,
    "config" JSONB,
    "reward" JSONB,

    CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionProgress" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MissionProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "rarity" TEXT NOT NULL DEFAULT 'COMMON',

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonBadge" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "PersonBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Streak" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "targetId" TEXT,
    "count" INTEGER NOT NULL DEFAULT 0,
    "lastAt" TIMESTAMP(3),

    CONSTRAINT "Streak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreakFreeze" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "month" TEXT NOT NULL,

    CONSTRAINT "StreakFreeze_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointLedger" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "seasonId" TEXT,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FriendChallenge" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FriendChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrizeDraw" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "drawnAt" TIMESTAMP(3),

    CONSTRAINT "PrizeDraw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NightSummary" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NightSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HappyHourWindow" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "multiplier" INTEGER NOT NULL DEFAULT 2,

    CONSTRAINT "HappyHourWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Academy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "defaultQuorum" INTEGER,
    "description" TEXT,
    "address" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "instagram" TEXT,
    "whatsapp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Academy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyInstructor" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyInstructor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipPlan" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PlanType" NOT NULL,
    "price" INTEGER NOT NULL,
    "classCount" INTEGER,
    "periodDays" INTEGER,
    "description" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "flowPlanId" TEXT,

    CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "planId" TEXT,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassLevel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ClassLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ClassType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassSeries" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "styleId" TEXT,
    "levelId" TEXT,
    "instructorId" TEXT,
    "quorum" INTEGER,
    "dropInPrice" INTEGER,
    "month" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassSeriesType" (
    "seriesId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,

    CONSTRAINT "ClassSeriesType_pkey" PRIMARY KEY ("seriesId","typeId")
);

-- CreateTable
CREATE TABLE "ClassSlot" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "instructorId" TEXT,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "capacity" INTEGER,

    CONSTRAINT "ClassSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassSlotType" (
    "slotId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,

    CONSTRAINT "ClassSlotType_pkey" PRIMARY KEY ("slotId","typeId")
);

-- CreateTable
CREATE TABLE "Class" (
    "id" TEXT NOT NULL,
    "classSlotId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "instructorId" TEXT,
    "capacity" INTEGER,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassBooking" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BOOKED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivateLesson" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "price" INTEGER NOT NULL,
    "commissionPct" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivateLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "classId" TEXT,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "restrictedToAttended" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademySubscription" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademySubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticePartnerRequest" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "styleId" TEXT,
    "role" "DanceRole",
    "level" TEXT,
    "location" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticePartnerRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueRental" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "academyId" TEXT,
    "eventId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "price" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VenueRental_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityToggle" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT false,
    "until" TIMESTAMP(3),
    "location" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilityToggle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserVerification" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Show" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "academyId" TEXT,
    "academy" TEXT NOT NULL,
    "teamType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "slotAt" TIMESTAMP(3),

    CONSTRAINT "Show_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShowPerformer" (
    "id" TEXT NOT NULL,
    "showId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,

    CONSTRAINT "ShowPerformer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "eventId" TEXT,
    "discountCodeId" TEXT,
    "amount" INTEGER NOT NULL,
    "fee" INTEGER NOT NULL,
    "net" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "recipients" JSONB,
    "channel" TEXT,
    "unitListPrice" INTEGER,
    "unitServiceFee" INTEGER,
    "tablePartySize" INTEGER,
    "gateway" TEXT NOT NULL DEFAULT 'FLOW',
    "gatewayRef" TEXT,
    "gatewayFeeClp" INTEGER,
    "gatewayReportedAmount" INTEGER,
    "gatewayMedia" TEXT,
    "gatewayPaidAt" TIMESTAMP(3),
    "gatewayRaw" JSONB,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "gross" INTEGER NOT NULL,
    "platformFee" INTEGER NOT NULL DEFAULT 0,
    "net" INTEGER NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "evidenceUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "DiscountCodeType" NOT NULL,
    "eventId" TEXT,
    "seriesId" TEXT,
    "percentOff" INTEGER,
    "amountOff" INTEGER,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscountCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountRedemption" (
    "id" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "paymentId" TEXT,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscountRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelationshipScore" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "segment" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelationshipScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "segment" JSONB NOT NULL,
    "action" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActorTag" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActorTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmTrigger" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "config" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CrmTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "data" JSONB,
    "channel" TEXT NOT NULL DEFAULT 'IN_APP',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBlock" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "personId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProducerParams" (
    "producerId" TEXT NOT NULL,
    "serviceFeeClp" INTEGER,
    "doorAppFeeClp" INTEGER,
    "doorCashFeeClp" INTEGER,
    "platformFeePct" DOUBLE PRECISION,
    "tablesTotal" INTEGER,
    "tableSeatMax" INTEGER,
    "tableSeatsTotal" INTEGER,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProducerParams_pkey" PRIMARY KEY ("producerId")
);

-- CreateTable
CREATE TABLE "PlatformParam" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformParam_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "roles" TEXT[],
    "intent" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "personId" TEXT,
    "demoToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GatewayTransaction" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "requestBody" JSONB,
    "responseBody" JSONB,
    "httpStatus" INTEGER,
    "durationMs" INTEGER,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GatewayTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "prevHash" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipSubscription" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "flowSubscriptionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_CARD',
    "nextInvoiceAt" TIMESTAMP(3),
    "lastInvoiceId" TEXT,
    "reminderSentFor" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceledAt" TIMESTAMP(3),

    CONSTRAINT "MembershipSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Person_email_key" ON "Person"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Person_phone_key" ON "Person"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "PersonRole_personId_role_key" ON "PersonRole"("personId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalProfile_personId_key" ON "FiscalProfile"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonStyleRole_personId_styleId_role_key" ON "PersonStyleRole"("personId", "styleId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Friendship_aId_bId_key" ON "Friendship"("aId", "bId");

-- CreateIndex
CREATE UNIQUE INDEX "Rsvp_eventId_personId_key" ON "Rsvp"("eventId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "EventDj_eventId_personId_key" ON "EventDj"("eventId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_claimToken_key" ON "Ticket"("claimToken");

-- CreateIndex
CREATE UNIQUE INDEX "StaffAssignment_eventId_personId_key" ON "StaffAssignment"("eventId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "GuestListEntry_guestListId_personId_key" ON "GuestListEntry"("guestListId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "Waitlist_eventId_personId_key" ON "Waitlist"("eventId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "SeriesPass_seriesId_personId_month_key" ON "SeriesPass"("seriesId", "personId", "month");

-- CreateIndex
CREATE INDEX "DanceSession_eventId_status_idx" ON "DanceSession"("eventId", "status");

-- CreateIndex
CREATE INDEX "DanceSession_inviterId_inviteeId_scannedAt_idx" ON "DanceSession"("inviterId", "inviteeId", "scannedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SessionRating_sessionId_raterId_key" ON "SessionRating"("sessionId", "raterId");

-- CreateIndex
CREATE UNIQUE INDEX "EventRating_eventId_raterId_key" ON "EventRating"("eventId", "raterId");

-- CreateIndex
CREATE UNIQUE INDEX "MissionTemplate_key_key" ON "MissionTemplate"("key");

-- CreateIndex
CREATE UNIQUE INDEX "MissionProgress_missionId_personId_key" ON "MissionProgress"("missionId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_key_key" ON "Badge"("key");

-- CreateIndex
CREATE UNIQUE INDEX "PersonBadge_personId_badgeId_key" ON "PersonBadge"("personId", "badgeId");

-- CreateIndex
CREATE UNIQUE INDEX "Streak_personId_type_targetId_key" ON "Streak"("personId", "type", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "StreakFreeze_personId_month_key" ON "StreakFreeze"("personId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "PointLedger_personId_reason_refType_refId_key" ON "PointLedger"("personId", "reason", "refType", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "NightSummary_personId_eventId_key" ON "NightSummary"("personId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyInstructor_academyId_personId_key" ON "AcademyInstructor"("academyId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassLevel_name_key" ON "ClassLevel"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ClassType_name_key" ON "ClassType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ClassBooking_classId_personId_key" ON "ClassBooking"("classId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_classId_personId_key" ON "Attendance"("classId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilityToggle_personId_key" ON "AvailabilityToggle"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "ShowPerformer_showId_personId_key" ON "ShowPerformer"("showId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_refId_key" ON "Payment"("refId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountCode_code_key" ON "DiscountCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "RelationshipScore_actorType_actorId_personId_key" ON "RelationshipScore"("actorType", "actorId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "UserBlock_blockerId_blockedId_key" ON "UserBlock"("blockerId", "blockedId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_type_createdAt_idx" ON "AnalyticsEvent"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_email_key" ON "Lead"("email");

-- CreateIndex
CREATE INDEX "GatewayTransaction_correlationId_idx" ON "GatewayTransaction"("correlationId");

-- CreateIndex
CREATE INDEX "GatewayTransaction_paymentId_idx" ON "GatewayTransaction"("paymentId");

-- CreateIndex
CREATE INDEX "GatewayTransaction_createdAt_idx" ON "GatewayTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "PaymentEvent_paymentId_idx" ON "PaymentEvent"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_paymentId_seq_key" ON "PaymentEvent"("paymentId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipSubscription_flowSubscriptionId_key" ON "MembershipSubscription"("flowSubscriptionId");

-- CreateIndex
CREATE INDEX "MembershipSubscription_personId_idx" ON "MembershipSubscription"("personId");

-- CreateIndex
CREATE INDEX "MembershipSubscription_academyId_idx" ON "MembershipSubscription"("academyId");

-- CreateIndex
CREATE INDEX "MembershipSubscription_status_nextInvoiceAt_idx" ON "MembershipSubscription"("status", "nextInvoiceAt");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleKey_fkey" FOREIGN KEY ("roleKey") REFERENCES "Role"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionKey_fkey" FOREIGN KEY ("permissionKey") REFERENCES "Permission"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonRole" ADD CONSTRAINT "PersonRole_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonRole" ADD CONSTRAINT "PersonRole_role_fkey" FOREIGN KEY ("role") REFERENCES "Role"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalProfile" ADD CONSTRAINT "FiscalProfile_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Style" ADD CONSTRAINT "Style_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Style"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonStyleRole" ADD CONSTRAINT "PersonStyleRole_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonStyleRole" ADD CONSTRAINT "PersonStyleRole_styleId_fkey" FOREIGN KEY ("styleId") REFERENCES "Style"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSeries" ADD CONSTRAINT "EventSeries_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "EventSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rsvp" ADD CONSTRAINT "Rsvp_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rsvp" ADD CONSTRAINT "Rsvp_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventDay" ADD CONSTRAINT "EventDay_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_styleId_fkey" FOREIGN KEY ("styleId") REFERENCES "Style"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventDj" ADD CONSTRAINT "EventDj_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventDj" ADD CONSTRAINT "EventDj_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestListEntry" ADD CONSTRAINT "GuestListEntry_guestListId_fkey" FOREIGN KEY ("guestListId") REFERENCES "GuestList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesPass" ADD CONSTRAINT "SeriesPass_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "EventSeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueMenu" ADD CONSTRAINT "VenueMenu_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionRating" ADD CONSTRAINT "SessionRating_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DanceSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MissionTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionProgress" ADD CONSTRAINT "MissionProgress_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyInstructor" ADD CONSTRAINT "AcademyInstructor_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPlan" ADD CONSTRAINT "MembershipPlan_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MembershipPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSeries" ADD CONSTRAINT "ClassSeries_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSeries" ADD CONSTRAINT "ClassSeries_styleId_fkey" FOREIGN KEY ("styleId") REFERENCES "Style"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSeries" ADD CONSTRAINT "ClassSeries_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "ClassLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSeriesType" ADD CONSTRAINT "ClassSeriesType_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "ClassSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSeriesType" ADD CONSTRAINT "ClassSeriesType_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ClassType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSlot" ADD CONSTRAINT "ClassSlot_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSlot" ADD CONSTRAINT "ClassSlot_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "ClassSeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSlotType" ADD CONSTRAINT "ClassSlotType_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "ClassSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSlotType" ADD CONSTRAINT "ClassSlotType_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ClassType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_classSlotId_fkey" FOREIGN KEY ("classSlotId") REFERENCES "ClassSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassBooking" ADD CONSTRAINT "ClassBooking_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueRental" ADD CONSTRAINT "VenueRental_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Show" ADD CONSTRAINT "Show_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowPerformer" ADD CONSTRAINT "ShowPerformer_showId_fkey" FOREIGN KEY ("showId") REFERENCES "Show"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRedemption" ADD CONSTRAINT "DiscountRedemption_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "DiscountCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipSubscription" ADD CONSTRAINT "MembershipSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MembershipPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

┌─────────────────────────────────────────────────────────┐
│  Update available 5.22.0 -> 8.0.0-rc.17                 │
│                                                         │
│  This is a major update - please follow the guide at    │
│  https://pris.ly/d/major-version-upgrade                │
│                                                         │
│  Run the following to update                            │
│    npm i --save-dev prisma@latest                       │
│    npm i @prisma/client@latest                          │
└─────────────────────────────────────────────────────────┘
