"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";
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
 * /admin/catalogos — mantenedor de los catálogos que usan las academias
 * para sus series de clases (estilos, niveles, tipos). Tres secciones
 * apiladas con alta, edición inline y baja; el backend rechaza con 409
 * borrar valores en uso (se muestra el message del servidor).
 */
export default function AdminCatalogosPage() {
  const t = useTranslations("admin");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6 pb-24">
      <ConsoleHeader backHref="/admin" backLabel={t("title")} />
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
      />
      <CatalogSection
        title={t("levels")}
        endpoint="/admin/catalogs/class-levels"
        field="order"
      />
      <CatalogSection
        title={t("types")}
        endpoint="/admin/catalogs/class-types"
        field={null}
      />
    </div>
  );
}

function CatalogSection({
  title,
  endpoint,
  field,
}: {
  title: string;
  endpoint: string;
  field: Field;
}) {
  const t = useTranslations("adminCatalogs");
  const tc = useTranslations("common");
  // No hay clave "edit" en adminCatalogs ni common — se reutiliza la de
  // academySeries ("Editar").
  const ts = useTranslations("academySeries");

  const [items, setItems] = useState<Item[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  // ─── formulario de alta ───
  const [name, setName] = useState("");
  const [genre, setGenre] = useState<Genre>("OTHER");
  const [order, setOrder] = useState("");

  // ─── edición inline ───
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editGenre, setEditGenre] = useState<Genre>("OTHER");
  const [editOrder, setEditOrder] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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

  async function create(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name: trimmed };
      if (field === "genre") body.genre = genre;
      if (field === "order" && order.trim()) {
        body.order = Number.parseInt(order, 10) || 0;
      }
      const res = await apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError((await readError(res)) ?? t("error"));
        return;
      }
      setName("");
      setOrder("");
      flashSaved();
      await load();
    } catch {
      setError(t("error"));
    } finally {
      setBusy(false);
    }
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

  // DELETE rechaza con 409 cuando el valor está referenciado — el
  // message del backend lo explica; fallback a inUse.
  async function remove(item: Item): Promise<void> {
    if (!window.confirm(t("deleteConfirm", { name: item.name }))) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`${endpoint}/${item.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const msg = await readError(res);
        setError(msg ?? (res.status === 409 ? t("inUse") : t("error")));
        return;
      }
      if (editId === item.id) setEditId(null);
      await load();
    } catch {
      setError(t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>

      {loadError && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-white/60">
            {tc("error")}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            ↻ {tc("retry")}
          </Button>
        </div>
      )}

      {items === null && !loadError && (
        <p role="status" className="text-sm text-white/60">
          {tc("loading")}
        </p>
      )}

      {items !== null && (
        <>
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.id}>
                <Card className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                  {editId === item.id ? (
                    <form
                      onSubmit={(e) => void saveEdit(e, item.id)}
                      className="flex w-full flex-wrap items-end gap-2"
                    >
                      <input
                        className={`${inputCls} min-w-0 flex-1`}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        aria-label={t("name")}
                        required
                      />
                      {field === "genre" && (
                        <select
                          className={inputCls}
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
                    </form>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {item.name}
                      </span>
                      {field === "genre" && item.genre && (
                        <Badge variant="muted">{t(`genres.${item.genre}`)}</Badge>
                      )}
                      {field === "order" && (
                        <span className="text-xs tabular-nums text-white/50">
                          {t("order")}: {item.order ?? 0}
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => startEdit(item)}
                      >
                        {ts("edit")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void remove(item)}
                      >
                        {t("delete")}
                      </Button>
                    </>
                  )}
                </Card>
              </li>
            ))}
          </ul>

          <Card>
            <form
              onSubmit={create}
              className="flex flex-wrap items-end gap-2"
            >
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-xs text-white/50">
                  {t("name")}
                  <span aria-hidden="true" className="text-neon">
                    {" "}
                    *
                  </span>
                </span>
                <input
                  className={inputCls}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>
              {field === "genre" && (
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-white/50">{t("genre")}</span>
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
              {field === "order" && (
                <label className="flex w-24 flex-col gap-1">
                  <span className="text-xs text-white/50">{t("order")}</span>
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
              <Button type="submit" size="sm" disabled={busy}>
                + {t("add")}
              </Button>
            </form>
          </Card>
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-neon">
          {t("saved")}
        </p>
      )}
    </section>
  );
}
