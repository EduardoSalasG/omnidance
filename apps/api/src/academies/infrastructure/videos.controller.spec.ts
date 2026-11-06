import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { Request } from "express";
// Orden de import: auth.controller antes del controller bajo test -
// resuelve el ciclo de decoradores (mismo patrón que
// classes.controller.spec.ts).
import "../../auth/infrastructure/auth.controller";
import { VideosController } from "./videos.controller";

// PATCH /academies/:id/videos/:videoId y GET .../videos/:videoId:
// edición con cap schedule+videos (classId ajeno → 404, null desvincula)
// y detalle con la misma máscara locked del listado para no-staff.

type Person = { id: string; roles: string[] };

const reqAs = (p: Person) => ({ person: p }) as unknown as Request;

const OWNER = { id: "owner-1", roles: ["ACADEMY_OWNER"] };
const STUDENT = { id: "alum-1", roles: ["DANCER"] };

// Contexto mínimo para canManageAcademy: owner-1 es staff, el resto no.
const LOADED = {
  academy: { id: "acad-1" },
  ctx: { ownerId: "owner-1", instructorIds: [] as string[], staff: [] },
};

const VIDEO = {
  id: "vid-1",
  academyId: "acad-1",
  classId: "cls-1",
  url: "https://youtu.be/xyz",
  title: "Combo bachata",
  restrictedToAttended: true,
  createdAt: new Date("2026-01-01"),
};

function makePrisma(opts?: {
  video?: unknown;
  cls?: unknown;
  attendance?: unknown;
  enrollment?: unknown;
}) {
  return {
    video: {
      findFirst: vi
        .fn()
        .mockResolvedValue(opts && "video" in opts ? opts.video : VIDEO),
      update: vi
        .fn()
        .mockImplementation(
          ({
            where,
            data,
          }: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => Promise.resolve({ ...VIDEO, ...data, id: where.id }),
        ),
    },
    class: {
      findFirst: vi
        .fn()
        .mockResolvedValue(opts && "cls" in opts ? opts.cls : { id: "cls-1" }),
    },
    attendance: {
      findUnique: vi.fn().mockResolvedValue(opts?.attendance ?? null),
    },
    enrollment: {
      findFirst: vi.fn().mockResolvedValue(opts?.enrollment ?? null),
    },
  };
}

const makeAccess = (writeOk = true) => ({
  requireCapabilityWrite: vi
    .fn()
    .mockImplementation(() =>
      writeOk
        ? Promise.resolve(LOADED)
        : Promise.reject(new ForbiddenException("sin acceso")),
    ),
  loadContext: vi.fn().mockResolvedValue(LOADED),
});

const makeCtrl = (prisma: unknown, access: unknown) =>
  new VideosController(prisma as never, access as never);

// ─── PATCH /academies/:id/videos/:videoId ───

describe("VideosController.update", () => {
  it("actualiza los campos enviados y devuelve el video", async () => {
    const prisma = makePrisma();
    const ctrl = makeCtrl(prisma, makeAccess());

    const res = await ctrl.update(
      "acad-1",
      "vid-1",
      {
        title: "Nuevo título",
        url: "https://vimeo.com/123",
        restrictedToAttended: false,
      } as never,
      reqAs(OWNER),
    );

    expect(prisma.video.update).toHaveBeenCalledWith({
      where: { id: "vid-1" },
      data: {
        title: "Nuevo título",
        url: "https://vimeo.com/123",
        restrictedToAttended: false,
      },
    });
    expect(res).toMatchObject({
      id: "vid-1",
      title: "Nuevo título",
      url: "https://vimeo.com/123",
      restrictedToAttended: false,
    });
  });

  it("gate: exige escritura schedule con feature videos", async () => {
    const prisma = makePrisma();
    const access = makeAccess();
    const ctrl = makeCtrl(prisma, access);

    await ctrl.update("acad-1", "vid-1", { title: "x" } as never, reqAs(OWNER));

    expect(access.requireCapabilityWrite).toHaveBeenCalledWith(
      "acad-1",
      expect.anything(),
      "schedule",
      "videos",
    );
  });

  it("propaga el 403 del gate sin tocar prisma", async () => {
    const prisma = makePrisma();
    const ctrl = makeCtrl(prisma, makeAccess(false));

    await expect(
      ctrl.update(
        "acad-1",
        "vid-1",
        { title: "x" } as never,
        reqAs({ id: "intruso", roles: [] }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.video.update).not.toHaveBeenCalled();
  });

  it("404 si el video no existe en la academia", async () => {
    const prisma = makePrisma({ video: null });
    const ctrl = makeCtrl(prisma, makeAccess());

    await expect(
      ctrl.update("acad-1", "vid-x", { title: "x" } as never, reqAs(OWNER)),
    ).rejects.toMatchObject({ status: 404 });
    expect(prisma.video.update).not.toHaveBeenCalled();
  });

  it("404 si classId apunta a una clase de otra academia", async () => {
    const prisma = makePrisma({ cls: null });
    const ctrl = makeCtrl(prisma, makeAccess());

    await expect(
      ctrl.update(
        "acad-1",
        "vid-1",
        { classId: "cls-ajena" } as never,
        reqAs(OWNER),
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(prisma.class.findFirst).toHaveBeenCalledWith({
      where: { id: "cls-ajena", slot: { academyId: "acad-1" } },
    });
    expect(prisma.video.update).not.toHaveBeenCalled();
  });

  it("classId null desvincula sin consultar la clase", async () => {
    const prisma = makePrisma();
    const ctrl = makeCtrl(prisma, makeAccess());

    await ctrl.update(
      "acad-1",
      "vid-1",
      { classId: null } as never,
      reqAs(OWNER),
    );

    expect(prisma.class.findFirst).not.toHaveBeenCalled();
    expect(prisma.video.update).toHaveBeenCalledWith({
      where: { id: "vid-1" },
      data: { classId: null },
    });
  });

  it("PATCH parcial: solo viajan los campos presentes", async () => {
    const prisma = makePrisma();
    const ctrl = makeCtrl(prisma, makeAccess());

    await ctrl.update(
      "acad-1",
      "vid-1",
      { title: "Solo título" } as never,
      reqAs(OWNER),
    );

    expect(prisma.video.update).toHaveBeenCalledWith({
      where: { id: "vid-1" },
      data: { title: "Solo título" },
    });
  });
});

// ─── GET /academies/:id/videos/:videoId ───

describe("VideosController.detail", () => {
  it("staff recibe el video completo con url", async () => {
    const prisma = makePrisma();
    const access = makeAccess();
    const ctrl = makeCtrl(prisma, access);

    const res = await ctrl.detail("acad-1", "vid-1", reqAs(OWNER));

    expect(access.loadContext).toHaveBeenCalledWith("acad-1");
    expect(res).toMatchObject({ id: "vid-1", url: VIDEO.url });
  });

  it("404 si el video no existe en la academia", async () => {
    const prisma = makePrisma({ video: null });
    const ctrl = makeCtrl(prisma, makeAccess());

    await expect(
      ctrl.detail("acad-1", "vid-x", reqAs(OWNER)),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("alumno: video no restringido viaja completo, sin chequear asistencia", async () => {
    const prisma = makePrisma({
      video: { ...VIDEO, restrictedToAttended: false },
    });
    const ctrl = makeCtrl(prisma, makeAccess());

    const res = await ctrl.detail("acad-1", "vid-1", reqAs(STUDENT));

    expect(res).toMatchObject({ id: "vid-1", url: VIDEO.url });
    expect(prisma.attendance.findUnique).not.toHaveBeenCalled();
    expect(prisma.enrollment.findFirst).not.toHaveBeenCalled();
  });

  it("alumno que asistió a la clase: unlocked con url", async () => {
    const prisma = makePrisma({
      attendance: { classId: "cls-1" },
    });
    const ctrl = makeCtrl(prisma, makeAccess());

    const res = (await ctrl.detail(
      "acad-1",
      "vid-1",
      reqAs(STUDENT),
    )) as Record<string, unknown>;

    expect(prisma.attendance.findUnique).toHaveBeenCalledWith({
      where: { classId_personId: { classId: "cls-1", personId: "alum-1" } },
      select: { classId: true },
    });
    expect(res).toMatchObject({ id: "vid-1", url: VIDEO.url, locked: false });
  });

  it("alumno con enrollment ACTIVE: unlocked aunque no haya asistido", async () => {
    const prisma = makePrisma({ enrollment: { id: "enr-1" } });
    const ctrl = makeCtrl(prisma, makeAccess());

    const res = (await ctrl.detail(
      "acad-1",
      "vid-1",
      reqAs(STUDENT),
    )) as Record<string, unknown>;

    expect(res).toMatchObject({ id: "vid-1", url: VIDEO.url, locked: false });
  });

  it("alumno sin asistencia ni enrollment: metadatos + locked sin url", async () => {
    const prisma = makePrisma();
    const ctrl = makeCtrl(prisma, makeAccess());

    const res = (await ctrl.detail(
      "acad-1",
      "vid-1",
      reqAs(STUDENT),
    )) as Record<string, unknown>;

    expect(res).toEqual({
      id: "vid-1",
      title: VIDEO.title,
      classId: "cls-1",
      restrictedToAttended: true,
      locked: true,
    });
    expect(res).not.toHaveProperty("url");
  });
});
