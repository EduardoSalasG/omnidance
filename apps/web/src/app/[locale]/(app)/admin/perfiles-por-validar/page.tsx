"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  ConfirmSheet,
  RefreshIcon,
} from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import {
  ActionNotice,
  type ActionNoticeData,
} from "@/components/ui/action-notice";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { readError } from "@/components/academy/shared";
import { Link } from "@/i18n/navigation";

type QueueItem = {
  id: string;
  role: string;
  requestedAt: string;
  person: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    verifiedAt: string | null;
    createdAt: string;
  };
  checks: {
    name: boolean;
    emailVerified: boolean;
    phone: boolean;
    actorData: boolean;
  };
  complete: boolean;
};

const CHECK_KEYS = ["name", "emailVerified", "phone", "actorData"] as const;

type AcademyQueueItem = {
  id: string;
  name: string;
  reviewStatus: string;
  createdAt: string;
  owner: { id: string; name: string; email: string | null } | null;
  checks: Record<string, boolean> | null;
  complete: boolean;
};

const ACADEMY_CHECK_KEYS = [
  "name",
  "description",
  "address",
  "contact",
  "photo",
  "activeSeries",
  "upcomingClass",
  "plan",
  "ownerApproved",
] as const;

/**
 * /admin/perfiles-por-validar - cola de actores registrados por landing
 * (ACADEMY_OWNER/PRODUCER en PENDING: ya operan su consola pero son
 * invisibles al público). El admin aprueba solo con checklist completo
 * (el API además rechaza con 409) o rechaza (REJECTED, auditable).
 */
export default function PerfilesPorValidarPage() {
  const tn = useTranslations("nav");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6">
      <ConsoleHeader backHref="/inicio" backLabel={tn("home")} />
      <AdminGate>
        <QueuePanel />
        <AcademyQueuePanel />
      </AdminGate>
    </main>
  );
}

function QueuePanel() {
  const t = useTranslations("adminValidation");
  const tc = useTranslations("common");

  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingReject, setPendingReject] = useState<QueueItem | null>(null);
  // Aviso post-acción local: la fila aprobada/rechazada desaparece de la
  // cola, el aviso confirma que la mutación se aplicó.
  const [notice, setNotice] = useState<ActionNoticeData | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await apiFetch("/admin/validation-queue");
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      setItems((await res.json()) as QueueItem[]);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(item: QueueItem, action: "approve" | "reject") {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/admin/validation-queue/${item.id}/${action}`,
        { method: "POST" },
      );
      if (!res.ok) {
        setError((await readError(res)) ?? tc("error"));
        setPendingReject(null);
        return;
      }
      setPendingReject(null);
      setNotice({
        text: t(action === "approve" ? "approved" : "rejected", {
          name: item.person.name,
        }),
      });
      await load();
    } catch {
      setError(tc("error"));
      setPendingReject(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{t("title")}</h2>
      <p className="text-sm text-ink/60">{t("hint")}</p>

      {loadError && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-ink/60">
            {tc("error")}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}

      {items === null && !loadError && <SkeletonList items={3} />}

      {items !== null && items.length === 0 && (
        <p className="text-sm text-ink/50">{t("empty")}</p>
      )}

      {items !== null && items.length > 0 && (
        <Card className="divide-y divide-line p-0">
          {items.map((item) => (
            <div key={item.id} className="flex flex-col gap-2 px-4 py-3">
              {/* 1ª fila: identidad + rol + link a ficha */}
              <div className="flex items-center gap-3">
                <Link
                  href={`/admin/usuarios/${item.person.id}`}
                  className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-neon"
                >
                  {item.person.name}
                </Link>
                <Badge variant="muted">{t(`roles.${item.role}`)}</Badge>
              </div>

              {/* 2ª fila: checklist de perfil completo */}
              <ul className="flex flex-wrap gap-1.5">
                {CHECK_KEYS.map((k) => (
                  <li
                    key={k}
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      item.checks[k]
                        ? "bg-neon/15 text-neon"
                        : "bg-elevated text-ink/50"
                    }`}
                  >
                    {item.checks[k] ? "✓" : "✗"} {t(`checks.${k}`)}
                  </li>
                ))}
              </ul>

              {/* 3ª fila: acciones - aprobar solo con perfil completo */}
              <div className="flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-400/70 hover:text-red-300"
                  disabled={busy}
                  onClick={() => setPendingReject(item)}
                >
                  {t("reject")}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy || !item.complete}
                  onClick={() => void act(item, "approve")}
                >
                  {t("approve")}
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <ConfirmSheet
        open={pendingReject !== null}
        title={t("rejectConfirm", { name: pendingReject?.person.name ?? "" })}
        confirmLabel={t("reject")}
        busy={busy}
        onConfirm={() => pendingReject && void act(pendingReject, "reject")}
        onClose={() => setPendingReject(null)}
      />

      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
    </section>
  );
}

/**
 * Cola de academias (spec academy-approval-gate): cada fila muestra el
 * checklist ya evaluado por el servidor. La mayoría se auto-publica al
 * completar datos. Aprobar es un override explícito, Rechazar oculta
 * aunque esté completa (REJECTED).
 */
function AcademyQueuePanel() {
  const t = useTranslations("adminValidation");
  const tc = useTranslations("common");

  const [items, setItems] = useState<AcademyQueueItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingReject, setPendingReject] =
    useState<AcademyQueueItem | null>(null);
  // Aviso post-acción local: la academia aprobada/rechazada sale de la
  // cola, el aviso confirma que la mutación se aplicó.
  const [notice, setNotice] = useState<ActionNoticeData | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await apiFetch("/admin/academy-review-queue");
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      setItems((await res.json()) as AcademyQueueItem[]);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(item: AcademyQueueItem, action: "approve" | "reject") {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/admin/academy-review-queue/${item.id}/${action}`,
        { method: "POST" },
      );
      if (!res.ok) {
        setError((await readError(res)) ?? tc("error"));
        setPendingReject(null);
        return;
      }
      setPendingReject(null);
      setNotice({
        text: t(
          action === "approve" ? "academyApproved" : "academyRejected",
          { name: item.name },
        ),
      });
      await load();
    } catch {
      setError(tc("error"));
      setPendingReject(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{t("academiesTitle")}</h2>
      <p className="text-sm text-ink/60">{t("academiesHint")}</p>

      {loadError && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-ink/60">
            {tc("error")}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}

      {items === null && !loadError && <SkeletonList items={3} />}

      {items !== null && items.length === 0 && (
        <p className="text-sm text-ink/50">{t("academiesEmpty")}</p>
      )}

      {items !== null && items.length > 0 && (
        <Card className="divide-y divide-line p-0">
          {items.map((item) => (
            <div key={item.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-center gap-3">
                <Link
                  href={`/admin/academias/${item.id}`}
                  className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-neon"
                >
                  {item.name}
                </Link>
                <Badge variant={item.reviewStatus === "REJECTED" ? "muted" : "neon"}>
                  {item.reviewStatus}
                </Badge>
                {item.owner && (
                  <Link
                    href={`/admin/usuarios/${item.owner.id}`}
                    className="truncate text-xs text-ink/50 hover:text-ink"
                  >
                    {item.owner.name}
                  </Link>
                )}
              </div>

              {item.checks && (
                <ul className="flex flex-wrap gap-1.5">
                  {ACADEMY_CHECK_KEYS.map((k) => (
                    <li
                      key={k}
                      className={`rounded-full px-2 py-0.5 text-[11px] ${
                        item.checks?.[k]
                          ? "bg-neon/15 text-neon"
                          : "bg-elevated text-ink/50"
                      }`}
                    >
                      {item.checks?.[k] ? "✓" : "✗"}{" "}
                      {t(`academiesChecks.${k}`)}
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-400/70 hover:text-red-300"
                  disabled={busy || item.reviewStatus === "REJECTED"}
                  onClick={() => setPendingReject(item)}
                >
                  {t("reject")}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy || item.reviewStatus === "APPROVED"}
                  onClick={() => void act(item, "approve")}
                >
                  {t("approve")}
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <ConfirmSheet
        open={pendingReject !== null}
        title={t("rejectAcademyConfirm", {
          name: pendingReject?.name ?? "",
        })}
        confirmLabel={t("reject")}
        busy={busy}
        onConfirm={() => pendingReject && void act(pendingReject, "reject")}
        onClose={() => setPendingReject(null)}
      />

      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
    </section>
  );
}
