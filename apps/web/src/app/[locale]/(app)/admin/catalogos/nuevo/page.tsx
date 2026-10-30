"use client";

import { use, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card } from "@/components/ui";
import { showActionNotice } from "@/components/ui/action-notice";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { inputCls, readError } from "@/components/academy/shared";
import { useRouter } from "@/i18n/navigation";

// Espejo de GENRES en CatalogsController (admin/catalogs) - mismo set
// que la página del listado.
const GENRES = ["SALSA", "BACHATA", "CUBANO", "OTHER"] as const;
type Genre = (typeof GENRES)[number];

const CATS = {
  styles: { endpoint: "/admin/catalogs/styles", field: "genre" },
  levels: { endpoint: "/admin/catalogs/class-levels", field: "order" },
  types: { endpoint: "/admin/catalogs/class-types", field: null },
} as const;
type Cat = keyof typeof CATS;

/**
 * /admin/catalogos/nuevo?cat=styles|levels|types - alta de un valor de
 * catálogo (patrón crear = página dedicada). `cat` ausente/inválido cae
 * a la primera sección (estilos). Vuelve al listado tras crear.
 */
export default function NuevoValorCatalogoPage(
  props: { searchParams: Promise<{ cat?: string }> },
) {
  const { cat } = use(props.searchParams);
  const cfg = CATS[(cat as Cat) in CATS ? (cat as Cat) : "styles"];
  const t = useTranslations("adminCatalogs");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6">
      <ConsoleHeader
        backHref="/admin/catalogos"
        backLabel={t("title")}
      />
      <AdminGate>
        <NewValuePanel cat={(cat as Cat) in CATS ? (cat as Cat) : "styles"} cfg={cfg} />
      </AdminGate>
    </main>
  );
}

function NewValuePanel({
  cat,
  cfg,
}: {
  cat: Cat;
  cfg: (typeof CATS)[Cat];
}) {
  const t = useTranslations("adminCatalogs");
  const tc = useTranslations("common");
  const router = useRouter();

  const [name, setName] = useState("");
  const [genre, setGenre] = useState<Genre>("OTHER");
  const [order, setOrder] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name: trimmed };
      if (cfg.field === "genre") body.genre = genre;
      if (cfg.field === "order" && order.trim()) {
        body.order = Number.parseInt(order, 10) || 0;
      }
      const res = await apiFetch(cfg.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError((await readError(res)) ?? t("error"));
        return;
      }
      // Vuelve al listado: aviso global para que sobreviva el push.
      showActionNotice({ text: t("saved") });
      router.push("/admin/catalogos");
    } catch {
      setError(t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">
        {t("newTitle", { catalog: t(cat) })}
      </h2>

      <Card>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink/50">
              {t("name")}
              <span aria-hidden="true" className="text-neon"> *</span>
            </span>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>

          {cfg.field === "genre" && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink/50">{t("genre")}</span>
              <select
                className={inputCls}
                value={genre}
                onChange={(e) => setGenre(e.target.value as Genre)}
              >
                {GENRES.map((g) => (
                  <option key={g} value={g}>
                    {t(`genres.${g}`)}
                  </option>
                ))}
              </select>
            </label>
          )}

          {cfg.field === "order" && (
            <label className="flex w-24 flex-col gap-1">
              <span className="text-xs text-ink/50">{t("order")}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                className={inputCls}
                value={order}
                onChange={(e) => setOrder(e.target.value)}
              />
            </label>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}

          <div>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? tc("loading") : tc("create")}
            </Button>
          </div>
        </form>
      </Card>
    </section>
  );
}
