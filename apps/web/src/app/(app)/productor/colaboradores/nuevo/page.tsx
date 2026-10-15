"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card } from "@/components/ui";
import { ConsoleHeader } from "@/components/console/console-header";
import { ProducerGate } from "@/components/producer/producer-gate";
import { inputCls, readError } from "@/components/producer/shared";

type SearchResult = {
  id: string;
  name: string | null;
  photoUrl: string | null;
};

/**
 * /productor/colaboradores/nuevo - alta a la nómina del productor
 * (POST /producer/staff). Busca personas por nombre en el directorio
 * general (/people/search - excluye al propio usuario); al seleccionar
 * se agrega directo.
 */
function NewCollaborator() {
  const t = useTranslations("producer");
  const tc = useTranslations("common");
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Alta por correo: persona nueva → stub + invitación por magic link;
  // existente → se suma a la nómina directo. En ambos casos gana el rol
  // DANCER si no lo tenía.
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [inviting, setInviting] = useState(false);
  const [done, setDone] = useState<"added" | "invited" | null>(null);

  const backHref = "/productor/colaboradores";

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      apiFetch(`/people/search?q=${encodeURIComponent(term)}`)
        .then(async (res) => setResults(res.ok ? await res.json() : []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  async function add(personId: string) {
    if (busyId) return;
    setBusyId(personId);
    setError(null);
    try {
      const res = await apiFetch("/producer/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId }),
      });
      if (!res.ok) {
        setError((await readError(res)) ?? tc("error"));
        return;
      }
      setDone("added");
      setTimeout(() => router.push(backHref), 1200);
    } catch {
      setError(tc("error"));
    } finally {
      setBusyId(null);
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || inviting) return;
    setInviting(true);
    setError(null);
    try {
      const res = await apiFetch("/producer/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          ...(name.trim() ? { name: name.trim() } : {}),
        }),
      });
      if (!res.ok) {
        setError((await readError(res)) ?? tc("error"));
        return;
      }
      const body = (await res.json()) as { invited?: boolean };
      setDone(body.invited ? "invited" : "added");
      setTimeout(() => router.push(backHref), 1200);
    } catch {
      setError(tc("error"));
    } finally {
      setInviting(false);
    }
  }

  return (
    <>
      <ConsoleHeader
        backHref={backHref}
        backLabel={t("collaborators.title")}
      />

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold leading-tight">
          {t("collaborators.add")}
        </h2>

        {done && (
          <Card className="p-6 text-center">
            <p role="status" className="text-lg font-bold text-neon">
              {done === "invited"
                ? t("collaborators.invited")
                : t("collaborators.added")}
            </p>
          </Card>
        )}

        {!done && (
        <Card className="flex flex-col gap-3">
          <label className="flex flex-col gap-2">
            <span className="text-sm text-ink/70">
              {t("collaborators.personName")}
              <span aria-hidden="true" className="text-neon">
                {" "}
                *
              </span>
            </span>
            <input
              type="text"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("collaborators.personPlaceholder")}
              className={inputCls}
            />
          </label>

          <div aria-live="polite">
            {searching && (
              <p role="status" className="text-xs text-ink/50">
                {tc("loading")}
              </p>
            )}
            {results !== null && results.length === 0 && (
              <p role="status" className="text-xs text-ink/50">
                {tc("filter.noResults")}
              </p>
            )}
          </div>

          {results !== null && results.length > 0 && (
            <ul className="flex flex-col gap-1" role="listbox">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={busyId === p.id}
                    onClick={() => void add(p.id)}
                    className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-ink/10 bg-canvas px-3 py-2 text-left hover:border-neon/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon disabled:opacity-60"
                  >
                    {p.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img loading="lazy" decoding="async"
                        src={p.photoUrl}
                        alt=""
                        className="size-8 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex size-8 items-center justify-center rounded-full bg-ink/10 text-xs font-semibold">
                        {(p.name ?? "?").slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="truncate text-sm font-medium">
                      {p.name ?? p.id}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
        </Card>
        )}

        {!done && (
          <Card className="flex flex-col gap-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
              {t("collaborators.inviteByEmail")}
            </p>
            <form onSubmit={invite} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-sm text-ink/70">
                  {t("collaborators.emailLabel")}
                  <span aria-hidden="true" className="text-neon">
                    {" "}
                    *
                  </span>
                </span>
                <input
                  type="email"
                  required
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("collaborators.emailPlaceholder")}
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm text-ink/70">
                  {t("collaborators.nameLabel")}
                </span>
                <input
                  type="text"
                  autoComplete="off"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCls}
                />
              </label>
              <Button type="submit" disabled={!email.trim() || inviting}>
                {inviting
                  ? tc("loading")
                  : t("collaborators.inviteSubmit")}
              </Button>
            </form>
          </Card>
        )}
      </section>
    </>
  );
}

export default function NewCollaboratorPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:max-w-3xl lg:px-8">
      <ProducerGate>
        <NewCollaborator />
      </ProducerGate>
    </main>
  );
}
