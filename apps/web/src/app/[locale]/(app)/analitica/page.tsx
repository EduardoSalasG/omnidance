"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, isTierRequired } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import {
  useActorEntitlements,
  useEntitlements,
} from "@/lib/entitlements-context";
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
import { TierPaywall } from "@/components/tier-paywall";
import {
  OnboardingRunner,
  type TourStep,
} from "@/components/onboarding/OnboardingRunner";
import {
  ActionNotice,
  type ActionNoticeData,
} from "@/components/ui/action-notice";
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
 * no hay selector acá). Lente PRODUCER: el entitlement del productor sin
 * la feature o 403 tier.required → paywall (contrato unificado). Lentes
 * sin entidades (VENUE_MANAGER) →
 * estado muted.
 */

type Role = QueryRole | "VENUE_MANAGER";
type BootPhase = "loading" | "error" | "forbidden" | "ready";
type CatalogPhase =
  | "loading"
  | "error"
  | "forbidden"
  | "tier"
  | "empty"
  | "ready";
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
  const tt = useTranslations("tours.analitica");

  const { me } = useMe();
  // Entitlement del productor propio (spec unified-actor-entitlements):
  // sin la feature de analítica la lente PRODUCER va directo al paywall.
  const producerEnt = useActorEntitlements("PRODUCER");
  // Lente academia: basta que ALGUNA academia propia cubra la feature
  // (misma regla que assertAnyOwnedAcademyMeets del API - la consola
  // agrega sobre todas las academias del owner).
  const academyEnt = useEntitlements();
  const activeRole = useActiveRole(me?.roles);
  // El drill por usuario (/analitica/usuarios) es solo ADMIN - el paso
  // del tour que lo explica se incluye solo cuando el rol está.
  const isAdmin = me?.roles.includes("ADMIN") ?? false;

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
  // Feedback de las mutaciones de consultas guardadas (éxito y error).
  const [notice, setNotice] = useState<ActionNoticeData | null>(null);

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
  // Gate proactivo por feature: el entitlement del productor sin
  // "analytics" en lente PRODUCER salta directo al paywall sin fetch;
  // en lente ACADEMY_OWNER la consola de consultas es feature
  // `analytics` (PRO) de alguna academia propia (spec academy-tier-v2).
  // El 403 tier.required queda de fallback.
  const tierLocked =
    (role === "PRODUCER" &&
      !producerEnt.loading &&
      !producerEnt.has("analytics")) ||
    (role === "ACADEMY_OWNER" &&
      !academyEnt.loading &&
      !academyEnt.academies.some((a) => a.features.includes("analytics")));

  const loadCatalog = useCallback(
    async (r: Role) => {
      if (!isQueryRole(r) || QUERY_CATALOG[r].length === 0) {
        setCatalogPhase("empty");
        return;
      }
      setCatalogPhase("loading");
      try {
        const res = await apiFetch(`/query/catalog?role=${r}`);
        if (res.status === 403 && (await isTierRequired(res))) {
          setCatalogPhase("tier");
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
    if (tierLocked) {
      setCatalogPhase("tier");
      return;
    }
    void loadCatalog(role);
    if (isQueryRole(role)) void loadSaved(role);
  }, [role, tierLocked, loadCatalog, loadSaved]);

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
        if (res.status === 403 && (await isTierRequired(res))) {
          setRunPhase("idle");
          setCatalogPhase("tier");
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
        setNotice({ text: t("saved.created") });
        if (role) void loadSaved(role);
      } else {
        setNotice({ text: t("saved.actionError"), error: true });
      }
    } catch {
      setNotice({ text: t("saved.actionError"), error: true });
    } finally {
      setSaving(false);
    }
  }

  async function renameSaved(id: string, name: string) {
    setSavedBusy(id);
    setNotice(null);
    try {
      const res = await apiFetch(`/query/saved/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setNotice({ text: t("saved.renamed") });
        if (role) await loadSaved(role);
      } else {
        setNotice({ text: t("saved.actionError"), error: true });
      }
    } catch {
      setNotice({ text: t("saved.actionError"), error: true });
    } finally {
      setSavedBusy(null);
    }
  }

  async function deleteSaved(id: string) {
    setSavedBusy(id);
    setNotice(null);
    try {
      const res = await apiFetch(`/query/saved/${id}`, { method: "DELETE" });
      if (res.ok) {
        setNotice({ text: t("saved.deleted") });
        if (role) await loadSaved(role);
      } else {
        setNotice({ text: t("saved.actionError"), error: true });
      }
    } catch {
      setNotice({ text: t("saved.actionError"), error: true });
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

          {catalogPhase === "tier" && (
            // El catálogo respondió 403 tier.required (contrato
            // unificado: productor y academia por el mismo error) -
            // paywall con el CTA de suscripción del actor.
            <TierPaywall
              feature="analytics"
              actorType={role === "PRODUCER" ? "PRODUCER" : "ACADEMY"}
            />
          )}

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
                <div data-tour="an-saved">
                  <SavedQueries
                    role={role}
                    saved={saved}
                    busyId={savedBusy}
                    onSelect={applyParams}
                    onRename={(id, name) => void renameSaved(id, name)}
                    onDelete={(id) => void deleteSaved(id)}
                  />
                </div>
              )}

              <div data-tour="an-entities">
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
              </div>

              {entityDef && (
                <div data-tour="an-filters">
                  <FilterBar
                    entity={entityDef}
                    filters={filters}
                    onChange={setFilters}
                    options={options}
                    loadScopeOptions={loadScopeOptions}
                  />
                </div>
              )}

              <div
                className="flex flex-wrap items-center gap-2"
                data-tour="an-run"
              >
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
              <div className="flex gap-2" data-tour="an-save">
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

              {/* Tour de primera visita - montado solo con el catálogo
                  listo (los targets an-* existen recién acá); el paso
                  admin del drill por usuario se agrega solo con rol. */}
              <OnboardingRunner
                tour="analitica"
                steps={
                  [
                    {
                      element: "[data-tour='an-saved']",
                      title: tt("s1.title"),
                      description: tt("s1.desc"),
                      side: "bottom",
                    },
                    {
                      element: "[data-tour='an-entities']",
                      title: tt("s2.title"),
                      description: tt("s2.desc"),
                      side: "bottom",
                    },
                    {
                      element: "[data-tour='an-filters']",
                      title: tt("s3.title"),
                      description: tt("s3.desc"),
                      side: "bottom",
                    },
                    {
                      element: "[data-tour='an-run']",
                      title: tt("s4.title"),
                      description: tt("s4.desc"),
                      side: "top",
                    },
                    {
                      element: "[data-tour='an-save']",
                      title: tt("s5.title"),
                      description: tt("s5.desc"),
                      side: "top",
                    },
                    ...(isAdmin
                      ? ([
                          {
                            // En ≥lg la hamburguesa no existe - el
                            // anchor cae a la sidebar (mismo texto).
                            element: "[data-tour='appbar-menu']",
                            title: tt("s6.title"),
                            description: tt("s6.desc"),
                            side: "bottom",
                          },
                          {
                            element: "[data-tour='app-sidebar']",
                            title: tt("s6.title"),
                            description: tt("s6.desc"),
                            side: "right",
                          },
                        ] satisfies TourStep[])
                      : []),
                  ] satisfies TourStep[]
                }
              />
            </>
          )}
        </>
      )}

      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
    </main>
  );
}
