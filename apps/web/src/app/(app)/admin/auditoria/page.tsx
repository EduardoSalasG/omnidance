"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui";
import { AdminGate } from "@/components/admin/admin-gate";
import type { AuditRow } from "@/components/admin/types";
import { ConsoleHeader } from "@/components/console/console-header";

const fmtTime = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "short",
  timeStyle: "short",
});

export default function AuditoriaPage() {
  const t = useTranslations("admin");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6 pb-24">
      <ConsoleHeader
        backHref="/admin"
        backLabel={t("title")}
        title={t("tabs.audit")}
      />
      <AdminGate>
        <AuditPanel />
      </AdminGate>
    </main>
  );
}

function AuditPanel() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");

  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [actionError, setActionError] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch("/admin/audit?limit=100");
    if (!res.ok) throw new Error("fetch failed");
    setAudit((await res.json()) as AuditRow[]);
  }, []);

  useEffect(() => {
    void load().catch(() => setActionError(true));
  }, [load]);

  return (
    <>
      {actionError && (
        <p role="alert" className="text-sm text-red-400">
          {tc("error")}
        </p>
      )}

      <section className="flex flex-col gap-3">
        {audit.length === 0 ? (
          <p role="status" className="text-white/60">
            {t("audit.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {audit.map((a) => (
              <li
                key={a.id}
                className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{a.action}</Badge>
                  <span className="text-white/50">
                    {a.targetType}
                    {a.targetId ? `:${a.targetId.slice(0, 8)}` : ""}
                  </span>
                  <span className="ml-auto text-white/50">
                    {fmtTime.format(new Date(a.createdAt))}
                  </span>
                </div>
                {a.payload != null && (
                  <pre className="mt-1 overflow-x-auto text-white/50">
                    {JSON.stringify(a.payload)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
