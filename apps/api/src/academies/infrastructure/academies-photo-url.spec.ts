import { BadRequestException } from "@nestjs/common";
import { describe, it, expect } from "vitest";
import "../../auth/infrastructure/auth.controller"; // ciclo session.guard ⇄ auth.controller (ver classes.controller.spec)
import { cleanPhotoUrl } from "./academies.controller";

// photoUrl del perfil de academia: acepta URL externa https (regla
// "fotos nunca hosteadas" para contenido externo) y paths propios
// /api/... (foto subida por POST /academies/:id/photo) - el PATCH de
// settings no debe rechazar el valor que el upload persistió.
describe("cleanPhotoUrl", () => {
  it("acepta URL externa https y la normaliza", () => {
    expect(cleanPhotoUrl("https://cdn.ej.cl/foto.jpg")).toBe(
      "https://cdn.ej.cl/foto.jpg",
    );
    expect(cleanPhotoUrl("cdn.ej.cl/foto.jpg")).toBe(
      "https://cdn.ej.cl/foto.jpg",
    );
  });

  it("acepta path hosteado /api/... (foto subida por upload)", () => {
    expect(cleanPhotoUrl("/api/academies/photos/abc-123.jpg")).toBe(
      "/api/academies/photos/abc-123.jpg",
    );
  });

  it("rechaza valores que no son URL válida ni path /api", () => {
    expect(() => cleanPhotoUrl("no-soy-url")).toThrow(BadRequestException);
    expect(() => cleanPhotoUrl("/otra/ruta.png")).toThrow(
      BadRequestException,
    );
  });

  it("undefined no toca; vacío limpia a null", () => {
    expect(cleanPhotoUrl(undefined)).toBeUndefined();
    expect(cleanPhotoUrl("")).toBeNull();
    expect(cleanPhotoUrl(null)).toBeNull();
  });
});
