"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Card } from "@/components/ui";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";

// Respuesta de GET /admin/users?q= — liviana, sin analítica por rol.
type SearchUser = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  roles: { id: string; role: string; status: string; createdAt: string }[];
};

const MIN_QUERY = 2;
const DEBOUNCE_MS = 300;

/**
 * /analitica/usuarios — buscador de personas para la ficha de analítica
 * por rol. Misma búsqueda que /admin/usuarios (debounce 300ms, ≥2 chars,
 * el endpoint nunca devuelve listado masivo) pero las cards llevan a la
 * vista de insights, no a la gestión de roles.
 */
export default function AnaliticaUsuariosPage() {
  const t = useTranslations("analytics");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6 pb-24">
      <ConsoleHeader backHref="/analitica" backLabel={t("title")} />
      <AdminGate>
        <SearchPanel />
      </AdminGate>
    </main>
  );
}

function SearchPanel() {
  const t = useTranslations("analytics");
  const tp = useTranslations("profile");
  const tc = useTranslations("common");

  const [userQuery, setUserQuery] = useState("");
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [actionError, setActionError] = useState(false);

  const q = userQuery.trim();

  // Búsqueda con debounce: solo consulta el server con ≥2 caracteres
  // (el endpoint devuelve [] con menos, nunca lista masiva).
  useEffect(() => {
    if (q.length < MIN_QUERY) {
      setUsers([]);
      setSearched(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      apiFetch(`/admin/users?q=${encodeURIComponent(q)}`)
        .then(async (res) => {
          if (!res.ok) throw new Error("fetch failed");
          setUsers((await res.json()) as SearchUser[]);
          setSearched(true);
        })
        .catch(() => setActionError(true))
        .finally(() => setSearching(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);

  const roleLabel = (r: string) =>
    tp.has(`roleLabels.${r}`) ? tp(`roleLabels.${r}`) : r;

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{t("userSearch.title")}</h2>
        <p className="text-sm text-white/60">{t("userSearch.subtitle")}</p>
      </header>

      {actionError && (
        <p role="alert" className="text-sm text-red-400">
          {tc("error")}
        </p>
      )}

      <input
        value={userQuery}
        onChange={(e) => setUserQuery(e.target.value)}
        placeholder={t("userSearch.search")}
        aria-label={t("userSearch.search")}
        type="search"
        className="min-h-[44px] w-full rounded-lg border border-white/15 bg-black/40 px-3 text-sm"
      />

      {q.length === 0 && (
        <p className="text-sm text-white/50">{t("userSearch.searchHint")}</p>
      )}
      {q.length === 1 && (
        <p className="text-sm text-white/50">{t("userSearch.minChars")}</p>
      )}
      {searching && q.length >= MIN_QUERY && (
        <p role="status" className="text-sm text-white/50">
          {tc("loading")}
        </p>
      )}
      {!searching && searched && users.length === 0 && (
        <p className="text-sm text-white/50">{t("userSearch.noResults")}</p>
      )}

      <ul className="flex flex-col gap-3">
        {users.map((u) => (
          <li key={u.id}>
            <Link
              href={`/analitica/usuarios/${u.id}`}
              className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
            >
              <Card className="flex min-h-[44px] flex-col gap-2 transition-colors hover:border-neon/60">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold">{u.name}</span>
                  {u.email && (
                    <span className="truncate text-sm text-white/60">
                      {u.email}
                    </span>
                  )}
                </div>
                {u.roles.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {u.roles.map((r) => (
                      <li key={r.id}>
                        <Badge
                          variant={
                            r.status === "APPROVED" ? "neon" : "outline"
                          }
                        >
                          {roleLabel(r.role)}
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
