-- AlterTable: cambio de plan pendiente (downgrade/cambio de ciclo se aplica
-- al inicio del próximo ciclo; el reconcile cancela la Flow sub al fin de
-- período y crea la nueva sobre el plan del tier pendiente).
ALTER TABLE "PlatformSubscription" ADD COLUMN     "pendingTierCode" TEXT,
ADD COLUMN     "pendingBillingCycle" "BillingCycle";
