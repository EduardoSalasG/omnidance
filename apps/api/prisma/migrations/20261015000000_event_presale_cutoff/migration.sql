-- Corte de preventa parametrizable por evento y por productor (spec
-- event-presale-cutoff): minutos desde medianoche del día del evento
-- (0-2879; >1439 = post-medianoche). null = heredar el nivel superior
-- (evento → productor → global presale.cutoff_hour).
ALTER TABLE "Event" ADD COLUMN "presaleCutoffMinutes" INTEGER;
ALTER TABLE "ProducerParams" ADD COLUMN "presaleCutoffMinutes" INTEGER;
