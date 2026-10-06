import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  LocalDiskStorage,
  extForMime,
  mimeForKey,
} from "./storage.service";

describe("storage helpers", () => {
  it("extForMime: solo whitelist imagen/PDF", () => {
    expect(extForMime("image/png")).toBe(".png");
    expect(extForMime("image/jpeg")).toBe(".jpg");
    expect(extForMime("image/webp")).toBe(".webp");
    expect(extForMime("application/pdf")).toBe(".pdf");
    expect(extForMime("text/html")).toBeNull();
    expect(extForMime("application/x-msdownload")).toBeNull();
  });

  it("mimeForKey deriva del key", () => {
    expect(mimeForKey("claims/ac1/x.png")).toBe("image/png");
    expect(mimeForKey("claims/ac1/x.pdf")).toBe("application/pdf");
    expect(mimeForKey("claims/ac1/x.bin")).toBe("application/octet-stream");
  });
});

describe("LocalDiskStorage", () => {
  let dir: string;
  let storage: LocalDiskStorage;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "od-storage-"));
    process.env.UPLOADS_DIR = dir;
    storage = new LocalDiskStorage();
  });

  afterAll(async () => {
    delete process.env.UPLOADS_DIR;
    await fs.rm(dir, { recursive: true, force: true });
  });

  const png = {
    originalname: "foto.png",
    mimetype: "image/png",
    buffer: Buffer.from("fake-png"),
    size: 8,
  };

  it("save → key con folder y ext por mimetype; read devuelve el buffer", async () => {
    const key = await storage.save(png, "claims/ac1");
    expect(key).toMatch(/^claims\/ac1\/[\w-]+\.png$/);
    const buf = await storage.read(key);
    expect(buf.toString()).toBe("fake-png");
  });

  it("mimetype fuera de whitelist → error", async () => {
    await expect(
      storage.save({ ...png, mimetype: "text/html" }, "claims/ac1"),
    ).rejects.toThrow("mimetype no soportado");
  });

  it("path traversal en el key → error, nunca lee fuera del base", async () => {
    await expect(storage.read("../../.env")).rejects.toThrow();
    await expect(storage.read("claims/../../package.json")).rejects.toThrow();
  });

  it("delete de key inexistente no rompe", async () => {
    await expect(storage.delete("claims/ac1/nada.png")).resolves.toBeUndefined();
  });
});
