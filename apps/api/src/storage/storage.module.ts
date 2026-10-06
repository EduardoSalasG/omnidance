import { Global, Module } from "@nestjs/common";
import {
  LocalDiskStorage,
  STORAGE,
  type FileStorage,
} from "./storage.service";

/**
 * Storage global: por ahora solo LocalDiskStorage (UPLOADS_DIR). El token
 * STORAGE permite cambiar el adaptador (S3/R2) sin tocar consumers.
 */
@Global()
@Module({
  providers: [{ provide: STORAGE, useClass: LocalDiskStorage }],
  exports: [STORAGE],
})
export class StorageModule {}

export type { FileStorage };
