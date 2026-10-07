"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, CheckIcon } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { AdminGate } from "@/components/admin/admin-gate";
import type { Param } from "@/components/admin/types";
import { ConsoleHeader } from "@/components/console/console-header";

function parseValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export default function ParametrosPage() {
  const t = useTranslations("admin");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6">
      <ConsoleHeader backHref="/admin" backLabel={t("title")} />
      <AdminGate>
        <ParamsPanel />
      </AdminGate>
    </main>
  );
}

function ParamsPanel() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");

  // null = GET /admin/params en vuelo → skeleton (mismo patrón que el
  // sub-panel de fees con paramsLoading).
  const [params, setParams] = useState<Param[] | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await apiFetch("/admin/params");
    if (!res.ok) throw new Error("fetch failed");
    const rows = (await res.json()) as Param[];
    setParams(rows);
    setDrafts(
      Object.fromEntries(rows.map((p) => [p.key, JSON.stringify(p.value)])),
    );
  }, []);

  useEffect(() => {
    void load().catch(() => setActionError(true));
  }, [load]);

  async function saveParam(key: string) {
    if (acting) return;
    setActing(key);
    setActionError(false);
    try {
      const res = await apiFetch(`/admin/params/${key}`, {
        method: "PUT",
        body: JSON.stringify({ value: parseValue(drafts[key] ?? "") }),
      });
      if (!res.ok) return setActionError(true);
      setSavedKey(key);
      setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 2000);
      await load();
    } catch {
      setActionError(true);
    } finally {
      setActing(null);
    }
  }

  return (
    <>
      {actionError && (
        <p role="alert" className="text-sm text-red-400">
          {tc("error")}
        </p>
      )}

      <section className="flex flex-col gap-4">
        <p className="text-xs text-ink/50">{t("params.hint")}</p>
        {params === null ? (
          <SkeletonList items={4} lines={1} />
        ) : (
        <ul className="flex flex-col gap-3">
          {params.map((p) => (
            <li key={p.key}>
              <Card className="flex flex-col gap-2">
                <span className="font-mono text-sm text-neon">{p.key}</span>
                {p.description && (
                  <span className="text-xs text-ink/50">
                    {p.description}
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <input
                    value={drafts[p.key] ?? ""}
                    onChange={(e) =>
                      setDrafts((d) => ({
                        ...d,
                        [p.key]: e.target.value,
                      }))
                    }
                    className="min-h-[44px] flex-1 rounded-lg border border-ink/15 bg-canvas px-3 font-mono text-sm"
                    aria-label={p.key}
                  />
                  <Button
                    size="sm"
                    disabled={
                      acting !== null ||
                      drafts[p.key] === JSON.stringify(p.value)
                    }
                    onClick={() => void saveParam(p.key)}
                  >
                    {savedKey === p.key ? (
                      <>
                        <CheckIcon className="h-4 w-4" />
                        {t("saved")}
                      </>
                    ) : (
                      tc("save")
                    )}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
        )}
      </section>

      <ProducerParamsSection />
    </>
  );
}

const FEE_FIELDS = [
  "platformFeePct",
  "presaleCutoffMinutes",
] as const;
type FeeField = (typeof FEE_FIELDS)[number];
type FeeValues = Record<FeeField, number | null>;

const FEE_LABEL_KEY: Record<FeeField, string> = {
  platformFeePct: "platformFeePct",
  presaleCutoffMinutes: "presaleCutoffLabel",
};

// El corte se guarda en minutos del día del evento pero se edita como
// "HH:MM" (input time). Valores post-medianoche (>1439) no caben en el
// input: se muestran vacíos y se preservan al guardar (ver save()).
const minutesToTime = (m: number | null): string =>
  m == null || m >= 1440
    ? ""
    : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const timeToMinutes = (t: string): number | null => {
  const trimmed = t.trim();
  if (!/^\d{2}:\d{2}$/.test(trimmed)) return null;
  return Number(trimmed.slice(0, 2)) * 60 + Number(trimmed.slice(3, 5));
};

type ProducerRow = {
  id: string;
  name: string | null;
  email: string | null;
  hasCustomParams: boolean;
};

/** GET /admin/producers/:id/fee-params (y respuesta del PUT). */
type FeeParamsView = {
  producerId: string;
  defaults: FeeValues;
  effective: FeeValues;
};

/** Draft → número o null ("" / NaN → null = vuelve a heredar el global). */
function parseFeeDraft(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function draftsFromDefaults(defaults: FeeValues): Record<FeeField, string> {
  return {
    platformFeePct: defaults.platformFeePct?.toString() ?? "",
    presaleCutoffMinutes: minutesToTime(defaults.presaleCutoffMinutes),
  };
}

/**
 * Defaults financieros por productor (PUT /admin/producers/:id/fee-params,
 * spec producer-fee-model): la única comisión es la tasa todo incluido
 * (pasarela + fee neto + IVA, descontada de la liquidación). Cadena:
 * override del evento → default del productor → fees.managed_allin_pct.
 * Input vacío = null = hereda; el placeholder muestra la tasa efectiva.
 */
function ProducerParamsSection() {
  const tp = useTranslations("producerParams");
  const tc = useTranslations("common");

  const [producers, setProducers] = useState<ProducerRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [view, setView] = useState<FeeParamsView | null>(null);
  const [drafts, setDrafts] = useState<Record<FeeField, string>>({
    platformFeePct: "",
    presaleCutoffMinutes: "",
  });
  const [listError, setListError] = useState(false);
  // Valor crudo del corte tal como vino del GET: si es post-medianoche
  // (>1439) el input time no puede mostrarlo - un guardado con el campo
  // vacío lo preserva en vez de limpiarlo (save()).
  const [cutoffLoadedRaw, setCutoffLoadedRaw] = useState<number | null>(null);
  const [paramsLoading, setParamsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const loadProducers = useCallback(async () => {
    const res = await apiFetch("/admin/producers");
    if (!res.ok) throw new Error("fetch failed");
    const rows = (await res.json()) as ProducerRow[];
    setProducers(rows);
    setSelectedId((cur) => (cur === "" ? (rows[0]?.id ?? "") : cur));
  }, []);

  useEffect(() => {
    void loadProducers().catch(() => setListError(true));
  }, [loadProducers]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    void (async () => {
      setParamsLoading(true);
      setView(null);
      setSaveError(false);
      try {
        const res = await apiFetch(
          `/admin/producers/${selectedId}/fee-params`,
        );
        if (!res.ok) {
          if (!cancelled) setListError(true);
          return;
        }
        const data = (await res.json()) as FeeParamsView;
        if (cancelled) return;
        setView(data);
        setDrafts(draftsFromDefaults(data.defaults));
        setCutoffLoadedRaw(data.defaults.presaleCutoffMinutes ?? null);
      } catch {
        if (!cancelled) setListError(true);
      } finally {
        if (!cancelled) setParamsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function save() {
    if (saving || !selectedId) return;
    setSaving(true);
    setSaveError(false);
    setSaved(false);
    try {
      const res = await apiFetch(
        `/admin/producers/${selectedId}/fee-params`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platformFeePct: parseFeeDraft(drafts.platformFeePct),
            presaleCutoffMinutes:
              drafts.presaleCutoffMinutes.trim() !== ""
                ? timeToMinutes(drafts.presaleCutoffMinutes)
                : // post-medianoche no representable en el input: conservar
                  (cutoffLoadedRaw ?? 0) >= 1440
                  ? cutoffLoadedRaw
                  : null,
          }),
        },
      );
      if (!res.ok) return setSaveError(true);
      const data = (await res.json()) as FeeParamsView;
      setView(data);
      setDrafts(draftsFromDefaults(data.defaults));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      // Refresca el badge hasCustomParams del productor seleccionado.
      await loadProducers().catch(() => setListError(true));
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  const selected = producers.find((p) => p.id === selectedId);

  return (
    <section
      className="flex flex-col gap-4"
      aria-labelledby="producer-params-heading"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="producer-params-heading"
          className="text-sm font-semibold uppercase tracking-wide text-ink/50"
        >
          {tp("adminSection")}
        </h2>
        <p className="text-xs text-ink/50">{tp("adminHint")}</p>
      </div>

      {listError && (
        <p role="alert" className="text-sm text-red-400">
          {tc("error")}
        </p>
      )}

      {producers.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="min-h-[44px] flex-1 rounded-lg border border-ink/15 bg-canvas px-3 text-sm"
            aria-label={tp("selectProducer")}
          >
            {producers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name
                  ? `${p.name} · ${p.email ?? ""}`
                  : (p.email ?? p.id)}
              </option>
            ))}
          </select>
          {selected?.hasCustomParams && (
            <Badge variant="neon">{tp("custom")}</Badge>
          )}
        </div>
      )}

      {paramsLoading && <SkeletonList />}

      {view && !paramsLoading && (
        <Card className="flex flex-col gap-4">
          {FEE_FIELDS.map((f) => {
            const isCutoff = f === "presaleCutoffMinutes";
            const effective = view.effective[f];
            return (
              <div key={f} className="flex flex-col gap-1">
                <label
                  htmlFor={`producer-fee-${f}`}
                  className="text-sm text-ink/70"
                >
                  {tp(FEE_LABEL_KEY[f])}
                </label>
                <input
                  id={`producer-fee-${f}`}
                  type={isCutoff ? "time" : "number"}
                  inputMode={isCutoff ? undefined : "decimal"}
                  min={isCutoff ? undefined : 0}
                  step={isCutoff ? undefined : "any"}
                  value={drafts[f]}
                  placeholder={
                    !isCutoff && effective != null ? String(effective) : ""
                  }
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [f]: e.target.value }))
                  }
                  className="min-h-[44px] rounded-lg border border-ink/15 bg-canvas px-3 font-mono text-sm"
                />
                <p className="text-xs text-ink/50">
                  {tp("effective")}:{" "}
                  {isCutoff ? (
                    effective != null ? (
                      effective >= 1440 ? (
                        `${minutesToTime(effective % 1440)} (+1d)`
                      ) : (
                        minutesToTime(effective)
                      )
                    ) : (
                      "·"
                    )
                  ) : effective != null ? (
                    `${effective}%`
                  ) : (
                    "·"
                  )}
                </p>
                {isCutoff && (
                  <p className="text-xs text-ink/50">
                    {tp("presaleCutoffHint")}
                  </p>
                )}
              </div>
            );
          })}
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              disabled={saving}
              onClick={() => void save()}
            >
              {saved ? tp("saved") : tp("save")}
            </Button>
            {saveError && (
              <p role="alert" className="text-sm text-red-400">
                {tp("error")}
              </p>
            )}
          </div>
        </Card>
      )}
    </section>
  );
}
