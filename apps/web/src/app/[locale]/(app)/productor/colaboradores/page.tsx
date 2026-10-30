"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Button,
  Card,
  ConfirmSheet,
  RefreshIcon,
  SkeletonList,
} from "@/components/ui";
import {
  ActionNotice,
  type ActionNoticeData,
} from "@/components/ui/action-notice";
import { ConsoleHeader } from "@/components/console/console-header";
import { ProducerGate } from "@/components/producer/producer-gate";
import {
  OnboardingRunner,
  type TourStep,
} from "@/components/onboarding/OnboardingRunner";
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
  const tt = useTranslations("tours.productorColaboradores");

  const [state, setState] = useState<State>("loading");
  const [items, setItems] = useState<Collaborator[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Quitar de la nómina es destructivo - confirmación con el nombre de
  // la persona (bottom-sheet compartido).
  const [pendingRemove, setPendingRemove] = useState<Collaborator | null>(
    null,
  );
  // Aviso post-acción local: la fila se quita optimista y el aviso
  // confirma que el DELETE persistió.
  const [notice, setNotice] = useState<ActionNoticeData | null>(null);

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
    setPendingRemove(null);
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
      setNotice({ text: t("collaborators.removed") });
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
          // El Button con href renderiza Link y no propaga data-tour -
          // el anchor del tour va en el wrapper.
          <span data-tour="collab-add" className="inline-flex">
            <Button
              size="sm"
              variant="secondary"
              href="/productor/colaboradores/nuevo"
            >
              {`＋ ${t("collaborators.add")}`}
            </Button>
          </span>
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
          </Card>
        )}

        {state === "ok" && items.length > 0 && (
          <ul data-tour="collab-list" className="flex flex-col gap-2">
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
                    onClick={() => setPendingRemove(c)}
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

      <ConfirmSheet
        open={pendingRemove !== null}
        title={t("collaborators.removeTitle", {
          name:
            pendingRemove?.person.name ??
            pendingRemove?.person.email ??
            "",
        })}
        description={t("collaborators.removeDesc")}
        confirmLabel={t("collaborators.remove")}
        busy={pendingRemove !== null && busyId === pendingRemove.person.id}
        onConfirm={() =>
          pendingRemove && void remove(pendingRemove.person.id)
        }
        onClose={() => setPendingRemove(null)}
      />

      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />

      {/* Tour de la nómina (primera visita): con lista vacía el
          anchor collab-list no existe y el tour queda solo en el
          alta - el runner lo filtra solo. */}
      <OnboardingRunner
        tour="productor-colaboradores"
        steps={[
          {
            element: "[data-tour='collab-add']",
            title: tt("s1.title"),
            description: tt("s1.desc"),
            side: "bottom",
          },
          {
            element: "[data-tour='collab-list']",
            title: tt("s2.title"),
            description: tt("s2.desc"),
            side: "top",
          },
        ] satisfies TourStep[]}
      />
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
