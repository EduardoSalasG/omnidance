"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, RefreshIcon, SkeletonList } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import {
  CAPS,
  CapCheckbox,
  type Caps,
} from "@/components/academy/staff-section";
import { readError } from "@/components/academy/shared";

/**
 * /academia/equipo/[id]/editar - edición de permisos del colaborador
 * (nivel 3): checkbox por capacidad + guardar. Vuelve al detalle.
 */
export default function StaffEditPage() {
  const t = useTranslations("academyStaff");
  const params = useParams<{ id: string }>();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-3xl lg:px-8">
      <ConsoleHeader
        backHref={`/academia/equipo/${params.id}`}
        backLabel={t("detailTitle")}
      />
      <AcademyGate>
        {({ academy }) => (
          <EditCaps
            key={`${academy.id}:${params.id}`}
            academyId={academy.id}
            personId={params.id}
          />
        )}
      </AcademyGate>
    </main>
  );
}

function EditCaps({
  academyId,
  personId,
}: {
  academyId: string;
  personId: string;
}) {
  const t = useTranslations("academyStaff");
  const tc = useTranslations("common");
  const router = useRouter();

  const [caps, setCaps] = useState<Caps | null>(null);
  const [name, setName] = useState<string>("");
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
    const body = (await res.json()) as {
      person: { name: string | null; email: string | null };
      caps: Caps;
    };
    setCaps(body.caps);
    setName(body.person.name ?? body.person.email ?? "");
  }, [academyId, personId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!caps) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/staff/${personId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(caps),
        },
      );
      if (!res.ok) {
        setErr((await readError(res)) ?? t("error"));
        return;
      }
      router.push(`/academia/equipo/${personId}`);
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
  if (!caps) return <SkeletonList />;

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("editTitle")}
        </h2>
        {name && <p className="mt-1 text-xs text-ink/50">{name}</p>}
      </div>
      <form onSubmit={save} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-3">
          {CAPS.map((cap) => (
            <CapCheckbox
              key={cap}
              cap={cap}
              checked={caps[cap]}
              disabled={busy}
              onToggle={(c, next) =>
                setCaps((prev) => (prev ? { ...prev, [c]: next } : prev))
              }
            />
          ))}
        </div>
        {err && (
          <p role="alert" className="text-sm text-red-400">
            {err}
          </p>
        )}
        <div>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? t("adding") : t("saveCaps")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
