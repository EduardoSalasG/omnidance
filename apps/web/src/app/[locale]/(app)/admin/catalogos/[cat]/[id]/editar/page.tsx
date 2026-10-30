"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, ConfirmSheet, RefreshIcon } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { showActionNotice } from "@/components/ui/action-notice";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { inputCls, readError } from "@/components/academy/shared";
import { useRouter } from "@/i18n/navigation";

// Espejo de GENRES en CatalogsController (admin/catalogs) - mismo set
// que el listado.
const GENRES = ["SALSA", "BACHATA", "CUBANO", "OTHER"] as const;
type Genre = (typeof GENRES)[number];

const CATS = {
  styles: { endpoint: "/admin/catalogs/styles", field: "genre" },
  levels: { endpoint: "/admin/catalogs/class-levels", field: "order" },
  types: { endpoint: "/admin/catalogs/class-types", field: null },
} as const;
type Cat = keyof typeof CATS;

type Item = { id: string; name: string; genre?: Genre; order?: number };

/**
 * /admin/catalogos/[cat]/[id]/editar - edición de un valor de catálogo
 * (patrón consolas: editar = página dedicada, nunca inline en el
 * listado). El valor se prefi lla desde el listado del catálogo; PATCH
 * y regreso a /admin/catalogos.
 */
export default function EditarValorCatalogoPage(
  props: { params: Promise<{ cat: string; id: string }> },
) {
  const { cat, id } = use(props.params);
  const safeCat: Cat = (cat as Cat) in CATS ? (cat as Cat) : "styles";
  const t = useTranslations("adminCatalogs");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6">
      <ConsoleHeader backHref="/admin/catalogos" backLabel={t("title")} />
      <AdminGate>
        <EditPanel cat={safeCat} id={id} />
      </AdminGate>
    </main>
  );
}

function EditPanel({ cat, id }: { cat: Cat; id: string }) {
  const t = useTranslations("adminCatalogs");
  const tc = useTranslations("common");
  const router = useRouter();
  const cfg = CATS[cat];

  const [item, setItem] = useState<Item | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "notFound" | "error">(
    "loading",
  );
  const [name, setName] = useState("");
  const [genre, setGenre] = useState<Genre>("OTHER");
  const [order, setOrder] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch(cfg.endpoint);
      if (!res.ok) {
        setState("error");
        return;
      }
      const list = (await res.json()) as Item[];
      const found = list.find((i) => i.id === id);
      if (!found) {
        setState("notFound");
        return;
      }
      setItem(found);
      setName(found.name);
      setGenre(found.genre ?? "OTHER");
      setOrder(String(found.order ?? 0));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [cfg.endpoint, id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name: trimmed };
      if (cfg.field === "genre") body.genre = genre;
      if (cfg.field === "order") {
        body.order = Number.parseInt(order, 10) || 0;
      }
      const res = await apiFetch(`${cfg.endpoint}/${id}`, {
        method: "PATCH",
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

  // DELETE rechaza con 409 cuando el valor está en uso - el message
  // del backend lo explica; fallback a inUse.
  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`${cfg.endpoint}/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setConfirmDelete(false);
        const msg = await readError(res);
        setError(msg ?? (res.status === 409 ? t("inUse") : t("error")));
        return;
      }
      showActionNotice({ text: t("deleted") });
      router.push("/admin/catalogos");
    } catch {
      setConfirmDelete(false);
      setError(t("error"));
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return <SkeletonList items={1} />;
  if (state === "notFound") {
    return (
      <p role="alert" className="text-sm text-ink/60">
        {t("valueNotFound")}
      </p>
    );
  }
  if (state === "error" || !item) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p role="alert" className="text-sm text-ink/70">
          {tc("error")}
        </p>
        <Button variant="secondary" onClick={() => void load()}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">
        {t("editTitle", { catalog: t(cat) })}
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
              {busy ? tc("loading") : tc("save")}
            </Button>
          </div>
        </form>
      </Card>

      {/* Zona de peligro al pie: delete con confirmación compartida. */}
      <Card className="border-red-400/30">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-ink/50">{t("deleteHint")}</p>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-red-400 hover:text-red-300"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
          >
            {t("delete")}
          </Button>
        </div>
      </Card>

      <ConfirmSheet
        open={confirmDelete}
        title={t("deleteConfirm", { name: item.name })}
        confirmLabel={t("delete")}
        busy={busy}
        onConfirm={() => void remove()}
        onClose={() => setConfirmDelete(false)}
      />
    </section>
  );
}
