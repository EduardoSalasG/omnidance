"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  CheckIcon,
  ConfirmSheet,
  RefreshIcon,
} from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { inputCls, readError } from "@/components/academy/shared";

// Espejo de GENRES en CatalogsController (admin/catalogs).
const GENRES = ["SALSA", "BACHATA", "CUBANO", "OTHER"] as const;
type Genre = (typeof GENRES)[number];

// Union de los tres catálogos: Style (genre), ClassLevel (order),
// ClassType (solo name). El campo extra se controla con `field`.
type Item = {
  id: string;
  name: string;
  genre?: Genre;
  order?: number;
};

type Field = "genre" | "order" | null;

/**
 * /admin/catalogos - mantenedor de los catálogos que usan las academias
 * para sus series de clases (estilos, niveles, tipos). Tres secciones de
 * filas de lectura con edición inline y baja; el ALTA vive en la página
 * dedicada /admin/catalogos/nuevo?cat= (patrón consolas: crear = página).
 * El backend rechaza con 409 borrar valores en uso.
 */
export default function AdminCatalogosPage() {
  const tn = useTranslations("nav");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6">
      <ConsoleHeader backHref="/inicio" backLabel={tn("home")} />
      <AdminGate>
        <CatalogsPanel />
      </AdminGate>
    </main>
  );
}

function CatalogsPanel() {
  const t = useTranslations("adminCatalogs");

  return (
    <div className="flex flex-col gap-8">
      <CatalogSection
        title={t("styles")}
        endpoint="/admin/catalogs/styles"
        field="genre"
        cat="styles"
      />
      <CatalogSection
        title={t("levels")}
        endpoint="/admin/catalogs/class-levels"
        field="order"
        cat="levels"
      />
      <CatalogSection
        title={t("types")}
        endpoint="/admin/catalogs/class-types"
        field={null}
        cat="types"
      />
    </div>
  );
}

function CatalogSection({
  title,
  endpoint,
  field,
  cat,
}: {
  title: string;
  endpoint: string;
  field: Field;
  cat: string;
}) {
  const t = useTranslations("adminCatalogs");
  const tc = useTranslations("common");
  // No hay clave "edit" en adminCatalogs ni common - se reutiliza la de
  // academySeries ("Editar").
  const ts = useTranslations("academySeries");

  const [items, setItems] = useState<Item[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  // ─── edición inline ───
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editGenre, setEditGenre] = useState<Genre>("OTHER");
  const [editOrder, setEditOrder] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Confirmación destructiva compartida (reemplaza window.confirm).
  const [pendingItem, setPendingItem] = useState<Item | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await apiFetch(endpoint);
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      setItems((await res.json()) as Item[]);
    } catch {
      setLoadError(true);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  function flashSaved(): void {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  function startEdit(item: Item): void {
    setEditId(item.id);
    setEditName(item.name);
    setEditGenre(item.genre ?? "OTHER");
    setEditOrder(String(item.order ?? 0));
    setError(null);
  }

  async function saveEdit(e: React.FormEvent, id: string): Promise<void> {
    e.preventDefault();
    const trimmed = editName.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name: trimmed };
      if (field === "genre") body.genre = editGenre;
      if (field === "order") body.order = Number.parseInt(editOrder, 10) || 0;
      const res = await apiFetch(`${endpoint}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError((await readError(res)) ?? t("error"));
        return;
      }
      setEditId(null);
      flashSaved();
      await load();
    } catch {
      setError(t("error"));
    } finally {
      setBusy(false);
    }
  }

  // DELETE rechaza con 409 cuando el valor está referenciado - el
  // message del backend lo explica; fallback a inUse.
  async function remove(item: Item): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`${endpoint}/${item.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setPendingItem(null);
        const msg = await readError(res);
        setError(msg ?? (res.status === 409 ? t("inUse") : t("error")));
        return;
      }
      setPendingItem(null);
      if (editId === item.id) setEditId(null);
      await load();
    } catch {
      setPendingItem(null);
      setError(t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={title} className="flex flex-col gap-3">
      {/* Header de sección: título + CTA de alta (crear = página dedicada) */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Button
          href={`/admin/catalogos/nuevo?cat=${cat}`}
          variant="secondary"
          size="sm"
        >
          + {t("new")}
        </Button>
      </div>

      {loadError && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-ink/60">
            {tc("error")}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}

      {items === null && !loadError && <SkeletonList />}

      {items !== null && (
        <Card className="divide-y divide-line p-0">
          {items.map((item) => (
            <div key={item.id}>
              {editId === item.id ? (
                <form
                  onSubmit={(e) => void saveEdit(e, item.id)}
                  className="flex flex-col gap-2 px-4 py-3"
                >
                  <input
                    className={inputCls}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    aria-label={t("name")}
                    required
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    {field === "genre" && (
                      <select
                        className={`${inputCls} w-auto`}
                        value={editGenre}
                        onChange={(e) =>
                          setEditGenre(e.target.value as Genre)
                        }
                        aria-label={t("genre")}
                      >
                        {GENRES.map((g) => (
                          <option key={g} value={g}>
                            {t(`genres.${g}`)}
                          </option>
                        ))}
                      </select>
                    )}
                    {field === "order" && (
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        className={`${inputCls} w-24`}
                        value={editOrder}
                        onChange={(e) => setEditOrder(e.target.value)}
                        aria-label={t("order")}
                      />
                    )}
                    <Button type="submit" size="sm" disabled={busy}>
                      {tc("save")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditId(null)}
                    >
                      {tc("cancel")}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex min-h-11 items-center gap-3 px-4 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {item.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {field === "genre" && item.genre && (
                      <Badge variant="muted">
                        {t(`genres.${item.genre}`)}
                      </Badge>
                    )}
                    {field === "order" && (
                      <span className="text-xs tabular-nums text-ink/50">
                        {item.order ?? 0}
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => startEdit(item)}
                    >
                      {ts("edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-400 hover:text-red-300"
                      disabled={busy}
                      onClick={() => setPendingItem(item)}
                    >
                      {t("delete")}
                    </Button>
                  </span>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {saved && (
        <p
          role="status"
          className="inline-flex items-center gap-1.5 text-sm text-neon"
        >
          <CheckIcon className="h-4 w-4" />
          {t("saved")}
        </p>
      )}

      <ConfirmSheet
        open={pendingItem !== null}
        title={t("deleteConfirm", { name: pendingItem?.name ?? "" })}
        confirmLabel={t("delete")}
        busy={busy}
        onConfirm={() => pendingItem && void remove(pendingItem)}
        onClose={() => setPendingItem(null)}
      />
    </section>
  );
}
