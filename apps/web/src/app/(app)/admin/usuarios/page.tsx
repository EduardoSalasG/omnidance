"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";
import { AdminGate } from "@/components/admin/admin-gate";
import type { RoleRow, UserRow } from "@/components/admin/types";
import { ConsoleHeader } from "@/components/console/console-header";

const STATUSES = ["PENDING", "SANDBOX", "APPROVED"];

export default function UsuariosPage() {
  const t = useTranslations("admin");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6 pb-24">
      <ConsoleHeader backHref="/admin" backLabel={t("title")} />
      <AdminGate>
        <UsersPanel />
      </AdminGate>
    </main>
  );
}

function UsersPanel() {
  const t = useTranslations("admin");
  const tp = useTranslations("profile");
  const tc = useTranslations("common");

  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);

  const [acting, setActing] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);
  const [userQuery, setUserQuery] = useState("");

  const load = useCallback(
    async (q = "") => {
      const res = await apiFetch(
        `/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`,
      );
      if (!res.ok) throw new Error("fetch failed");
      setUsers((await res.json()) as UserRow[]);
      // catálogo de roles para el dropdown de asignación
      if (roles.length === 0) {
        const rr = await apiFetch("/admin/roles");
        if (rr.ok) setRoles((await rr.json()) as RoleRow[]);
      }
    },
    [roles.length],
  );

  useEffect(() => {
    void load().catch(() => setActionError(true));
  }, [load]);

  async function setUserRole(personId: string, role: string, status: string) {
    if (acting) return;
    setActing(personId + role);
    setActionError(false);
    try {
      const res = await apiFetch(`/admin/users/${personId}/roles`, {
        method: "POST",
        body: JSON.stringify({ role, status }),
      });
      if (!res.ok) return setActionError(true);
      await load(userQuery);
    } catch {
      setActionError(true);
    } finally {
      setActing(null);
    }
  }

  async function revokeRole(personId: string, role: string) {
    if (acting) return;
    if (!window.confirm(`${t("users.revoke")}: ${role}`)) return;
    setActing(personId + role);
    setActionError(false);
    try {
      const res = await apiFetch(`/admin/users/${personId}/roles/${role}`, {
        method: "DELETE",
      });
      if (!res.ok) return setActionError(true);
      await load(userQuery);
    } catch {
      setActionError(true);
    } finally {
      setActing(null);
    }
  }

  const roleLabel = (r: string) =>
    roles.find((x) => x.key === r)?.label ??
    (tp.has(`roleLabels.${r}`) ? tp(`roleLabels.${r}`) : r);
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void load(userQuery).catch(() => setActionError(true));
          }}
        >
          <input
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
            placeholder={t("users.search")}
            aria-label={t("users.search")}
            className="min-h-[44px] w-full rounded-lg border border-white/15 bg-black/40 px-3 text-sm"
          />
        </form>
        <ul className="flex flex-col gap-3">
          {users.map((u) => (
            <li key={u.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-col">
                  <span className="font-semibold">{u.name}</span>
                  {u.email && (
                    <span className="text-sm text-white/60">{u.email}</span>
                  )}
                </div>
                {u.roles.length === 0 ? (
                  <span className="text-xs text-white/50">
                    {t("users.noRoles")}
                  </span>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {u.roles.map((r) => (
                      <li
                        key={r.id}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <Badge variant="neon">{roleLabel(r.role)}</Badge>
                        <select
                          value={r.status}
                          disabled={acting !== null}
                          onChange={(e) =>
                            void setUserRole(u.id, r.role, e.target.value)
                          }
                          className="min-h-[44px] rounded-lg border border-white/15 bg-black/40 px-2 text-sm"
                          aria-label={t("users.roleStatus", {
                            role: roleLabel(r.role),
                          })}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {statusLabel(s)}
                            </option>
                          ))}
                        </select>
                        <button
                          disabled={acting !== null}
                          onClick={() => void revokeRole(u.id, r.role)}
                          className="min-h-[44px] rounded-lg px-2 text-xs text-red-400"
                        >
                          {t("users.revoke")}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <select
                    id={`add-${u.id}`}
                    className="min-h-[44px] flex-1 rounded-lg border border-white/15 bg-black/40 px-2 text-sm"
                    defaultValue=""
                    aria-label={t("users.addRole")}
                  >
                    <option value="" disabled>
                      {t("users.addRole")}
                    </option>
                    {roles
                      .filter(
                        (r) => !u.roles.some((ur) => ur.role === r.key),
                      )
                      .map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.label}
                        </option>
                      ))}
                  </select>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={acting !== null}
                    aria-label={t("users.addRole")}
                    onClick={() => {
                      const sel = document.getElementById(
                        `add-${u.id}`,
                      ) as HTMLSelectElement | null;
                      const role = sel?.value;
                      if (role) void setUserRole(u.id, role, "PENDING");
                    }}
                  >
                    +
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
