"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Button,
  CheckIcon,
  RefreshIcon,
  SkeletonList,
  Spinner,
} from "@/components/ui";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { useFeatures } from "@/lib/features-context";
import { useMe } from "@/lib/me-context";
import { useDateFmt } from "@/lib/intl";
import { inputCls } from "@/components/academy/shared";
import { Link, useRouter } from "@/i18n/navigation";
import type { CityGuideDetail } from "@/components/admin/types";

// Ficha editor de la guía editorial de una ciudad (spec city-guides):
// 3 secciones de texto con contador (máx 8000), un "Guardar" global con
// dirty state + "Descartar" que restaura, y aviso del browser al salir
// con cambios sin guardar (beforeunload). Detrás del flag city_guides.

const SECTION_MAX = 8000;
const SECTION_KEYS = ["intro", "nightlife", "practical"] as const;
type SectionKey = (typeof SECTION_KEYS)[number];
type Drafts = Record<SectionKey, string>;

type LoadState = "loading" | "error" | "notFound" | "ready";

export default function AdminCiudadGuiaPage({
  params,
}: {
  params: Promise<{ cityId: string }>;
}) {
  const { cityId } = use(params);
  const t = useTranslations("admin");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-3xl lg:px-8">
      <ConsoleHeader
        backHref="/admin/ciudades"
        backLabel={t("modules.cities")}
      />
      <AdminGate>
        <GuideEditor cityId={cityId} />
      </AdminGate>
    </main>
  );
}

function GuideEditor({ cityId }: { cityId: string }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const dt = useDateFmt({ dateStyle: "medium", timeStyle: "short" });
  const { flags, loading: flagsLoading } = useFeatures();
  const enabled = flags.city_guides === true;
  const { me } = useMe();

  const [detail, setDetail] = useState<CityGuideDetail | null>(null);
  // Drafts editables; `saved` es la última versión persistida (base del
  // dirty state y del "Descartar").
  const [drafts, setDrafts] = useState<Drafts | null>(null);
  const [saved, setSaved] = useState<Drafts | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Navegación interna interceptada con cambios sin guardar - el href
  // pendiente abre el ConfirmSheet de "salir sin guardar".
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch(
        `/admin/city-guides/${encodeURIComponent(cityId)}`,
      );
      if (res.status === 404) {
        setState("notFound");
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      const d = (await res.json()) as CityGuideDetail;
      const sections: Drafts = {
        intro: d.guide.intro,
        nightlife: d.guide.nightlife,
        practical: d.guide.practical,
      };
      setDetail(d);
      setDrafts(sections);
      setSaved(sections);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [cityId]);

  // El fetch espera a que el flag resuelva ON (OFF → el API 404ea).
  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  const dirty =
    drafts != null &&
    saved != null &&
    SECTION_KEYS.some((k) => drafts[k] !== saved[k]);

  // Protección de salida con cambios sin guardar: beforeunload cubre
  // cerrar/recargar; el listener de document cubre CUALQUIER navegación
  // in-app (back del header, drawer, sidebar, links de la página) -
  // ev.preventDefault del click del anchor abre el ConfirmSheet y solo
  // si confirma se hace router.push al destino interceptado.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    const onDocClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank") return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(anchor.getAttribute("href"));
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onDocClick, true);
    // Atrás del navegador en SPA no dispara beforeunload ni click:
    // se apila una entrada para que el primer back caiga en popstate
    // (la página no cambia porque la URL empujada es la misma) y se
    // abre el ConfirmSheet; confirmar = history.back() real.
    history.pushState(null, "", location.href);
    const onPop = () => setPendingHref("__back__");
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onDocClick, true);
      window.removeEventListener("popstate", onPop);
    };
  }, [dirty]);

  // Limpia el timer del flash de guardado si el componente se desmonta.
  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  async function save() {
    if (saving || !dirty || !drafts) return;
    setSaving(true);
    setSaveError(false);
    try {
      const res = await apiFetch(
        `/admin/city-guides/${encodeURIComponent(cityId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(drafts),
        },
      );
      if (!res.ok) {
        setSaveError(true);
        return;
      }
      const g = (await res.json()) as Drafts & { updatedAt: string };
      const sections: Drafts = {
        intro: g.intro,
        nightlife: g.nightlife,
        practical: g.practical,
      };
      setSaved(sections);
      setDrafts(sections);
      // La ficha refleja al actor actual como último editor sin
      // refetch (el PUT no devuelve updatedBy resuelto).
      setDetail((d) =>
        d
          ? {
              ...d,
              guide: {
                ...d.guide,
                ...g,
                updatedBy: me
                  ? { id: me.id, name: me.name, email: me.email ?? null }
                  : d.guide.updatedBy,
              },
            }
          : d,
      );
      setSavedFlash(true);
      savedTimer.current = setTimeout(() => setSavedFlash(false), 2500);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  // Orden de guards: el flag se evalúa ANTES del estado de carga - con
  // el flag OFF el fetch nunca corre y state queda "loading" forever.
  if (flagsLoading) {
    return <SkeletonList items={3} lines={2} />;
  }

  if (!enabled) {
    return <p className="text-sm text-ink/60">{t("cities.disabled")}</p>;
  }

  if (state === "loading") {
    return <SkeletonList items={3} lines={2} />;
  }

  if (state === "notFound") {
    return (
      <p role="alert" className="text-sm text-ink/60">
        {t("cities.notFound")}
      </p>
    );
  }

  if (state === "error" || !detail || !drafts) {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-ink/60">
          {t("cities.error")}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }

  return (
    <>
      {/* Cabecera de ficha: nombre de la ciudad en h2 (el h1 es el del
          appbar) + última edición + link a la landing pública. */}
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">
          {t("cities.editorTitle", { city: detail.city.name })}
        </h2>
        <p className="text-xs text-ink/50">
          {detail.city.country.name}
          {" · "}
          {detail.guide.updatedAt
            ? t("cities.updatedAt", {
                date: dt.format(new Date(detail.guide.updatedAt)),
              }) +
              (detail.guide.updatedBy
                ? ` · ${detail.guide.updatedBy.name}`
                : "")
            : t("cities.neverEdited")}
          {" · "}
          <Link
            href={`/ciudades/${detail.city.slug}`}
            className="text-neon/80 underline-offset-2 transition-colors hover:text-neon hover:underline"
          >
            {t("cities.viewLanding")}
          </Link>
        </p>
      </div>

      {SECTION_KEYS.map((key) => (
        <section key={key} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <label
              htmlFor={`guide-${key}`}
              className="text-sm font-semibold"
            >
              {t(`cities.sections.${key}.label`)}
            </label>
            <span className="text-xs tabular-nums text-ink/50">
              {t("cities.counter", {
                used: drafts[key].length,
                max: SECTION_MAX,
              })}
            </span>
          </div>
          <p
            id={`guide-${key}-help`}
            className="text-xs text-ink/50"
          >
            {t(`cities.sections.${key}.help`)}
          </p>
          <textarea
            id={`guide-${key}`}
            aria-describedby={`guide-${key}-help`}
            rows={6}
            maxLength={SECTION_MAX}
            value={drafts[key]}
            onChange={(e) =>
              setDrafts((d) => (d ? { ...d, [key]: e.target.value } : d))
            }
            className={`${inputCls} min-h-[120px] py-3`}
          />
        </section>
      ))}

      {saveError && (
        <p role="alert" className="text-sm text-red-400">
          {tc("error")}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? (
            <Spinner size="sm" />
          ) : savedFlash ? (
            <>
              <CheckIcon className="h-4 w-4" /> {t("saved")}
            </>
          ) : (
            tc("save")
          )}
        </Button>
        <Button
          variant="secondary"
          disabled={!dirty || saving}
          onClick={() => saved && setDrafts(saved)}
        >
          {t("cities.discard")}
        </Button>
        {/* Zona aria-live: avisa "Guardado" y el estado sin guardar. */}
        <p role="status" className="text-xs text-ink/50">
          {savedFlash
            ? t("saved")
            : dirty
              ? t("cities.unsavedHint")
              : ""}
        </p>
      </div>

      <ConfirmSheet
        open={pendingHref != null}
        title={t("cities.unsavedTitle")}
        description={t("cities.unsavedDesc")}
        confirmLabel={t("cities.leaveAnyway")}
        onConfirm={() => {
          const href = pendingHref;
          setPendingHref(null);
          if (href === "__back__") window.history.back();
          else if (href) router.push(href);
        }}
        onClose={() => {
          setPendingHref(null);
          // Re-arma la guardia: si cancela y sigue dirty, vuelve a
          // empujar la entrada para el próximo back.
          if (dirty) history.pushState(null, "", location.href);
        }}
      />
    </>
  );
}
