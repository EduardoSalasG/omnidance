import { Injectable } from "@nestjs/common";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

// Puerto de storage de archivos (spec academy-payment-claims): adaptador
// de disco local en UPLOADS_DIR - mismo patrón que video-repo. Los
// comprobantes son evidencia financiera privada: se sirven por endpoint
// autenticado, nunca por ruta estática.

export const STORAGE = "STORAGE";

export interface StoredFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

export interface FileStorage {
  /** Persiste bajo `<folder>/<uuid>.<ext>` y devuelve el storageKey. */
  save(file: StoredFile, folder: string): Promise<string>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

const EXT_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_EXT).map(([m, e]) => [e, m]),
);

/** ext por mimetype - whitelist: nunca confiar en el nombre del cliente. */
export function extForMime(mimetype: string): string | null {
  return MIME_EXT[mimetype] ?? null;
}

/** mime por extensión del key - para servir el stream autenticado. */
export function mimeForKey(key: string): string {
  return EXT_MIME[path.extname(key).toLowerCase()] ?? "application/octet-stream";
}

@Injectable()
export class LocalDiskStorage implements FileStorage {
  private readonly baseDir = path.resolve(
    process.env.UPLOADS_DIR ?? "uploads",
  );

  /** storageKeys solo `folder/name.ext` - nada de `..` ni separadores raros. */
  private resolve(key: string): string {
    const target = path.resolve(this.baseDir, key);
    if (!target.startsWith(this.baseDir + path.sep)) {
      throw new Error("storageKey inválido");
    }
    return target;
  }

  async save(file: StoredFile, folder: string): Promise<string> {
    const ext = extForMime(file.mimetype);
    if (!ext) throw new Error(`mimetype no soportado: ${file.mimetype}`);
    const key = `${folder}/${randomUUID()}${ext}`;
    const target = this.resolve(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.buffer);
    return key;
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await fs.unlink(this.resolve(key)).catch(() => {});
  }
}
