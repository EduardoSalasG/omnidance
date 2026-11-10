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
import * as XLSX from "xlsx";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { AcademyAccess } from "./academy-access.service";
import { AcademyImportService } from "./academy-import.service";
import { CSV_MAX_ROWS, csvRowsToObjects, parseCsv } from "../../common/csv";

/** Archivo de migración acotado - 2MB sobra para 500 filas de nómina/horario. */
const CSV_MAX_BYTES = 2 * 1024 * 1024;

// Change academy-import-slim-fields: solo email+nombre exigidos; el
// resto de las columnas del template son opcionales.
const STUDENT_TEMPLATE = `email,nombre,rut,fecha_nacimiento,telefono,sexo,plan,pagado_hasta
juan.perez@correo.cl,Juan Pérez,12.345.678-9,15/03/1990,+56912345678,m,Mensual,2026-11-30
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
    await this.access.requireCapability(id, req.person!, "schedule", "classes");
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
    const objects = parseImportFile(file, ["email", "nombre"]);
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
      "classes",
    );
    const objects = parseImportFile(file, [
      "serie",
      "dia_semana",
      "hora_inicio",
      "hora_fin",
    ]);
    return { results: await this.imports.importSchedule(academy, objects) };
  }
}

const XLS_MIMES = new Set([
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

// Formato del upload: la extensión gana (Windows a veces etiqueta los
// .csv como application/vnd.ms-excel); el MIME decide solo cuando la
// extensión no es reconocida. Sin señal clara se intenta CSV - si no
// trae las columnas responde el 400 de siempre.
function isSpreadsheet(file: Express.Multer.File): boolean {
  const name = file.originalname.toLowerCase();
  if (name.endsWith(".xls") || name.endsWith(".xlsx")) return true;
  if (name.endsWith(".csv")) return false;
  return XLS_MIMES.has(file.mimetype);
}

function sheetRows(buffer: Buffer): string[][] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  }) as unknown[][];
  return rows
    .map((row) => row.map((c) => String(c)))
    .filter((row) => row.some((c) => c.trim() !== ""));
}

function parseImportFile(
  file: Express.Multer.File | undefined,
  required: string[],
): Record<string, string>[] {
  if (!file?.buffer?.length) {
    throw new BadRequestException(
      "archivo requerido (campo `file`: .csv, .xls o .xlsx)",
    );
  }
  const rows = isSpreadsheet(file)
    ? sheetRows(file.buffer)
    : parseCsv(file.buffer.toString("utf8"));
  if (rows.length < 2) {
    throw new BadRequestException("el archivo no tiene filas de datos");
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
