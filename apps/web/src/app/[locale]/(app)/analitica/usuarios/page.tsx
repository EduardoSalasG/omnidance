"use client";

import { useEffect, useState } from "react";

import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  ChevronRightIcon,
  SkeletonList,
} from "@/components/ui";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { inputCls } from "@/components/academy/shared";
import { Link } from "@/i18n/navigation";

// Envelope de GET /admin/users?q= - liviano, sin analítica por rol.
// La paginación vive en /admin/usuarios; aquí basta la primera página
// (buscador por nombre, nunca listado masivo).
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
 * /analitica/usuarios - buscador de personas para la ficha de analítica
 * por rol. Misma búsqueda que /admin/usuarios (debounce 300ms, ≥2 chars,
 * el endpoint nunca devuelve listado masivo) pero las cards llevan a la
 * vista de insights, no a la gestión de roles.
 */
export default function AnaliticaUsuariosPage() {
  const t = useTranslations("analytics");
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:max-w-none lg:px-4">
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
  const [retryTick, setRetryTick] = useState(0);

  const q = userQuery.trim();

  // Búsqueda con debounce: solo consulta el server con ≥2 caracteres
  // (el endpoint devuelve [] con menos, nunca lista masiva). retryTick
  // re-dispara el fetch desde el botón del estado de error.
  useEffect(() => {
    if (q.length < MIN_QUERY) {
      setUsers([]);
      setSearched(false);
      setSearching(false);
      setActionError(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      apiFetch(`/admin/users?q=${encodeURIComponent(q)}`)
        .then(async (res) => {
          if (!res.ok) throw new Error("fetch failed");
          const data = (await res.json()) as { items: SearchUser[] };
          setUsers(data.items);
          setSearched(true);
          setActionError(false);
        })
        .catch(() => setActionError(true))
        .finally(() => setSearching(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, retryTick]);

  const roleLabel = (r: string) =>
    tp.has(`roleLabels.${r}`) ? tp(`roleLabels.${r}`) : r;

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{t("userSearch.title")}</h2>
        <p className="text-sm text-ink/60">{t("userSearch.subtitle")}</p>
      </header>

      {actionError && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-red-400">
            {tc("error")}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setRetryTick((n) => n + 1)}
          >
            {tc("retry")}
          </Button>
        </div>
      )}

      <input
        value={userQuery}
        onChange={(e) => setUserQuery(e.target.value)}
        placeholder={t("userSearch.search")}
        aria-label={t("userSearch.search")}
        type="search"
        className={inputCls}
      />

      {q.length === 0 && (
        <p className="text-sm text-ink/50">{t("userSearch.searchHint")}</p>
      )}
      {q.length === 1 && (
        <p className="text-sm text-ink/50">{t("userSearch.minChars")}</p>
      )}
      {/* Mientras busca: skeleton solo si aún no hay resultados; con
          resultados previos se conservan hasta que llegue la nueva
          respuesta (nada de "Cargando…" de texto plano). */}
      {searching && q.length >= MIN_QUERY && users.length === 0 && (
        <SkeletonList items={3} />
      )}
      {!searching && searched && users.length === 0 && (
        <p className="text-sm text-ink/50">{t("userSearch.noResults")}</p>
      )}

      <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
        {users.map((u) => (
          <li key={u.id}>
            <Link
              href={`/analitica/usuarios/${u.id}`}
              className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
            >
              <Card className="flex min-h-11 items-center gap-3 transition-colors hover:border-neon/60">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
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
                </div>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink/40" />
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
