export const JOB_REGISTRY = "JOB_REGISTRY";

/** Lo que retorna un handler: contadores opcionales → JobRun.meta. */
export type JobHandler = () => Promise<Record<string, unknown> | void>;

/**
 * Registro declarativo de trabajos programados (spec
 * admin-jobs-mail-campaigns): cada módulo anuncia sus jobs en
 * onModuleInit; la DB (ScheduledJob) es la fuente de verdad del horario
 * - el código solo aporta handler + defaults. El admin controla
 * cronExpr/enabled/timezone desde /admin/jobs, nunca el handler.
 */
export interface JobRegistration {
  key: string;
  label: string;
  description?: string;
  defaultCron: string;
  timezone?: string;
  handler: JobHandler;
}

export class JobRegistry {
  private readonly jobs = new Map<string, JobRegistration>();

  register(reg: JobRegistration): void {
    this.jobs.set(reg.key, reg);
  }

  get(key: string): JobRegistration | undefined {
    return this.jobs.get(key);
  }

  all(): JobRegistration[] {
    return [...this.jobs.values()];
  }
}
