"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, SkeletonList } from "@/components/ui";
import { Spinner } from "@/components/ui/spinner";
import { AdminGate } from "@/components/admin/admin-gate";
import type { FeatureFlagRow } from "@/components/admin/types";
import { ConsoleHeader } from "@/components/console/console-header";
import { useDateFmt } from "@/lib/intl";

// Consola /admin/funcionalidades (spec feature-flags-admin): catálogo
// de flags seedado desde código — el admin solo flippea `enabled`, sin
// alta/baja (un flag sin consumer no sirve). Toggle reversible sin
// confirmación: optimistic flip + revert si el PATCH falla, Spinner
// inline mientras aplica.

export default function FuncionalidadesPage() {
  const t = useTranslations("admin");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6">
      <ConsoleHeader backHref="/inicio" backLabel={t("modules.backHome")} />
      <AdminGate>
        <FlagsPanel />
      </AdminGate>
    </main>
  );
}

function FlagsPanel() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const dt = useDateFmt({ dateStyle: "short", timeStyle: "short" });

  // null = GET /admin/feature-flags en vuelo → skeleton.
  const [flags, setFlags] = useState<FeatureFlagRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  // Toggle en vuelo por key (uno a la vez) + error de la última acción.
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Aviso sr-only del último cambio aplicado (role="status").
  const [announce, setAnnounce] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    const res = await apiFetch("/admin/feature-flags");
    if (!res.ok) {
      setLoadError(true);
      setFlags([]);
      return;
    }
    setFlags((await res.json()) as FeatureFlagRow[]);
  }, []);

  useEffect(() => {
    void load().catch(() => {
      setLoadError(true);
      setFlags([]);
    });
  }, [load]);

  async function toggle(flag: FeatureFlagRow) {
    if (busy) return;
    const next = !flag.enabled;
    setBusy(flag.key);
    setActionError(null);
    // Flip optimista: el switch refleja la intención al instante; si el
    // PATCH falla se revierte al estado real (spec: nunca queda
    // "encendido" visualmente contra el estado real).
    setFlags((cur) =>
      cur?.map((f) => (f.key === flag.key ? { ...f, enabled: next } : f)) ??
      cur,
    );
    try {
      const res = await apiFetch(
        `/admin/feature-flags/${encodeURIComponent(flag.key)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: next }),
        },
      );
      if (!res.ok) throw new Error("toggle failed");
      // Refetch: el PATCH devuelve la fila cruda (updatedById), pero la
      // card muestra updatedBy resuelto a nombre - la lista lo trae.
      await load();
      setAnnounce(
        t("features.announce", {
          label: flag.label,
          state: next ? t("features.on") : t("features.off"),
        }),
      );
    } catch {
      // Revert del flip optimista.
      setFlags((cur) =>
        cur?.map((f) =>
          f.key === flag.key ? { ...f, enabled: flag.enabled } : f,
        ) ?? cur,
      );
      setActionError(flag.key);
    } finally {
      setBusy(null);
    }
  }

  if (flags === null) {
    return <SkeletonList items={4} lines={2} />;
  }

  return (
    <section className="flex flex-col gap-4">
      <p className="text-xs text-ink/50">{t("features.hint")}</p>
      {/* Aviso del último toggle para lectores de pantalla - el switch
          ya anuncia su estado vía aria-checked, esto confirma que el
          servidor persistió el cambio. */}
      <span role="status" className="sr-only">
        {announce}
      </span>

      {loadError && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-red-400">
            {t("features.loadError")}
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void load()}
          >
            {tc("retry")}
          </Button>
        </div>
      )}

      {flags.length === 0 && !loadError ? (
        <Card className="p-4 text-sm text-ink/60">
          {t("features.empty")}
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {flags.map((f) => {
            const isBusy = busy === f.key;
            return (
              <li key={f.key}>
                <Card className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{f.label}</span>
                        <Badge variant={f.enabled ? "neon" : "muted"}>
                          {f.enabled ? t("features.on") : t("features.off")}
                        </Badge>
                      </div>
                      <span className="font-mono text-xs text-ink/50">
                        {f.key}
                      </span>
                    </div>
                    {/* Switch: hit area ≥44px vía min-h-11 en el botón;
                        el pill visual es más chico. Optimistic flip con
                        revert en error - sin confirm (reversible). */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={f.enabled}
                      aria-label={f.label}
                      disabled={busy !== null}
                      onClick={() => void toggle(f)}
                      className="inline-flex min-h-11 shrink-0 items-center rounded-full p-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon disabled:opacity-60"
                    >
                      {isBusy ? (
                        <Spinner size="sm" className="px-3" />
                      ) : (
                        <span
                          aria-hidden="true"
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            f.enabled ? "bg-neon/70" : "bg-elevated"
                          }`}
                        >
                          <span
                            className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                              f.enabled ? "translate-x-5" : "translate-x-0.5"
                            }`}
                          />
                        </span>
                      )}
                    </button>
                  </div>

                  {f.description && (
                    <p className="text-sm text-ink/60">{f.description}</p>
                  )}

                  <p className="text-xs text-ink/50">
                    {t("features.updatedAt", {
                      date: dt.format(new Date(f.updatedAt)),
                    })}
                    {f.updatedBy && (
                      <>
                        {" · "}
                        {t("features.updatedBy", {
                          name: f.updatedBy.name || (f.updatedBy.email ?? ""),
                        })}
                      </>
                    )}
                  </p>

                  {actionError === f.key && (
                    <p role="alert" className="text-sm text-red-400">
                      {tc("error")}
                    </p>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
