import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { QrService } from "./domain/qr.service";
import { QrController } from "./qr.controller";

@Module({
  imports: [AuthModule],
  controllers: [QrController],
  providers: [
    {
      provide: QrService,
      useFactory: () => new QrService(process.env.QR_SECRET ?? "dev-qr-secret-change-me"),
    },
  ],
  exports: [QrService],
})
export class QrModule {}
