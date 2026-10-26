-- Moneda por mercado (spec multipais-currency): Country.currency como
-- fuente de la moneda de cobro; currency en el dominio de membresías
-- (plan/sub/claim) y país de cobro en PlatformSubscription.
ALTER TABLE "Country" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'CLP';
ALTER TABLE "MembershipPlan" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'CLP';
ALTER TABLE "MembershipPlan" ADD COLUMN "remoteRefs" JSONB;
ALTER TABLE "MembershipSubscription" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'CLP';
ALTER TABLE "PaymentClaim" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'CLP';
ALTER TABLE "PlatformSubscription" ADD COLUMN "countryCode" TEXT NOT NULL DEFAULT 'CL';

-- Backfill: moneda ISO-4217 por código de país (EUR compartida por los
-- países euro sembrados - el precio exacto lo da TierPrice).
UPDATE "Country" SET "currency" = 'CLP' WHERE "code" = 'CL';
UPDATE "Country" SET "currency" = 'EUR' WHERE "code" IN ('ES', 'DE', 'FR', 'PT', 'IT');
UPDATE "Country" SET "currency" = 'ARS' WHERE "code" = 'AR';
UPDATE "Country" SET "currency" = 'MXN' WHERE "code" = 'MX';
UPDATE "Country" SET "currency" = 'PEN' WHERE "code" = 'PE';
UPDATE "Country" SET "currency" = 'COP' WHERE "code" = 'CO';
UPDATE "Country" SET "currency" = 'USD' WHERE "code" = 'US';
