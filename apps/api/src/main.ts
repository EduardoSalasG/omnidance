import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { WinstonModule } from "nest-winston";
import { AppModule } from "./app.module";
import { buildLogger } from "./common/logging/logger.factory";
import { requestLoggerMiddleware } from "./common/logging/request-logger.middleware";

async function bootstrap() {
  const winston = buildLogger();
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({ instance: winston }),
    // rawBody: la firma Fintoc-Signature cubre el body crudo del webhook.
    rawBody: true,
  });
  // Security headers (spec api-hardening): primero en el pipeline.
  // CSP off: la única superficie HTML es Swagger UI (/api/docs), que
  // usa scripts inline - el default-src 'self' de helmet la rompería.
  // No interfiere con CORS (CORP solo aplica a fetches no-cors).
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(requestLoggerMiddleware(winston));
  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Whitelist de orígenes: auth por cookie no puede reflejar cualquier origen.
  const corsOrigins = (
    process.env.CORS_ORIGINS ??
    process.env.WEB_URL ??
    "http://localhost:3000"
  )
    .split(",")
    .map((o) => o.trim());
  app.enableCors({ origin: corsOrigins, credentials: true });

  // OpenAPI: UI en /api/docs, documento JSON en /api/docs-json.
  // El script scripts/export-api-docs.cjs lo consume para generar
  // docs/openapi.json + la colección Postman.
  const config = new DocumentBuilder()
    .setTitle("omni-dance API")
    .setDescription(
      "API de la plataforma omni-dance (SBK Santiago): eventos, QR, sesiones, " +
        "tickets, social, academias, gamificación, RBAC y admin.",
    )
    .setVersion("0.1.0")
    .addCookieAuth("omnidance_session")
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document, {
    jsonDocumentUrl: "api/docs-json",
  });

  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
