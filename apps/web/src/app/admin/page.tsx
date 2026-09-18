"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";

type RoleRequest = {
  id: string;
  personId: string;
  role: string;
  status: string;
  createdAt: string;
  person: { id: string; name: string; email: string | null };
};

type Param = {
  key: string;
  value: unknown;
  description: string | null;
  updatedAt: string;
};

type UserRow = {
  id: string;
  name: string;
  email: string | null;
  createdAt: string;
  roles: { id: string; role: string; status: string; createdAt: string }[];
};

type AuditRow = {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  payload: unknown;
  createdAt: string;
};

type RoleRow = {
  key: string;
  label: string;
  description: string | null;
  requestable: boolean;
  isSuperuser: boolean;
  permissions: { permissionKey: string }[];
  _count: { personRoles: number };
};

type PermissionRow = { key: string; description: string | null };

type Gate = "loading" | "unauth" | "notAdmin" | "error" | "ready";
type Tab = "requests" | "roles" | "params" | "users" | "audit";

const fmtDay = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" });
const fmtTime = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "short",
  timeStyle: "short",
});

const STATUS_VARIANT: Record<string, "muted" | "outline" | "neon"> = {
  PENDING: "muted",
  SANDBOX: "outline",
  APPROVED: "neon",
};

const STATUSES = ["PENDING", "SANDBOX", "APPROVED"];

function parseValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export default function AdminPage() {
  const t = useTranslations("admin");
  const tp = useTranslations("profile");
  const tc = useTranslations("common");

  const [gate, setGate] = useState<Gate>("loading");
  const [tab, setTab] = useState<Tab>("requests");

  const [requests, setRequests] = useState<RoleRequest[]>([]);
  const [params, setParams] = useState<Param[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);

  const [acting, setActing] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [userQuery, setUserQuery] = useState("");

  const loadTab = useCallback(async (which: Tab, q = "") => {
    if (which === "roles") {
      const [rolesRes, permsRes] = await Promise.all([
        apiFetch("/admin/roles"),
        apiFetch("/admin/permissions"),
      ]);
      if (!rolesRes.ok || !permsRes.ok) throw new Error("fetch failed");
      setRoles((await rolesRes.json()) as RoleRow[]);
      setPermissions((await permsRes.json()) as PermissionRow[]);
      return;
    }
    const urls: Record<Exclude<Tab, "roles">, string> = {
      requests: "/admin/role-requests",
      params: "/admin/params",
      users: `/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`,
      audit: "/admin/audit?limit=100",
    };
    const res = await apiFetch(urls[which]);
    if (!res.ok) throw new Error("fetch failed");
    const data = await res.json();
    if (which === "requests") setRequests(data as RoleRequest[]);
    if (which === "params") {
      const rows = data as Param[];
      setParams(rows);
      setDrafts(
        Object.fromEntries(rows.map((p) => [p.key, JSON.stringify(p.value)])),
      );
    }
    if (which === "users") {
      setUsers(data as UserRow[]);
      // catálogo de roles para el dropdown de asignación
      if (roles.length === 0) {
        const rr = await apiFetch("/admin/roles");
        if (rr.ok) setRoles((await rr.json()) as RoleRow[]);
      }
    }
    if (which === "audit") setAudit(data as AuditRow[]);
  }, [roles.length]);

  const boot = useCallback(async () => {
    setGate("loading");
    try {
      const me = await apiFetch("/me");
      if (me.status === 401) return setGate("unauth");
      if (!me.ok) return setGate("error");
      const data = (await me.json()) as { id: string; roles: string[] };
      if (!data.roles.includes("ADMIN")) return setGate("notAdmin");
      await loadTab("requests");
      setGate("ready");
    } catch {
      setGate("error");
    }
  }, [loadTab]);

  useEffect(() => {
    void boot();
  }, [boot]);

  async function switchTab(next: Tab) {
    setTab(next);
    setActionError(false);
    try {
      await loadTab(next, userQuery);
    } catch {
      setActionError(true);
    }
  }

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

  async function saveParam(key: string) {
    if (acting) return;
    setActing(key);
    setActionError(false);
    try {
      const res = await apiFetch(`/admin/params/${key}`, {
        method: "PUT",
        body: JSON.stringify({ value: parseValue(drafts[key] ?? "") }),
      });
      if (!res.ok) return setActionError(true);
      setSavedKey(key);
      setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 2000);
      await loadTab("params");
    } catch {
      setActionError(true);
    } finally {
      setActing(null);
    }
  }

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
      await loadTab("users", userQuery);
    } catch {
      setActionError(true);
    } finally {
      setActing(null);
    }
  }

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
      await loadTab("users", userQuery);
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
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-6 pb-24">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {gate === "loading" && (
        <p role="status" className="text-white/60">
          {tc("loading")}
        </p>
      )}

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
          <p role="alert" className="text-white/70">
            {tc("error")}
          </p>
          <Button variant="secondary" onClick={() => void boot()}>
            ↻ {tc("retry")}
          </Button>
        </div>
      )}

      {gate === "ready" && (
        <>
          <nav className="flex gap-2 overflow-x-auto" aria-label={t("title")}>
            {(["requests", "roles", "params", "users", "audit"] as Tab[]).map((k) => (
              <button
                key={k}
                onClick={() => void switchTab(k)}
                aria-current={tab === k || undefined}
                className={`min-h-[44px] shrink-0 rounded-full px-4 text-sm font-semibold transition ${
                  tab === k
                    ? "bg-neon text-black"
                    : "bg-white/10 text-white/70"
                }`}
              >
                {t(`tabs.${k}`)}
              </button>
            ))}
          </nav>

          {actionError && (
            <p role="alert" className="text-sm text-red-400">
              {tc("error")}
            </p>
          )}

          {tab === "requests" && (
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
          )}

          {tab === "roles" && (
            <section className="flex flex-col gap-3">
              <ul className="flex flex-col gap-3">
                {roles.map((r) => (
                  <li key={r.key}>
                    <Card className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm text-neon">
                          {r.key}
                        </span>
                        <span className="font-semibold">{r.label}</span>
                        {r.isSuperuser && (
                          <Badge variant="neon">{t("roles.superuser")}</Badge>
                        )}
                        {r.requestable && (
                          <Badge variant="outline">
                            {t("roles.requestable")}
                          </Badge>
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
                                  void togglePermission(
                                    r.key,
                                    p.key,
                                    !granted,
                                  )
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
          )}

          {tab === "params" && (
            <section className="flex flex-col gap-4">
              <p className="text-xs text-white/50">{t("params.hint")}</p>
              <ul className="flex flex-col gap-3">
                {params.map((p) => (
                  <li key={p.key}>
                    <Card className="flex flex-col gap-2">
                      <span className="font-mono text-sm text-neon">
                        {p.key}
                      </span>
                      {p.description && (
                        <span className="text-xs text-white/50">
                          {p.description}
                        </span>
                      )}
                      <div className="flex items-center gap-2">
                        <input
                          value={drafts[p.key] ?? ""}
                          onChange={(e) =>
                            setDrafts((d) => ({
                              ...d,
                              [p.key]: e.target.value,
                            }))
                          }
                          className="min-h-[44px] flex-1 rounded-lg border border-white/15 bg-black/40 px-3 font-mono text-sm"
                          aria-label={p.key}
                        />
                        <Button
                          size="sm"
                          disabled={
                            acting !== null ||
                            drafts[p.key] === JSON.stringify(p.value)
                          }
                          onClick={() => void saveParam(p.key)}
                        >
                          {savedKey === p.key ? t("saved") : tc("save")}
                        </Button>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {tab === "users" && (
            <section className="flex flex-col gap-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void loadTab("users", userQuery).catch(() =>
                    setActionError(true),
                  );
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
                          <span className="text-sm text-white/60">
                            {u.email}
                          </span>
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
          )}

          {tab === "audit" && (
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
          )}
        </>
      )}
    </main>
  );
}
