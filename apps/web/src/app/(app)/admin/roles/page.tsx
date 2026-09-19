"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Card } from "@/components/ui";
import { AdminGate } from "@/components/admin/admin-gate";
import type { PermissionRow, RoleRow } from "@/components/admin/types";
import { ConsoleHeader } from "@/components/console/console-header";

export default function RolesPage() {
  const t = useTranslations("admin");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6 pb-24">
      <ConsoleHeader backHref="/admin" backLabel={t("title")} />
      <AdminGate>
        <RolesPanel />
      </AdminGate>
    </main>
  );
}

function RolesPanel() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");

  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);

  const [acting, setActing] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);

  const load = useCallback(async () => {
    const [rolesRes, permsRes] = await Promise.all([
      apiFetch("/admin/roles"),
      apiFetch("/admin/permissions"),
    ]);
    if (!rolesRes.ok || !permsRes.ok) throw new Error("fetch failed");
    setRoles((await rolesRes.json()) as RoleRow[]);
    setPermissions((await permsRes.json()) as PermissionRow[]);
  }, []);

  useEffect(() => {
    void load().catch(() => setActionError(true));
  }, [load]);

  async function togglePermission(
    roleKey: string,
    permission: string,
    grant: boolean,
  ) {
    if (acting) return;
    setActing(roleKey + permission);
    setActionError(false);
    try {
      const res = await apiFetch(`/admin/roles/${roleKey}/permissions`, {
        method: "POST",
        body: JSON.stringify({ permission, grant }),
      });
      if (!res.ok) return setActionError(true);
      setRoles((rs) =>
        rs.map((r) =>
          r.key !== roleKey
            ? r
            : {
                ...r,
                permissions: grant
                  ? [...r.permissions, { permissionKey: permission }]
                  : r.permissions.filter(
                      (p) => p.permissionKey !== permission,
                    ),
              },
        ),
      );
    } catch {
      setActionError(true);
    } finally {
      setActing(null);
    }
  }

  return (
    <>
      {actionError && (
        <p role="alert" className="text-sm text-red-400">
          {tc("error")}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <ul className="flex flex-col gap-3">
          {roles.map((r) => (
            <li key={r.key}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-neon">{r.key}</span>
                  <span className="font-semibold">{r.label}</span>
                  {r.isSuperuser && (
                    <Badge variant="neon">{t("roles.superuser")}</Badge>
                  )}
                  {r.requestable && (
                    <Badge variant="outline">{t("roles.requestable")}</Badge>
                  )}
                  <span className="ml-auto text-xs text-white/50">
                    {t("roles.peopleCount", {
                      count: r._count.personRoles,
                    })}
                  </span>
                </div>
                {r.description && (
                  <p className="text-xs text-white/50">{r.description}</p>
                )}
                {!r.isSuperuser && (
                  <div className="flex flex-wrap gap-2">
                    {permissions.map((p) => {
                      const granted = r.permissions.some(
                        (x) => x.permissionKey === p.key,
                      );
                      return (
                        <button
                          key={p.key}
                          disabled={acting !== null}
                          aria-pressed={granted}
                          onClick={() =>
                            void togglePermission(r.key, p.key, !granted)
                          }
                          title={p.description ?? p.key}
                          className={`min-h-[44px] rounded-full border px-3 font-mono text-xs transition ${
                            granted
                              ? "border-neon bg-neon/15 text-neon"
                              : "border-white/15 text-white/50"
                          }`}
                        >
                          {granted ? "✓ " : ""}
                          {p.key}
                        </button>
                      );
                    })}
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
