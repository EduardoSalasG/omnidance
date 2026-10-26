-- Customer de suscripciones por proveedor (spec multipais-currency):
-- Person.gatewayCustomerIds = {"<GATEWAY>": customerId}. La columna
-- flowCustomerId queda como espejo legacy del customer FLOW.
ALTER TABLE "Person" ADD COLUMN "gatewayCustomerIds" JSONB;

-- Backfill: los customerId existentes son todos de Flow.
UPDATE "Person"
SET "gatewayCustomerIds" = jsonb_build_object('FLOW', "flowCustomerId")
WHERE "flowCustomerId" IS NOT NULL;
