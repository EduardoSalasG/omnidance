// send-test-push.cjs — emite una notificación real (fila Notification +
// web push a todos los PushToken de la persona) para el smoke manual de
// push de dispositivo (tap → deep link data.path/data.url).
//
//   cd apps/api && node scripts/send-test-push.cjs <email> [path] [título]
//
//   email  persona destino (debe tener PushToken registrado - el opt-in
//          vive en el banner PushOptIn de la app)
//   path   destino del tap (default /notificaciones); viaja en
//          data.path - el service worker lo usa igual que data.url
//   título opcional (default "Prueba push")
//
// Replica NotificationsService.notify(): crea la fila y luego entrega
// el payload {type,title,body,data} con web-push usando las VAPID del
// .env. Endpoints muertos (404/410) se limpian igual que WebPushSender.
// Re-correr es seguro: cada corrida crea una Notification nueva.
const { PrismaClient } = require("@prisma/client");
const webpush = require("web-push");

const prisma = new PrismaClient();

const [email, path = "/notificaciones", title = "Prueba push"] =
  process.argv.slice(2);

async function main() {
  if (!email) {
    console.error("uso: node scripts/send-test-push.cjs <email> [path] [título]");
    process.exit(1);
  }
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.error("WEB_PUSH_VAPID_PUBLIC_KEY/PRIVATE_KEY ausentes en env");
    process.exit(1);
  }
  webpush.setVapidDetails(
    process.env.WEB_PUSH_VAPID_SUBJECT ?? "mailto:admin@omnidance.cl",
    publicKey,
    privateKey,
  );

  const person = await prisma.person.findUnique({ where: { email } });
  if (!person) {
    console.error(`persona no encontrada: ${email}`);
    process.exit(1);
  }
  const tokens = await prisma.pushToken.findMany({
    where: { personId: person.id },
  });
  if (!tokens.length) {
    console.error(`${email} no tiene PushToken - hacer el opt-in en el dispositivo primero`);
    process.exit(1);
  }

  const notification = await prisma.notification.create({
    data: {
      personId: person.id,
      category: "TRANSACTIONAL",
      type: "test.push",
      title,
      body: `Tap para abrir ${path}`,
      data: { path },
    },
  });
  console.log(`notification ${notification.id} → ${email} (${tokens.length} token/s), path=${path}`);

  const payload = JSON.stringify({
    type: notification.type,
    title: notification.title,
    body: notification.body,
    data: notification.data,
  });

  for (const t of tokens) {
    const keys = t.payload ?? {};
    try {
      await webpush.sendNotification(
        { endpoint: t.token, keys: { p256dh: keys.p256dh ?? "", auth: keys.auth ?? "" } },
        payload,
      );
      console.log(`  ok    ${t.token.slice(0, 70)}`);
    } catch (err) {
      const status = err.statusCode ?? "?";
      if (status === 404 || status === 410) {
        await prisma.pushToken.delete({ where: { id: t.id } }).catch(() => {});
        console.log(`  dead  ${t.token.slice(0, 70)} (${status}) - PushToken limpiado`);
      } else {
        console.log(`  fail  ${t.token.slice(0, 70)} (${status}): ${err.message}`);
      }
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
