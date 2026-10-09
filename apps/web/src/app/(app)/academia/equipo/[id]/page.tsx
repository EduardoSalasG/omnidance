"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, RefreshIcon, SkeletonList, Spinner } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { CAPS, type Caps } from "@/components/academy/staff-section";
import { readError } from "@/components/academy/shared";

type StaffDetail = {
  person: { id: string; name: string | null; email: string | null; phone: string | null };
  caps: Caps;
  createdAt: string;
};

const dayFmt = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * /academia/equipo/[id] - detalle del colaborador (nivel 2): datos,
 * permisos vigentes, CTA "Editar permisos" (nivel 3) y baja del equipo.
 */
export default function StaffDetailPage() {
  const t = useTranslations("academyStaff");
  const params = useParams<{ id: string }>();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-3xl lg:px-8">
      <ConsoleHeader backHref="/academia/equipo" backLabel={t("title")} />
      <AcademyGate>
        {({ academy }) => (
          <Detail
            key={`${academy.id}:${params.id}`}
            academyId={academy.id}
            personId={params.id}
          />
        )}
      </AcademyGate>
    </main>
  );
}

function Detail({
  academyId,
  personId,
}: {
  academyId: string;
  personId: string;
}) {
  const t = useTranslations("academyStaff");
  const tc = useTranslations("common");
  const router = useRouter();

  const [detail, setDetail] = useState<StaffDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    const res = await apiFetch(
      `/academies/${academyId}/staff/${personId}`,
    ).catch(() => null);
    if (!res?.ok) {
      setLoadError(true);
      return;
    }
    setDetail((await res.json()) as StaffDetail);
  }, [academyId, personId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove() {
    if (!detail) return;
    const label = detail.person.name ?? detail.person.email ?? personId;
    if (!window.confirm(t("removeConfirm", { name: label }))) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/staff/${personId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setErr((await readError(res)) ?? t("error"));
        return;
      }
      router.push("/academia/equipo");
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-ink/60">
          {tc("error")}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }
  if (!detail) return <SkeletonList />;

  const active = CAPS.filter((c) => detail.caps[c]);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          {detail.person.name ?? detail.person.email}
        </h2>
        <Card className="flex flex-col gap-3 p-4">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            {detail.person.email && (
              <div>
                <dt className="text-xs text-ink/50">{t("fieldEmail")}</dt>
                <dd className="font-medium">{detail.person.email}</dd>
              </div>
            )}
            {detail.person.phone && (
              <div>
                <dt className="text-xs text-ink/50">{t("fieldPhone")}</dt>
                <dd className="font-medium">{detail.person.phone}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-ink/50">{t("memberSince")}</dt>
              <dd className="tabular-nums text-ink/70">
                {dayFmt.format(new Date(detail.createdAt))}
              </dd>
            </div>
          </dl>
        </Card>
      </section>

      <section className="flex flex-col gap-3" aria-label={t("capsTitle")}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
            {t("capsTitle")}
          </h3>
          <Button
            size="sm"
            variant="secondary"
            href={`/academia/equipo/${personId}/editar`}
          >
            {t("editCaps")}
          </Button>
        </div>
        <Card className="flex flex-wrap gap-1.5 p-4">
          {active.length === 0 ? (
            <p className="text-sm text-ink/50">{t("capsNone")}</p>
          ) : (
            active.map((cap) => (
              <Badge key={cap} variant="muted">
                {t(`cap.${cap}`)}
              </Badge>
            ))
          )}
        </Card>
      </section>

      {err && (
        <p role="alert" className="text-sm text-red-400">
          {err}
        </p>
      )}
      {/* Zona destructiva al pie, centrada y en rojo - mismo patrón que
          "Eliminar amigo" (/amigos/[id]) y la baja del profesor. */}
      <div className="flex justify-center pt-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void remove()}
          className="min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-red-400/80 transition-colors hover:text-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon disabled:opacity-50"
        >
          {busy ? <Spinner size="sm" /> : null}
          {t("remove")}
        </button>
      </div>
    </div>
  );
}
