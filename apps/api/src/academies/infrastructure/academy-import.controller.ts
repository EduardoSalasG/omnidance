import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { AcademyAccess } from "./academy-access.service";
import { AcademyImportService } from "./academy-import.service";
import { CSV_MAX_ROWS, csvRowsToObjects, parseCsv } from "../../common/csv";

/** CSV de migración acotado - 2MB sobra para 500 filas de nómina/horario. */
const CSV_MAX_BYTES = 2 * 1024 * 1024;

const STUDENT_TEMPLATE = `email,nombre,telefono,plan,pagado_hasta
juan.perez@correo.cl,Juan Pérez,+56912345678,Mensual,2026-11-30
`;

const SCHEDULE_TEMPLATE = `serie,estilo,nivel,dia_semana,hora_inicio,hora_fin,capacidad,instructor_email,mes
Bachata Sensual Intermedio,bachata,intermedio,lunes,19:00,20:30,20,profe@correo.cl,2026-10
Bachata Sensual Intermedio,,,miercoles,19:00,20:30,,,
`;

/**
 * Carga masiva para migración desde otra plataforma (spec
 * academy-bulk-import): nómina de alumnos → cap `students`, horario
 * semanal → cap `schedule`. Reporte por fila (un error no aborta el
 * archivo); idempotente por dedup/upsert.
 */
@Controller("academies")
@UseGuards(SessionGuard)
export class AcademyImportController {
  constructor(
    private readonly access: AcademyAccess,
    private readonly imports: AcademyImportService,
  ) {}

  @Get(":id/import/template/students")
  async studentsTemplate(
    @Param("id") id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.access.requireCapability(id, req.person!, "students");
    res
      .set({
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="alumnos.csv"',
      })
      .send(STUDENT_TEMPLATE);
  }

  @Get(":id/import/template/schedule")
  async scheduleTemplate(
    @Param("id") id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.access.requireCapability(id, req.person!, "schedule");
    res
      .set({
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="horario.csv"',
      })
      .send(SCHEDULE_TEMPLATE);
  }

  @Post(":id/import/students")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: CSV_MAX_BYTES } }),
  )
  async importStudents(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    const { academy } = await this.access.requireCapabilityWrite(
      id,
      req.person!,
      "students",
    );
    const objects = parseCsvFile(file, ["email", "nombre", "plan"]);
    return { results: await this.imports.importStudents(academy, objects) };
  }

  @Post(":id/import/schedule")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: CSV_MAX_BYTES } }),
  )
  async importSchedule(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    const { academy } = await this.access.requireCapabilityWrite(
      id,
      req.person!,
      "schedule",
    );
    const objects = parseCsvFile(file, [
      "serie",
      "dia_semana",
      "hora_inicio",
      "hora_fin",
    ]);
    return { results: await this.imports.importSchedule(academy, objects) };
  }
}

function parseCsvFile(
  file: Express.Multer.File | undefined,
  required: string[],
): Record<string, string>[] {
  if (!file?.buffer?.length) {
    throw new BadRequestException("archivo CSV requerido (campo `file`)");
  }
  const rows = parseCsv(file.buffer.toString("utf8"));
  if (rows.length < 2) {
    throw new BadRequestException("el CSV no tiene filas de datos");
  }
  if (rows.length - 1 > CSV_MAX_ROWS) {
    throw new BadRequestException(`máximo ${CSV_MAX_ROWS} filas por archivo`);
  }
  const mapped = csvRowsToObjects(rows, required);
  if (!mapped) {
    throw new BadRequestException(
      `faltan columnas requeridas: ${required.join(", ")}`,
    );
  }
  return mapped.objects;
}
