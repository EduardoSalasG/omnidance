"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, isProRequired } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { useActiveRole } from "@/lib/active-role";
import {
  Button,
  Card,
  Pager,
  PillTabs,
  SkeletonList,
  SkeletonText,
  Spinner,
} from "@/components/ui";
import { ProPaywall } from "@/components/producer/pro-paywall";
import { FilterBar, type QueryOption } from "@/components/query/FilterBar";
import { QueryTable } from "@/components/query/QueryTable";
import {
  SavedQueries,
  type SavedQuery,
} from "@/components/query/SavedQueries";
import { inputCls } from "@/components/academy/shared";
import type {
  EntityDef,
  FkSource,
  QueryFilters,
  QueryRole,
  QueryRunResult,
  SavedReportParams,
} from "@omnidance/shared";
import { QUERY_CATALOG, QUERY_ROLES } from "@omnidance/shared";

/**
 * /analitica - consola de consultas del query engine (spec
 * analytics/query-console): catálogo por lente → FilterBar data-driven →
 * preview POST /query/run (rows capadas + total) → export CSV/PDF vía
 * <a download> (preserva cookie por el proxy same-origin; `download` no
 * dispara NavPendingOverlay) → guardar/reusar consultas. Solo lectura.
 * La lente es SIEMPRE el rol activo (se cambia desde Perfil/el drawer -
 * no hay selector acá). Lente PRODUCER: gate Pro - effectivePro===false
 * o 403 pro.required → paywall. Lentes sin entidades (VENUE_MANAGER) →
 * estado muted.
 */

type Role = QueryRole | "VENUE_MANAGER";
type BootPhase = "loading" | "error" | "forbidden" | "ready";
type CatalogPhase = "loading" | "error" | "forbidden" | "pro" | "empty" | "ready";
type RunPhase = "idle" | "loading" | "error" | "ready";

type CatalogResponse = {
  entities: EntityDef[];
  options: Record<string, QueryOption[]>;
};

const isQueryRole = (r: Role): r is QueryRole =>
  (QUERY_ROLES as readonly string[]).includes(r);

export default function AnaliticaPage() {
  const t = useTranslations("query");
  const ta = useTranslations("analytics");
  const tc = useTranslations("common");

  const { me } = useMe();
  const effectivePro = me?.effectivePro ?? null;
  const activeRole = useActiveRole(me?.roles);

  const [phase, setPhase] = useState<BootPhase>("loading");
  const [role, setRole] = useState<Role | null>(null);

  const [catalogPhase, setCatalogPhase] = useState<CatalogPhase>("loading");
  const [entities, setEntities] = useState<EntityDef[]>([]);
  const [options, setOptions] = useState<Record<string, QueryOption[]>>({});

  const [entity, setEntity] = useState<string | null>(null);
  const [filters, setFilters] = useState<QueryFilters>({});

  const [runPhase, setRunPhase] = useState<RunPhase>("idle");
  const [result, setResult] = useState<QueryRunResult | null>(null);
  const [page, setPage] = useState(1);

  const [saved, setSaved] = useState<SavedQuery[]>([]);
  const [savedBusy, setSavedBusy] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // ── Boot: la lente es el rol activo; /analytics/roles confirma que
  // tiene acceso a analítica (403/401 o lente ausente → forbidden). ────
  const boot = useCallback(async () => {
    setPhase("loading");
    try {
      const res = await apiFetch("/analytics/roles");
      if (res.status === 401 || res.status === 403) {
        setPhase("forbidden");
        return;
      }
      if (!res.ok) {
        setPhase("error");
        return;
      }
      const list = (await res.json()) as Role[];
      if (!list.includes(activeRole as Role)) {
        setPhase("forbidden");
        return;
      }
      setRole(activeRole as Role);
      setPhase("ready");
    } catch {
      setPhase("error");
    }
  }, [activeRole]);

  useEffect(() => {
    void boot();
  }, [boot]);

  // ── Catálogo del lente activo ────────────────────────────────────────
  // Gate Pro proactivo: effectivePro===false en lente PRODUCER salta
  // directo al paywall sin fetch; el 403 pro.required queda de fallback.
  const proLocked = role === "PRODUCER" && effectivePro === false;

  const loadCatalog = useCallback(
    async (r: Role) => {
      if (!isQueryRole(r) || QUERY_CATALOG[r].length === 0) {
        setCatalogPhase("empty");
        return;
      }
      setCatalogPhase("loading");
      try {
        const res = await apiFetch(`/query/catalog?role=${r}`);
        if (res.status === 403 && (await isProRequired(res))) {
          setCatalogPhase("pro");
          return;
        }
        if (res.status === 401 || res.status === 403) {
          setCatalogPhase("forbidden");
          return;
        }
        if (!res.ok) {
          setCatalogPhase("error");
          return;
        }
        const data = (await res.json()) as CatalogResponse;
        setEntities(data.entities ?? []);
        setOptions(data.options ?? {});
        setEntity(data.entities?.[0]?.entity ?? null);
        setFilters({});
        setResult(null);
        setRunPhase("idle");
        setSaved([]);
        setCatalogPhase("ready");
      } catch {
        setCatalogPhase("error");
      }
    },
    [],
  );

  // ── Consultas guardadas del lente ────────────────────────────────────
  const loadSaved = useCallback(async (r: Role) => {
    try {
      const res = await apiFetch(`/query/saved?role=${r}`);
      if (!res.ok) return;
      const body = (await res.json()) as
        | SavedQuery[]
        | { saved?: SavedQuery[] };
      setSaved(Array.isArray(body) ? body : (body.saved ?? []));
    } catch {
      // Lista auxiliar - si falla queda la del estado previo; la acción
      // de guardar reintentará el load.
    }
  }, []);

  // Catálogo y guardadas en paralelo: una sola espera, la página aparece
  // completa - nada de skeletons encadenados ni secciones que llegan
  // tarde.
  useEffect(() => {
    if (!role) return;
    if (proLocked) {
      setCatalogPhase("pro");
      return;
    }
    void loadCatalog(role);
    if (isQueryRole(role)) void loadSaved(role);
  }, [role, proLocked, loadCatalog, loadSaved]);

  // Opciones de fuentes scope-dependientes (planId/seriesId/listId…).
  const loadScopeOptions = useCallback(
    async (source: FkSource, scopeId: string): Promise<QueryOption[]> => {
      if (!role || !isQueryRole(role)) return [];
      const res = await apiFetch(
        `/query/options?role=${role}&source=${source}&scopeId=${encodeURIComponent(scopeId)}`,
      );
      if (!res.ok) return [];
      const body = (await res.json()) as
        | QueryOption[]
        | { options?: QueryOption[] };
      return Array.isArray(body) ? body : (body.options ?? []);
    },
    [role],
  );

  // ── Ejecutar preview (paginado: Aplicar = página 1, el Pager pide
  // la página correspondiente sin tocar los filtros). ──────────────────
  const run = useCallback(
    async (pageNum = 1) => {
      if (!role || !entity || runPhase === "loading") return;
      setRunPhase("loading");
      setNotice(null);
      try {
        const res = await apiFetch("/query/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role, entity, filters, page: pageNum }),
        });
        if (res.status === 403 && (await isProRequired(res))) {
          setRunPhase("idle");
          setCatalogPhase("pro");
          return;
        }
        if (!res.ok) {
          setRunPhase("error");
          return;
        }
        setResult((await res.json()) as QueryRunResult);
        setPage(pageNum);
        setRunPhase("ready");
      } catch {
        setRunPhase("error");
      }
    },
    [role, entity, filters, runPhase],
  );

  function exportHref(format: "csv" | "pdf"): string {
    const params = new URLSearchParams();
    if (role) params.set("role", role);
    if (entity) params.set("entity", entity);
    for (const [k, v] of Object.entries(filters)) {
      if (v) params.set(k, v);
    }
    return `/api/query/export.${format}?${params.toString()}`;
  }

  // ── Guardar / reutilizar ─────────────────────────────────────────────
  async function saveCurrent() {
    const name = saveName.trim();
    if (!name || !role || !entity || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await apiFetch("/query/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          name,
          params: { entity, filters } satisfies SavedReportParams,
        }),
      });
      if (res.ok) {
        setSaveName("");
        setNotice(t("saved.created"));
        if (role) void loadSaved(role);
      }
    } finally {
      setSaving(false);
    }
  }

  async function renameSaved(id: string, name: string) {
    setSavedBusy(id);
    try {
      const res = await apiFetch(`/query/saved/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok && role) await loadSaved(role);
    } finally {
      setSavedBusy(null);
    }
  }

  async function deleteSaved(id: string) {
    setSavedBusy(id);
    try {
      const res = await apiFetch(`/query/saved/${id}`, { method: "DELETE" });
      if (res.ok && role) await loadSaved(role);
    } finally {
      setSavedBusy(null);
    }
  }

  // Plantilla/guardada seleccionada: precarga entidad + filtros (el scope
  // puede quedar sin elegir - el usuario lo define al aplicar).
  function applyParams(params: SavedReportParams) {
    if (!entities.some((e) => e.entity === params.entity)) return;
    setEntity(params.entity);
    setFilters({ ...params.filters });
    setResult(null);
    setPage(1);
    setRunPhase("idle");
  }

  function selectEntity(e: string) {
    setEntity(e);
    setFilters({});
    setResult(null);
    setPage(1);
    setRunPhase("idle");
  }

  // ── Render ───────────────────────────────────────────────────────────
  const entityDef =
    entity != null ? entities.find((e) => e.entity === entity) : undefined;

  // Un solo skeleton para TODO el arranque (roles + catálogo): los dos
  // cargan en cadena, así que montar un skeleton por fase desmonta y
  // remonta el placeholder - el delay anti-flash de .page-loading se
  // reinicia y la pantalla parpadea. Mejor esperar a que cargue todo.
  const bootLoading =
    phase === "loading" || (phase === "ready" && catalogPhase === "loading");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:max-w-6xl lg:px-8">
      {bootLoading && <SkeletonList />}

      {phase === "error" && (
        <Card className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm text-ink/70">{ta("error")}</p>
          <Button variant="secondary" size="sm" onClick={() => void boot()}>
            {tc("retry")}
          </Button>
        </Card>
      )}

      {phase === "forbidden" && (
        <Card className="py-6 text-center">
          <p className="text-sm text-ink/70">{ta("forbidden")}</p>
        </Card>
      )}

      {phase === "ready" && !bootLoading && (
        <>
          {catalogPhase === "empty" && (
            <Card className="py-6 text-center">
              <p className="text-sm text-ink/70">{t("noQueries")}</p>
            </Card>
          )}

          {catalogPhase === "pro" && <ProPaywall />}

          {catalogPhase === "forbidden" && (
            <Card className="py-6 text-center">
              <p className="text-sm text-ink/70">{ta("forbidden")}</p>
            </Card>
          )}

          {catalogPhase === "error" && (
            <Card className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-sm text-ink/70">{ta("error")}</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => role && void loadCatalog(role)}
              >
                {tc("retry")}
              </Button>
            </Card>
          )}

          {catalogPhase === "ready" && entities.length === 0 && (
            <Card className="py-6 text-center">
              <p className="text-sm text-ink/70">{t("noQueries")}</p>
            </Card>
          )}

          {catalogPhase === "ready" && entities.length > 0 && (
            <>
              {/* Consultas rápidas primero (expandible, cerrado por
                  defecto) - encima de las entidades/filtros. */}
              {role && isQueryRole(role) && (
                <SavedQueries
                  role={role}
                  saved={saved}
                  busyId={savedBusy}
                  onSelect={applyParams}
                  onRename={(id, name) => void renameSaved(id, name)}
                  onDelete={(id) => void deleteSaved(id)}
                />
              )}

              <PillTabs
                ariaLabel={t("entitiesLabel")}
                active={entity ?? ""}
                onSelect={selectEntity}
                items={entities.map((e) => ({
                  key: e.entity,
                  label: t.has(`entities.${e.entity}`)
                    ? t(`entities.${e.entity}`)
                    : e.entity,
                }))}
              />

              {entityDef && (
                <FilterBar
                  entity={entityDef}
                  filters={filters}
                  onChange={setFilters}
                  options={options}
                  loadScopeOptions={loadScopeOptions}
                />
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => void run(1)}
                  disabled={!entity || runPhase === "loading"}
                >
                  {runPhase === "loading" ? <Spinner size="sm" /> : null}
                  {t("apply")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setFilters({});
                    setResult(null);
                    setPage(1);
                    setRunPhase("idle");
                  }}
                  disabled={Object.keys(filters).length === 0 && !result}
                >
                  {t("reset")}
                </Button>
                <span className="ms-auto flex gap-2">
                  {(["csv", "pdf"] as const).map((f) => (
                    <a
                      key={f}
                      href={exportHref(f)}
                      download
                      className={`inline-flex min-h-11 min-w-16 items-center justify-center rounded-xl border px-4 text-xs font-bold uppercase tracking-wide transition-colors ${
                        f === "csv"
                          ? "border-line bg-surface text-ink hover:border-neon/60"
                          : "border-neon/40 bg-neon/10 text-neon hover:border-neon/70"
                      }`}
                    >
                      {f}
                    </a>
                  ))}
                </span>
              </div>

              <div aria-live="polite">
                {notice && (
                  <p role="status" className="text-sm font-medium text-neon">
                    {notice}
                  </p>
                )}
              </div>

              {runPhase === "loading" && <SkeletonText lines={3} />}

              {runPhase === "error" && (
                <Card className="flex flex-col items-center gap-3 py-6 text-center">
                  <p className="text-sm text-ink/70">{ta("error")}</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void run(page)}
                  >
                    {tc("retry")}
                  </Button>
                </Card>
              )}

              {runPhase === "ready" && result && entity && (
                <>
                  {result.summary.length > 0 && (
                    <ul className="flex flex-col gap-1 text-sm text-ink/70">
                      {result.summary.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  )}
                  <QueryTable
                    entity={entity}
                    headers={result.headers}
                    rows={result.rows}
                    total={result.total}
                  />
                  <Pager
                    page={result.page}
                    pageSize={result.pageSize}
                    total={result.total}
                    onPage={(p) => void run(p)}
                  />
                </>
              )}

              {/* Guardar la consulta actual (las rápidas/propias van
                  arriba de los filtros, en el bloque expandible). */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder={t("savePlaceholder")}
                  aria-label={t("savePlaceholder")}
                  className={inputCls}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="shrink-0"
                  onClick={() => void saveCurrent()}
                  disabled={!saveName.trim() || saving || !entity}
                >
                  {saving ? <Spinner size="sm" /> : null}
                  {t("save")}
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
