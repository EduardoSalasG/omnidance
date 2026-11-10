-- Fuente de adquisición orgánica (spec auth/acquisition-source):
-- Person.acquisitionSource (canal normalizado) + acquisitionDetail
-- (capture crudo); AuthOtp.acquisition (viaja como role/next).
ALTER TABLE "AuthOtp" ADD COLUMN "acquisition" JSONB;
ALTER TABLE "Person" ADD COLUMN "acquisitionDetail" JSONB,
ADD COLUMN "acquisitionSource" TEXT;
