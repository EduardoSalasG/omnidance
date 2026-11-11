import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { AcademyAccess } from "./academy-access.service";
import { AcademyImportService } from "./academy-import.service";
import { PrismaService } from "../../prisma.service";
import { CSV_MAX_ROWS, csvRowsToObjects, parseCsv } from "../../common/csv";

/** Archivo de migración acotado - 2MB sobra para 500 filas de nómina/horario. */
const CSV_MAX_BYTES = 2 * 1024 * 1024;

// Change academy-import-invites: el import de alumnos es canal de
// invitación - ya no hay columnas plan/pagado_hasta (la vigencia nace
// de la compra del alumno, no de la planilla).
const STUDENT_TEMPLATE = `email,nombre,rut,fecha_nacimiento,telefono,sexo
juan.perez@correo.cl,Juan Pérez,12.345.678-9,15/03/1990,+56912345678,m
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
    private readonly prisma: PrismaService,
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

  /**
   * `?dryRun=1` corre la misma tubería sin escrituras ni envíos: la
   * vista previa que el front exige antes de habilitar "Importar"
   * (spec academies/bulk-import §Validación previa).
   */
  @Post(":id/import/students")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: CSV_MAX_BYTES } }),
  )
  async importStudents(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query("dryRun") dryRun: string | undefined,
    @Req() req: Request,
  ) {
    const { academy } = await this.access.requireCapabilityWrite(
      id,
      req.person!,
      "students",
    );
    const objects = await parseImportFile(file, ["email", "nombre"]);
    return this.imports.importStudents(academy, objects, {
      dryRun: isDryRun(dryRun),
      createdById: req.person!.id,
      fileName: file?.originalname,
    });
  }

  @Post(":id/import/schedule")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: CSV_MAX_BYTES } }),
  )
  async importSchedule(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query("dryRun") dryRun: string | undefined,
    @Req() req: Request,
  ) {
    const { academy } = await this.access.requireCapabilityWrite(
      id,
      req.person!,
      "schedule",
      "classes",
    );
    const objects = await parseImportFile(file, [
      "serie",
      "dia_semana",
      "hora_inicio",
      "hora_fin",
    ]);
    return this.imports.importSchedule(academy, objects, {
      dryRun: isDryRun(dryRun),
      createdById: req.person!.id,
      fileName: file?.originalname,
    });
  }

  /**
   * Historial de corridas (spec academies/bulk-import): más nuevas
   * primero. Las corridas de horario las ve quien tiene cap de
   * schedule/classes además de students.
   */
  @Get(":id/import/runs")
  async importRuns(
    @Param("id") id: string,
    @Query("take") take: string | undefined,
    @Req() req: Request,
  ) {
    await this.access.requireCapability(id, req.person!, "students");
    const items = await this.prisma.academyImportRun.findMany({
      where: { academyId: id },
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(take) || 50, 200),
      select: {
        id: true,
        kind: true,
        fileName: true,
        total: true,
        counts: true,
        createdAt: true,
      },
    });
    return { items };
  }

  /** Detalle fila a fila de una corrida del historial. */
  @Get(":id/import/runs/:runId")
  async importRun(
    @Param("id") id: string,
    @Param("runId") runId: string,
    @Req() req: Request,
  ) {
    await this.access.requireCapability(id, req.person!, "students");
    const run = await this.prisma.academyImportRun.findFirst({
      where: { id: runId, academyId: id },
    });
    if (!run) throw new NotFoundException("corrida no encontrada");
    return { run };
  }
}

function isDryRun(v: string | undefined): boolean {
  return v === "1" || v === "true";
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

// Parse de la planilla con exceljs (spec api-hardening: reemplaza a
// xlsx@0.18.5 por sus CVEs). ExcelJS solo lee OOXML (.xlsx): el BIFF
// binario .xls (Excel 97-2003) queda fuera - el 400 guía a re-guardar.
// `cell.text` equivale al `raw:false` previo (texto formateado de la
// celda); las filas vacías se descartan igual que `blankrows:false`.
async function sheetRows(buffer: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.read(Readable.from(buffer));
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    // row.values es 1-indexed (índice 0 vacío) u objeto consecutivo -
    // la matriz CSV-equivalente solo toma el arreglo.
    const values = Array.isArray(row.values) ? row.values : [];
    const cells: string[] = [];
    for (let i = 1; i < values.length; i++) {
      cells.push(String(row.getCell(i).text ?? ""));
    }
    if (cells.some((c) => c.trim() !== "")) rows.push(cells);
  });
  return rows;
}

async function parseImportFile(
  file: Express.Multer.File | undefined,
  required: string[],
): Promise<Record<string, string>[]> {
  if (!file?.buffer?.length) {
    throw new BadRequestException(
      "archivo requerido (campo `file`: .csv o .xlsx)",
    );
  }
  if (file.originalname.toLowerCase().endsWith(".xls")) {
    throw new BadRequestException(
      "el formato .xls (Excel 97-2003) no se soporta - guarda como .xlsx o .csv",
    );
  }
  const rows = isSpreadsheet(file)
    ? await sheetRows(file.buffer)
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
