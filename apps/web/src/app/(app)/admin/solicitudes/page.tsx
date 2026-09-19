"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";
import { AdminGate } from "@/components/admin/admin-gate";
import type { RoleRequest } from "@/components/admin/types";
import { ConsoleHeader } from "@/components/console/console-header";

const fmtDay = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" });

const STATUS_VARIANT: Record<string, "muted" | "outline" | "neon"> = {
  PENDING: "muted",
  SANDBOX: "outline",
  APPROVED: "neon",
};

export default function SolicitudesPage() {
  const t = useTranslations("admin");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6 pb-24">
      <ConsoleHeader
        backHref="/admin"
        backLabel={t("title")}
        title={t("tabs.requests")}
      />
      <AdminGate>
        <RequestsPanel />
      </AdminGate>
    </main>
  );
}

function RequestsPanel() {
  const t = useTranslations("admin");
  const tp = useTranslations("profile");
  const tc = useTranslations("common");

  const [requests, setRequests] = useState<RoleRequest[]>([]);
  const [acting, setActing] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch("/admin/role-requests");
    if (!res.ok) throw new Error("fetch failed");
    setRequests((await res.json()) as RoleRequest[]);
  }, []);

  useEffect(() => {
    void load().catch(() => setActionError(true));
  }, [load]);

  async function act(req: RoleRequest, action: "approve" | "reject") {
    if (acting) return;
    if (
      action === "reject" &&
      !window.confirm(`${t("reject")}: ${req.person.name}`)
    ) {
      return;
    }
    setActing(req.id);
    setActionError(false);
    try {
      const res = await apiFetch(`/admin/role-requests/${req.id}/${action}`, {
        method: "POST",
      });
      if (!res.ok) return setActionError(true);
      if (action === "approve") {
        setRequests((rs) =>
          rs.map((r) => (r.id === req.id ? { ...r, status: "APPROVED" } : r)),
        );
      } else {
        setRequests((rs) => rs.filter((r) => r.id !== req.id));
      }
    } catch {
      setActionError(true);
    } finally {
      setActing(null);
    }
  }

  const roleLabel = (r: string) =>
    tp.has(`roleLabels.${r}`) ? tp(`roleLabels.${r}`) : r;
  const statusLabel = (s: string) =>
    t.has(`status.${s}`) ? t(`status.${s}`) : s;

  return (
    <>
      {actionError && (
        <p role="alert" className="text-sm text-red-400">
          {tc("error")}
        </p>
      )}

      <section className="flex flex-col gap-4">
        {requests.length === 0 ? (
          <p role="status" className="text-white/60">
            {t("empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {requests.map((r) => (
              <li key={r.id}>
                <Card className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={STATUS_VARIANT[r.status] ?? "muted"}>
                      {statusLabel(r.status)}
                    </Badge>
                    <Badge variant="neon">{roleLabel(r.role)}</Badge>
                    <span className="text-xs text-white/50">
                      {fmtDay.format(new Date(r.createdAt))}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-semibold">{r.person.name}</span>
                    {r.person.email && (
                      <span className="text-sm text-white/60">
                        {r.person.email}
                      </span>
                    )}
                  </div>
                  {r.status === "APPROVED" ? (
                    <Badge variant="neon" className="self-start">
                      {statusLabel("APPROVED")}
                    </Badge>
                  ) : (
                    <div className="flex gap-3">
                      <Button
                        size="sm"
                        className="flex-1"
                        disabled={acting !== null}
                        onClick={() => void act(r, "approve")}
                      >
                        {t("approve")}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1 !text-red-400"
                        disabled={acting !== null}
                        onClick={() => void act(r, "reject")}
                      >
                        {t("reject")}
                      </Button>
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
