-- academy-renewal-reminders: dedup de avisos por ciclo de vigencia.
ALTER TABLE "Enrollment" ADD COLUMN "reminderExpiringFor" TIMESTAMP(3);
ALTER TABLE "Enrollment" ADD COLUMN "reminderExpiredFor" TIMESTAMP(3);
