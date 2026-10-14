"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, RefreshIcon, SkeletonList } from "@/components/ui";
import { ConsoleHeader } from "@/components/console/console-header";
import { ProducerGate } from "@/components/producer/producer-gate";
import { readError } from "@/components/producer/shared";

type Collaborator = {
  id: string;
  person: {
    id: string;
    name: string | null;
    email: string | null;
    photoUrl: string | null;
  };
};

type State = "loading" | "ok" | "error";

/**
 * /productor/colaboradores - nómina del productor (GET /producer/staff).
 * Las personas de esta lista son las que aparecen como candidatas al
 * agregar staff a un evento (junto al historial de asignaciones).
 * El alta vive en /productor/colaboradores/nuevo; aquí solo quitar.
 */
function CollaboratorsList() {
  const t = useTranslations("producer");
  const tc = useTranslations("common");

  const [state, setState] = useState<State>("loading");
  const [items, setItems] = useState<Collaborator[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch("/producer/staff");
      if (!res.ok) {
        setState("error");
        return;
      }
      setItems((await res.json()) as Collaborator[]);
      setState("ok");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(personId: string) {
    if (busyId) return;
    setBusyId(personId);
    setActionError(null);
    try {
      const res = await apiFetch(`/producer/staff/${personId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setActionError((await readError(res)) ?? tc("error"));
        return;
      }
      setItems((prev) => prev.filter((c) => c.person.id !== personId));
    } catch {
      setActionError(tc("error"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <ConsoleHeader
        backHref="/inicio"
        backLabel={tc("appName")}
        actions={
          <Button
            size="sm"
            variant="secondary"
            href="/productor/colaboradores/nuevo"
          >
            {`＋ ${t("collaborators.add")}`}
          </Button>
        }
      />

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold leading-tight">
            {t("collaborators.title")}
          </h2>
          <p className="text-sm text-ink/60">{t("collaborators.desc")}</p>
        </div>

        {state === "loading" && <SkeletonList items={3} lines={1} />}

        {state === "error" && (
          <div className="flex items-center gap-3">
            <p role="alert" className="text-sm text-red-400">
              {tc("error")}
            </p>
            <Button size="sm" variant="ghost" onClick={() => void load()}>
              <RefreshIcon /> {tc("retry")}
            </Button>
          </div>
        )}

        {state === "ok" && items.length === 0 && (
          <Card className="flex flex-col items-start gap-3">
            <p role="status" className="text-sm text-ink/60">
              {t("collaborators.empty")}
            </p>
            <Button
              size="sm"
              variant="secondary"
              href="/productor/colaboradores/nuevo"
            >
              {t("collaborators.add")}
            </Button>
          </Card>
        )}

        {state === "ok" && items.length > 0 && (
          <ul className="flex flex-col gap-2">
            {items.map((c) => (
              <li key={c.id}>
                <Card className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {c.person.name ?? c.person.email ?? c.person.id}
                    </p>
                    {c.person.name && c.person.email && (
                      <p className="truncate text-xs text-ink/50">
                        {c.person.email}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === c.person.id}
                    onClick={() => void remove(c.person.id)}
                  >
                    {t("collaborators.remove")}
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}

        {actionError && (
          <p role="alert" className="text-sm text-red-400">
            {actionError}
          </p>
        )}
      </section>
    </>
  );
}

export default function CollaboratorsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:max-w-3xl lg:px-8">
      <ProducerGate>
        <CollaboratorsList />
      </ProducerGate>
    </main>
  );
}
