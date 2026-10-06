-- Intento de pago previo al comprobante (checkout manual): el alumno
-- declara el medio elegido, sale a transferir y vuelve a subir el
-- comprobante. AWAITING queda último en el enum para que
-- `ORDER BY status ASC` siga mostrando PENDING primero en la cola.
ALTER TYPE "ClaimStatus" ADD VALUE 'AWAITING';
ALTER TABLE "PaymentClaim" ALTER COLUMN "receiptKey" DROP NOT NULL;
-- Método elegido: reanuda el intento con los datos vigentes de la academia.
ALTER TABLE "PaymentClaim" ADD COLUMN "methodId" TEXT;
