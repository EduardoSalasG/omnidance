-- ═══════════════════════════════════════════════════════════════════
-- Seed manual: Jorge Camacho <jokcar12345@gmail.com>
-- Replica el bloque dedicado de apps/api/prisma/seed-dev.ts sin correr
-- todo el seed. Idempotente (NOT EXISTS / ON CONFLICT) - re-ejecutable.
--
-- Requisito: dataset dev ya sembrado (academia "Erick Baez" con clases
-- materializadas, eventos demo y personas *@omnidance.dev).
--
-- Correr:
--   docker exec -i omnidance-db psql -U omnidance -d omnidance < apps/api/prisma/seed-jorge-camacho.sql
--   (o pegarlo en cualquier cliente SQL / psql contra la DATABASE_URL)
--
-- No cubre: puntos de temporada, rachas y badges (PointLedger/Streak/
-- PersonBadge) - el dominio los otorga lazy al usar la app, o se
-- materializan en la próxima corrida completa del seed.
-- ═══════════════════════════════════════════════════════════════════
BEGIN;

-- ─── 1) Persona + rol DANCER aprobado ───
INSERT INTO "Person" (id, email, name, gender, "qrSecret", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'jokcar12345@gmail.com', 'Jorge Camacho', 'M',
       gen_random_uuid()::text, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "Person" WHERE email = 'jokcar12345@gmail.com');
UPDATE "Person" SET name = 'Jorge Camacho', gender = 'M', "updatedAt" = now()
WHERE email = 'jokcar12345@gmail.com';

INSERT INTO "PersonRole" (id, "personId", role, status)
SELECT gen_random_uuid()::text, id, 'DANCER', 'APPROVED'
FROM "Person" WHERE email = 'jokcar12345@gmail.com'
ON CONFLICT ("personId", role) DO UPDATE SET status = 'APPROVED';

-- ─── 2) Estilos autodeclarados (perfil del amigo) ───
INSERT INTO "PersonStyleRole" (id, "personId", "styleId", role, level)
SELECT gen_random_uuid()::text, p.id, s.id, 'LEADER', 'básico'
FROM "Person" p JOIN "Style" s ON s.name = 'Mambo on2'
WHERE p.email = 'jokcar12345@gmail.com'
ON CONFLICT ("personId", "styleId", role) DO UPDATE SET level = 'básico';
INSERT INTO "PersonStyleRole" (id, "personId", "styleId", role, level)
SELECT gen_random_uuid()::text, p.id, s.id, 'LEADER', 'principiante'
FROM "Person" p JOIN "Style" s ON s.name = 'Bachata sensual'
WHERE p.email = 'jokcar12345@gmail.com'
ON CONFLICT ("personId", "styleId", role) DO UPDATE SET level = 'principiante';

-- ─── 3) Plan de 2 clases/semana en Erick Baez (vigente, +20d) ───
INSERT INTO "Enrollment" (id, "academyId", "personId", "planId", status, "startedAt", "endsAt")
SELECT gen_random_uuid()::text, a.id, p.id, mp.id, 'ACTIVE',
       now() - interval '30 days', now() + interval '20 days'
FROM "Person" p
CROSS JOIN "Academy" a
JOIN "MembershipPlan" mp ON mp."academyId" = a.id AND mp."weeklyClasses" = 2 AND mp.active
WHERE p.email = 'jokcar12345@gmail.com' AND a.name = 'Erick Baez'
  AND NOT EXISTS (
    SELECT 1 FROM "Enrollment" e WHERE e."academyId" = a.id AND e."personId" = p.id
  );
-- Si ya existe: mismo update que enroll() del seed.
UPDATE "Enrollment" e
SET "planId" = mp.id, status = 'ACTIVE', "endsAt" = now() + interval '20 days'
FROM "Person" p
CROSS JOIN "Academy" a
JOIN "MembershipPlan" mp ON mp."academyId" = a.id AND mp."weeklyClasses" = 2 AND mp.active
WHERE e."academyId" = a.id AND e."personId" = p.id
  AND a.name = 'Erick Baez' AND p.email = 'jokcar12345@gmail.com';

-- ─── 4) Claim aprobado + Payment MANUAL (misma forma que claims.approve) ───
-- Guard por clave natural (academia+persona+plan APPROVED), igual que el
-- seed - si el claim ya existe (sea cual sea su id) no se duplica.
INSERT INTO "PaymentClaim" (id, "academyId", "personId", "enrollmentId", "planId",
                            amount, "methodType", "methodLabel", status,
                            "reviewedById", "reviewedAt", "createdAt")
SELECT 'sql-jorge-claim-erickbaez', a.id, p.id, e.id, mp.id, mp.price,
       'TRANSFER', 'Transferencia', 'APPROVED',
       a."ownerId", now() - interval '30 days', now() - interval '30 days'
FROM "Person" p
CROSS JOIN "Academy" a
JOIN "MembershipPlan" mp ON mp."academyId" = a.id AND mp."weeklyClasses" = 2 AND mp.active
JOIN "Enrollment" e ON e."academyId" = a.id AND e."personId" = p.id
WHERE p.email = 'jokcar12345@gmail.com' AND a.name = 'Erick Baez'
  AND NOT EXISTS (
    SELECT 1 FROM "PaymentClaim" pc
    WHERE pc."academyId" = a.id AND pc."personId" = p.id
      AND pc."planId" = mp.id AND pc.status = 'APPROVED'
  )
ON CONFLICT (id) DO NOTHING;

-- Pago solo si la persona no tiene ya un MEMBERSHIP (el plan se paga una vez).
INSERT INTO "Payment" (id, "orderType", "refId", "personId", amount, fee, net,
                       gateway, status, "feeMode", "platformFeeNetClp",
                       "platformFeeVatClp", "gatewayFeeExpected", "producerNetClp",
                       "createdAt")
SELECT 'sql-jorge-pay-erickbaez', 'MEMBERSHIP', 'claim-sql-jorge-claim-erickbaez',
       p.id, mp.price, 0, mp.price, 'MANUAL', 'PAID', 'ACADEMY', 0, 0, 0, mp.price,
       now() - interval '30 days'
FROM "Person" p
CROSS JOIN "Academy" a
JOIN "MembershipPlan" mp ON mp."academyId" = a.id AND mp."weeklyClasses" = 2 AND mp.active
WHERE p.email = 'jokcar12345@gmail.com' AND a.name = 'Erick Baez'
  AND NOT EXISTS (
    SELECT 1 FROM "Payment" pay
    WHERE pay."personId" = p.id AND pay."orderType" = 'MEMBERSHIP'
  )
ON CONFLICT (id) DO NOTHING;

UPDATE "PaymentClaim" SET "paymentId" = 'sql-jorge-pay-erickbaez'
WHERE id = 'sql-jorge-claim-erickbaez' AND "paymentId" IS NULL;

-- ─── 5) Todas las clases de Erick Baez reservadas; pasadas con asistencia ───
INSERT INTO "ClassBooking" (id, "classId", "personId", status)
SELECT gen_random_uuid()::text, c.id, p.id, 'BOOKED'
FROM "Person" p
CROSS JOIN "Class" c
JOIN "ClassSlot" s ON s.id = c."classSlotId"
JOIN "ClassSeries" cs ON cs.id = s."seriesId" AND cs."deletedAt" IS NULL
WHERE p.email = 'jokcar12345@gmail.com'
  AND s."academyId" = (SELECT id FROM "Academy" WHERE name = 'Erick Baez')
ON CONFLICT ("classId", "personId") DO NOTHING;

INSERT INTO "Attendance" (id, "classId", "personId", "checkedAt")
SELECT gen_random_uuid()::text, c.id, p.id, c.date
FROM "Person" p
CROSS JOIN "Class" c
JOIN "ClassSlot" s ON s.id = c."classSlotId"
JOIN "ClassSeries" cs ON cs.id = s."seriesId" AND cs."deletedAt" IS NULL
WHERE p.email = 'jokcar12345@gmail.com'
  AND s."academyId" = (SELECT id FROM "Academy" WHERE name = 'Erick Baez')
  AND c.date <= now()
ON CONFLICT ("classId", "personId") DO NOTHING;

-- ─── 6) Entradas: edición pasada y Desafío de Tronos (USED) + próxima Bachatamanía (ACTIVE) ───
INSERT INTO "Ticket" (id, "eventId", "ownerId", "buyerId", "listPrice", "serviceFee", status)
SELECT gen_random_uuid()::text, e.id, p.id, p.id, 5000, 500, 'USED'
FROM "Person" p, "Event" e
WHERE p.email = 'jokcar12345@gmail.com' AND e.name = 'Bachatamanía - edición anterior'
  AND NOT EXISTS (SELECT 1 FROM "Ticket" t WHERE t."eventId" = e.id AND t."ownerId" = p.id);
INSERT INTO "Payment" (id, "orderType", "refId", "personId", "eventId", amount, fee, net,
                       status, "createdAt")
SELECT gen_random_uuid()::text, 'TICKET', 'sql-jorge-ticket-prev', p.id, e.id,
       5500, 200, 5300, 'PAID', e."startsAt" - interval '3 days'
FROM "Person" p, "Event" e
WHERE p.email = 'jokcar12345@gmail.com' AND e.name = 'Bachatamanía - edición anterior'
  AND NOT EXISTS (
    SELECT 1 FROM "Payment" pay
    WHERE pay."personId" = p.id AND pay."eventId" = e.id AND pay."orderType" = 'TICKET'
  )
ON CONFLICT ("refId") DO NOTHING;

INSERT INTO "Ticket" (id, "eventId", "ownerId", "buyerId", "listPrice", "serviceFee", status)
SELECT gen_random_uuid()::text, e.id, p.id, p.id, 6000, 600, 'USED'
FROM "Person" p, "Event" e
WHERE p.email = 'jokcar12345@gmail.com' AND e.name = 'Desafío de Tronos - edición anterior'
  AND NOT EXISTS (SELECT 1 FROM "Ticket" t WHERE t."eventId" = e.id AND t."ownerId" = p.id);
INSERT INTO "Payment" (id, "orderType", "refId", "personId", "eventId", amount, fee, net,
                       status, "createdAt")
SELECT gen_random_uuid()::text, 'TICKET', 'sql-jorge-ticket-desafio', p.id, e.id,
       6600, 240, 6360, 'PAID', e."startsAt" - interval '4 days'
FROM "Person" p, "Event" e
WHERE p.email = 'jokcar12345@gmail.com' AND e.name = 'Desafío de Tronos - edición anterior'
  AND NOT EXISTS (
    SELECT 1 FROM "Payment" pay
    WHERE pay."personId" = p.id AND pay."eventId" = e.id AND pay."orderType" = 'TICKET'
  )
ON CONFLICT ("refId") DO NOTHING;

INSERT INTO "Ticket" (id, "eventId", "ownerId", "buyerId", "listPrice", "serviceFee", status)
SELECT gen_random_uuid()::text, e.id, p.id, p.id, 5000, 300, 'ACTIVE'
FROM "Person" p, "Event" e
WHERE p.email = 'jokcar12345@gmail.com' AND e.name = 'Bachatamanía' AND e.status = 'PUBLISHED'
  AND NOT EXISTS (
    SELECT 1 FROM "Ticket" t
    WHERE t."eventId" = e.id AND t."ownerId" = p.id AND t.status = 'ACTIVE'
  );
INSERT INTO "Payment" (id, "orderType", "refId", "personId", "eventId", amount, fee, net, status)
SELECT gen_random_uuid()::text, 'TICKET', 'sql-jorge-ticket-bachatamania', p.id, e.id,
       5300, 190, 5110, 'PAID'
FROM "Person" p, "Event" e
WHERE p.email = 'jokcar12345@gmail.com' AND e.name = 'Bachatamanía' AND e.status = 'PUBLISHED'
  AND NOT EXISTS (
    SELECT 1 FROM "Payment" pay
    WHERE pay."personId" = p.id AND pay."eventId" = e.id AND pay."orderType" = 'TICKET'
  )
ON CONFLICT ("refId") DO NOTHING;

-- ─── 7) Check-ins a sociales ───
-- Edición pasada (+90 min del inicio)
INSERT INTO "Checkin" (id, "eventId", "personId", "staffId", method, "inAt")
SELECT gen_random_uuid()::text, e.id, p.id, st.id, 'SCAN', e."startsAt" + interval '90 minutes'
FROM "Person" p, "Event" e, "Person" st
WHERE p.email = 'jokcar12345@gmail.com' AND st.email = 'staff@omnidance.dev'
  AND e.name = 'Bachatamanía - edición anterior'
  AND NOT EXISTS (SELECT 1 FROM "Checkin" c WHERE c."eventId" = e.id AND c."personId" = p.id);
-- Desafío de Tronos pasado (+90 min)
INSERT INTO "Checkin" (id, "eventId", "personId", "staffId", method, "inAt")
SELECT gen_random_uuid()::text, e.id, p.id, st.id, 'SCAN', e."startsAt" + interval '90 minutes'
FROM "Person" p, "Event" e, "Person" st
WHERE p.email = 'jokcar12345@gmail.com' AND st.email = 'staff@omnidance.dev'
  AND e.name = 'Desafío de Tronos - edición anterior'
  AND NOT EXISTS (SELECT 1 FROM "Checkin" c WHERE c."eventId" = e.id AND c."personId" = p.id);
-- Ediciones -2 y -3: check-in temprano 21:30 del día del evento (badge madrugador)
INSERT INTO "Checkin" (id, "eventId", "personId", "staffId", method, "inAt")
SELECT gen_random_uuid()::text, e.id, p.id, st.id, 'SCAN',
       date_trunc('day', e."startsAt") + interval '21 hours 30 minutes'
FROM "Person" p, "Event" e, "Person" st
WHERE p.email = 'jokcar12345@gmail.com' AND st.email = 'staff@omnidance.dev'
  AND e.name IN ('Bachatamanía - hace 2 semanas', 'Bachatamanía - hace 3 semanas')
  AND NOT EXISTS (SELECT 1 FROM "Checkin" c WHERE c."eventId" = e.id AND c."personId" = p.id);
-- Social en vivo (esta noche, hace ~1h)
INSERT INTO "Checkin" (id, "eventId", "personId", "staffId", method, "inAt")
SELECT gen_random_uuid()::text, e.id, p.id, st.id, 'SCAN', now() - interval '1 hour'
FROM "Person" p, "Event" e, "Person" st
WHERE p.email = 'jokcar12345@gmail.com' AND st.email = 'staff@omnidance.dev'
  AND e.name = 'Social en vivo - demo'
  AND NOT EXISTS (SELECT 1 FROM "Checkin" c WHERE c."eventId" = e.id AND c."personId" = p.id);

-- ─── 8) Bailes (DanceSession + ratings) ───
-- Guard por par (eventId, inviterId, inviteeId), igual que session() del
-- seed - si la pareja ya bailó en ese evento (cualquier id) no duplica.
-- Edición pasada
INSERT INTO "DanceSession" (id, "eventId", "inviterId", "inviteeId", "scannedAt", "confirmedAt", status, "styleId")
SELECT 'sql-jorge-ds-1', e.id, p.id, pa.id, e."startsAt" + interval '85 minutes',
       e."startsAt" + interval '85 minutes 30 seconds', 'RATED',
       (SELECT id FROM "Style" WHERE name = 'Bachata sensual')
FROM "Person" p, "Event" e, "Person" pa
WHERE p.email = 'jokcar12345@gmail.com' AND pa.email = 'camila@omnidance.dev'
  AND e.name = 'Bachatamanía - edición anterior'
  AND NOT EXISTS (
    SELECT 1 FROM "DanceSession" ds
    WHERE ds."eventId" = e.id AND ds."inviterId" = p.id AND ds."inviteeId" = pa.id
  )
ON CONFLICT (id) DO NOTHING;
INSERT INTO "DanceSession" (id, "eventId", "inviterId", "inviteeId", "scannedAt", "confirmedAt", status, "styleId")
SELECT 'sql-jorge-ds-2', e.id, pa.id, p.id, e."startsAt" + interval '135 minutes',
       e."startsAt" + interval '135 minutes 30 seconds', 'CONFIRMED',
       (SELECT id FROM "Style" WHERE name = 'Mambo on2')
FROM "Person" p, "Event" e, "Person" pa
WHERE p.email = 'jokcar12345@gmail.com' AND pa.email = 'antonia@omnidance.dev'
  AND e.name = 'Bachatamanía - edición anterior'
  AND NOT EXISTS (
    SELECT 1 FROM "DanceSession" ds
    WHERE ds."eventId" = e.id AND ds."inviterId" = pa.id AND ds."inviteeId" = p.id
  )
ON CONFLICT (id) DO NOTHING;
INSERT INTO "DanceSession" (id, "eventId", "inviterId", "inviteeId", "scannedAt", "confirmedAt", status, "styleId")
SELECT 'sql-jorge-ds-3', e.id, p.id, pa.id, e."startsAt" + interval '175 minutes',
       e."startsAt" + interval '175 minutes 30 seconds', 'CONFIRMED',
       (SELECT id FROM "Style" WHERE name = 'Bachata tradicional')
FROM "Person" p, "Event" e, "Person" pa
WHERE p.email = 'jokcar12345@gmail.com' AND pa.email = 'daniela@omnidance.dev'
  AND e.name = 'Bachatamanía - edición anterior'
  AND NOT EXISTS (
    SELECT 1 FROM "DanceSession" ds
    WHERE ds."eventId" = e.id AND ds."inviterId" = p.id AND ds."inviteeId" = pa.id
  )
ON CONFLICT (id) DO NOTHING;
-- Social en vivo
INSERT INTO "DanceSession" (id, "eventId", "inviterId", "inviteeId", "scannedAt", "confirmedAt", status, "styleId")
SELECT 'sql-jorge-ds-4', e.id, p.id, pa.id, e."startsAt" + interval '65 minutes',
       e."startsAt" + interval '65 minutes 30 seconds', 'CONFIRMED',
       (SELECT id FROM "Style" WHERE name = 'Mambo on2')
FROM "Person" p, "Event" e, "Person" pa
WHERE p.email = 'jokcar12345@gmail.com' AND pa.email = 'josefa@omnidance.dev'
  AND e.name = 'Social en vivo - demo'
  AND NOT EXISTS (
    SELECT 1 FROM "DanceSession" ds
    WHERE ds."eventId" = e.id AND ds."inviterId" = p.id AND ds."inviteeId" = pa.id
  )
ON CONFLICT (id) DO NOTHING;
-- Edición -2
INSERT INTO "DanceSession" (id, "eventId", "inviterId", "inviteeId", "scannedAt", "confirmedAt", status, "styleId")
SELECT 'sql-jorge-ds-5', e.id, pa.id, p.id, e."startsAt" + interval '110 minutes',
       e."startsAt" + interval '110 minutes 30 seconds', 'RATED',
       (SELECT id FROM "Style" WHERE name = 'Salsa cubana (casino)')
FROM "Person" p, "Event" e, "Person" pa
WHERE p.email = 'jokcar12345@gmail.com' AND pa.email = 'josefa@omnidance.dev'
  AND e.name = 'Bachatamanía - hace 2 semanas'
  AND NOT EXISTS (
    SELECT 1 FROM "DanceSession" ds
    WHERE ds."eventId" = e.id AND ds."inviterId" = pa.id AND ds."inviteeId" = p.id
  )
ON CONFLICT (id) DO NOTHING;
INSERT INTO "DanceSession" (id, "eventId", "inviterId", "inviteeId", "scannedAt", "confirmedAt", status, "styleId")
SELECT 'sql-jorge-ds-6', e.id, p.id, pa.id, e."startsAt" + interval '200 minutes',
       e."startsAt" + interval '200 minutes 30 seconds', 'CONFIRMED',
       (SELECT id FROM "Style" WHERE name = 'Mambo on2')
FROM "Person" p, "Event" e, "Person" pa
WHERE p.email = 'jokcar12345@gmail.com' AND pa.email = 'monica@omnidance.cl'
  AND e.name = 'Bachatamanía - hace 2 semanas'
  AND NOT EXISTS (
    SELECT 1 FROM "DanceSession" ds
    WHERE ds."eventId" = e.id AND ds."inviterId" = p.id AND ds."inviteeId" = pa.id
  )
ON CONFLICT (id) DO NOTHING;
-- Edición -3
INSERT INTO "DanceSession" (id, "eventId", "inviterId", "inviteeId", "scannedAt", "confirmedAt", status, "styleId")
SELECT 'sql-jorge-ds-7', e.id, p.id, pa.id, e."startsAt" + interval '115 minutes',
       e."startsAt" + interval '115 minutes 30 seconds', 'CONFIRMED',
       (SELECT id FROM "Style" WHERE name = 'Bachata sensual')
FROM "Person" p, "Event" e, "Person" pa
WHERE p.email = 'jokcar12345@gmail.com' AND pa.email = 'josefa@omnidance.dev'
  AND e.name = 'Bachatamanía - hace 3 semanas'
  AND NOT EXISTS (
    SELECT 1 FROM "DanceSession" ds
    WHERE ds."eventId" = e.id AND ds."inviterId" = p.id AND ds."inviteeId" = pa.id
  )
ON CONFLICT (id) DO NOTHING;

-- Ratings de las sesiones RATED - se enlazan a la sesión real del par
-- (cualquiera sea su id: la que creó este script o la del seed).
INSERT INTO "SessionRating" (id, "sessionId", "raterId", global, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, ds.id, rater.id, 4, now(), now()
FROM "Person" rater
CROSS JOIN "DanceSession" ds
JOIN "Event" e ON e.id = ds."eventId" AND e.name = 'Bachatamanía - edición anterior'
JOIN "Person" i ON i.id = ds."inviterId" AND i.email = 'jokcar12345@gmail.com'
JOIN "Person" v ON v.id = ds."inviteeId" AND v.email = 'camila@omnidance.dev'
WHERE rater.email = 'jokcar12345@gmail.com'
ON CONFLICT ("sessionId", "raterId") DO NOTHING;
INSERT INTO "SessionRating" (id, "sessionId", "raterId", global, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, ds.id, rater.id, 5, now(), now()
FROM "Person" rater
CROSS JOIN "DanceSession" ds
JOIN "Event" e ON e.id = ds."eventId" AND e.name = 'Bachatamanía - edición anterior'
JOIN "Person" i ON i.id = ds."inviterId" AND i.email = 'jokcar12345@gmail.com'
JOIN "Person" v ON v.id = ds."inviteeId" AND v.email = 'camila@omnidance.dev'
WHERE rater.email = 'camila@omnidance.dev'
ON CONFLICT ("sessionId", "raterId") DO NOTHING;
INSERT INTO "SessionRating" (id, "sessionId", "raterId", global, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, ds.id, rater.id, 5, now(), now()
FROM "Person" rater
CROSS JOIN "DanceSession" ds
JOIN "Event" e ON e.id = ds."eventId" AND e.name = 'Bachatamanía - hace 2 semanas'
JOIN "Person" i ON i.id = ds."inviterId" AND i.email = 'josefa@omnidance.dev'
JOIN "Person" v ON v.id = ds."inviteeId" AND v.email = 'jokcar12345@gmail.com'
WHERE rater.email = 'josefa@omnidance.dev'
ON CONFLICT ("sessionId", "raterId") DO NOTHING;
INSERT INTO "SessionRating" (id, "sessionId", "raterId", global, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, ds.id, rater.id, 4, now(), now()
FROM "Person" rater
CROSS JOIN "DanceSession" ds
JOIN "Event" e ON e.id = ds."eventId" AND e.name = 'Bachatamanía - hace 2 semanas'
JOIN "Person" i ON i.id = ds."inviterId" AND i.email = 'josefa@omnidance.dev'
JOIN "Person" v ON v.id = ds."inviteeId" AND v.email = 'jokcar12345@gmail.com'
WHERE rater.email = 'jokcar12345@gmail.com'
ON CONFLICT ("sessionId", "raterId") DO NOTHING;

-- ─── 9) Amistades ACCEPTED con el clique demo ───
INSERT INTO "Friendship" (id, "aId", "bId", status)
SELECT gen_random_uuid()::text, p.id, pa.id, 'ACCEPTED'
FROM "Person" p, "Person" pa
WHERE p.email = 'jokcar12345@gmail.com'
  AND pa.email IN (
    'dancer@omnidance.dev', 'camila@omnidance.dev', 'josefa@omnidance.dev',
    'diego@omnidance.dev', 'antonia@omnidance.dev', 'daniela@omnidance.dev',
    'gazner3203@gmail.com', 'monica@omnidance.cl', 'maria@omnidance.cl',
    'salas.eduardo.cl@gmail.com'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "Friendship" f
    WHERE (f."aId" = p.id AND f."bId" = pa.id) OR (f."aId" = pa.id AND f."bId" = p.id)
  );

COMMIT;
