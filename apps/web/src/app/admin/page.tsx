"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";

// GET /admin/role-requests devuelve solo PENDING/SANDBOX (ver AdminController);
// APPROVED se usa como confirmación visual tras aprobar en esta sesión.
type RoleRequest = {
  id: string;
  personId: string;
  role: string;
  status: string;
  createdAt: string;
  person: { id: string; name: string; email: string | null };
};

type Gate = "loading" | "unauth" | "notAdmin" | "error" | "ready";

const fmtDay = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" });

const STATUS_VARIANT: Record<string, "muted" | "outline" | "neon"> = {
  PENDING: "muted",
  SANDBOX: "outline",
  APPROVED: "neon",
};

export default function AdminPage() {
  const t = useTranslations("admin");
  const tp = useTranslations("profile");
  const tc = useTranslations("common");

  const [gate, setGate] = useState<Gate>("loading");
  const [requests, setRequests] = useState<RoleRequest[]>([]);
  const [acting, setActing] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);

  const boot = useCallback(async () => {
    setGate("loading");
    try {
      const me = await apiFetch("/me");
      if (me.status === 401) {
        setGate("unauth");
        return;
      }
      if (!me.ok) {
        setGate("error");
        return;
      }
      const data = (await me.json()) as { id: string; roles: string[] };
      if (!data.roles.includes("ADMIN")) {
        setGate("notAdmin");
        return;
      }
      const res = await apiFetch("/admin/role-requests");
      if (!res.ok) {
        setGate("error");
        return;
      }
      setRequests((await res.json()) as RoleRequest[]);
      setGate("ready");
    } catch {
      setGate("error");
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  async function act(req: RoleRequest, action: "approve" | "reject") {
    if (acting) return;
    // Reject borra el PersonRole en la API (no hay status REJECTED) → confirmar.
    if (
      action === "reject" &&
      !window.confirm(`${t("reject")}: ${req.person.name}`)
    ) {
      return;
    }
    setActing(req.id);
    setActionError(false);
    try {
      const res = await apiFetch(
        `/admin/role-requests/${req.id}/${action}`,
        { method: "POST" },
      );
      if (!res.ok) {
        setActionError(true);
        return;
      }
      if (action === "approve") {
        // El endpoint lista solo pendientes → queda marcada APPROVED hasta refetch.
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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {gate === "loading" && <p className="text-white/60">{tc("loading")}</p>}

      {gate === "unauth" && (
        <Button href="/login" size="lg" className="self-start">
          {tc("login")}
        </Button>
      )}

      {gate === "notAdmin" && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-white/70">{t("notAdmin")}</p>
          <Button href="/" variant="secondary">
            {tc("appName")}
          </Button>
        </div>
      )}

      {gate === "error" && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-white/70">{tc("error")}</p>
          <Button variant="secondary" onClick={() => void boot()}>
            ↻ {tc("retry")}
          </Button>
        </div>
      )}

      {gate === "ready" && (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
            {t("roleRequests")}
          </h2>

          {actionError && (
            <p role="alert" className="text-sm text-red-400">
              {tc("error")}
            </p>
          )}

          {requests.length === 0 ? (
            <p className="text-white/60">{t("empty")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {requests.map((r) => (
                <li key={r.id}>
                  <Card className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={STATUS_VARIANT[r.status] ?? "muted"}
                      >
                        {t.has(`status.${r.status}`)
                          ? t(`status.${r.status}`)
                          : r.status}
                      </Badge>
                      <Badge variant="neon">
                        {tp.has(`roleLabels.${r.role}`)
                          ? tp(`roleLabels.${r.role}`)
                          : r.role}
                      </Badge>
                      <span className="text-xs text-white/40">
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
                        {t("status.APPROVED")}
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
      )}
    </main>
  );
}
