"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Card } from "@/components/ui";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { FilterBar, type QueryOption } from "@/components/query/FilterBar";
import { entityDef, type QueryFilters } from "@omnidance/shared";

// Respuesta de GET /admin/users?q=&role= - liviana, sin detalle por rol.
type SearchUser = {
  id: string;
  name: string;
  email: string | null;
  createdAt: string;
  roles: { role: string; status: string }[];
};

// Filtros = los de la entidad `people` del catálogo (q + role fk) - mismo
// componente y mismos params que /admin/datos (spec analytics/query-console).
const PEOPLE_DEF = entityDef("ADMIN", "people");

const MIN_QUERY = 2;

export default function UsuariosPage() {
  const t = useTranslations("admin");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6">
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

  const [filters, setFilters] = useState<QueryFilters>({});
  const [roleOptions, setRoleOptions] = useState<QueryOption[]>([]);
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [actionError, setActionError] = useState(false);

  const q = (filters.q ?? "").trim();
  const role = filters.role ?? "";

  // Opciones del filtro de rol - catálogo RBAC (mismas keys que acepta
  // /admin/users?role=).
  useEffect(() => {
    apiFetch("/admin/roles")
      .then(async (res) => {
        if (!res.ok) return;
        const list = (await res.json()) as { key: string; label: string }[];
        setRoleOptions(list.map((r) => ({ value: r.key, label: r.label })));
      })
      .catch(() => {});
  }, []);

  // Búsqueda auto-aplicada: el endpoint nunca lista masiva - exige q de
  // ≥2 chars o un rol (FilterBar ya mete debounce al texto).
  useEffect(() => {
    if (!role && q.length < MIN_QUERY) {
      setUsers([]);
      setSearched(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (role) params.set("role", role);
    apiFetch(`/admin/users?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("fetch failed");
        if (cancelled) return;
        setUsers((await res.json()) as SearchUser[]);
        setSearched(true);
      })
      .catch(() => !cancelled && setActionError(true))
      .finally(() => !cancelled && setSearching(false));
    return () => {
      cancelled = true;
    };
  }, [q, role]);

  const roleLabel = (r: string) =>
    tp.has(`roleLabels.${r}`) ? tp(`roleLabels.${r}`) : r;
  const statusLabel = (s: string) =>
    t.has(`status.${s}`) ? t(`status.${s}`) : s;

  return (
    <section className="flex flex-col gap-4">
      {actionError && (
        <p role="alert" className="text-sm text-red-400">
          {tc("error")}
        </p>
      )}

      {PEOPLE_DEF && (
        <FilterBar
          entity={PEOPLE_DEF}
          filters={filters}
          onChange={setFilters}
          options={{ roles: roleOptions }}
        />
      )}

      {!role && q.length === 0 && (
        <p className="text-sm text-ink/50">{t("users.searchHint")}</p>
      )}
      {!role && q.length === 1 && (
        <p className="text-sm text-ink/50">{t("users.minChars")}</p>
      )}
      {searching && (role || q.length >= MIN_QUERY) && (
        <p role="status" className="page-loading text-sm text-ink/50">
          {tc("loading")}
        </p>
      )}
      {!searching && searched && users.length === 0 && (
        <p className="text-sm text-ink/50">{t("users.noResults")}</p>
      )}

      <ul className="flex flex-col gap-3">
        {users.map((u) => (
          <li key={u.id}>
            <Link
              href={`/admin/usuarios/${u.id}`}
              className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
            >
              <Card className="flex min-h-[44px] flex-col gap-2 transition-colors hover:border-neon/60">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold">{u.name}</span>
                  {u.email && (
                    <span className="truncate text-sm text-ink/60">
                      {u.email}
                    </span>
                  )}
                </div>
                {u.roles.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {u.roles.map((r) => (
                      <li key={r.role}>
                        <Badge
                          variant={
                            r.status === "APPROVED" ? "neon" : "outline"
                          }
                        >
                          {roleLabel(r.role)}
                          {r.status !== "APPROVED" &&
                            ` · ${statusLabel(r.status)}`}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
