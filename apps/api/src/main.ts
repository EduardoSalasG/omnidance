import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: true, credentials: true });

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
