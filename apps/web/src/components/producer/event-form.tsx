"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import {
  EVENT_TYPES,
  inputCls,
  toLocalInput,
  toOptionalInt,
  type EventDetail,
  type EventPayload,
  type Style,
  type Venue,
} from "./shared";

type BlockDraft = {
  startsAt: string;
  endsAt: string;
  styleId: string;
  djId: string;
};

type SeriesOption = { id: string; name: string };

export type EventFormProps = {
  venues: Venue[];
  styles: Style[];
  /** Series propias con id conocido; si está vacío el campo se oculta (v1). */
  seriesOptions: SeriesOption[];
  mode: "create" | "edit";
  /**
   * Evento a editar (GET /events/:id). Para re-inicializar el form al
   * recargar el detalle el caller debe cambiar `key` (remount).
   */
  initial?: EventDetail | null;
  /** null = éxito; string = mensaje de error a mostrar junto al botón. */
  onSubmit: (payload: EventPayload) => Promise<string | null>;
  onCancel?: () => void;
};

/**
 * Formulario de crear/editar evento. En modo edit, scheduleBlocks y djIds
 * solo se envían si el usuario los tocó (PATCH los REEMPLAZA — enviarlos
 * intactos borraría el djId por bloque que el detalle no devuelve).
 */
export function EventForm({
  venues,
  styles,
  seriesOptions,
  mode,
  initial,
  onSubmit,
  onCancel,
}: EventFormProps) {
  const t = useTranslations("producer");
  const te = useTranslations("events");
  const tc = useTranslations("common");

  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<string>(initial?.type ?? "SOCIAL");
  const [startsAt, setStartsAt] = useState(
    initial ? toLocalInput(initial.startsAt) : "",
  );
  const [endsAt, setEndsAt] = useState(
    initial ? toLocalInput(initial.endsAt) : "",
  );
  // El detalle no devuelve venueId — en edición se pre-selecciona por
  // nombre contra el catálogo /venues (match exacto).
  const [venueId, setVenueId] = useState(
    initial?.venueId ??
      venues.find((v) => v.name === initial?.venue?.name)?.id ??
      "",
  );
  const [seriesId, setSeriesId] = useState(
    initial?.seriesId ?? initial?.series?.id ?? "",
  );
  const [capacity, setCapacity] = useState(
    initial?.capacity != null ? String(initial.capacity) : "",
  );
  const [presalePrice, setPresalePrice] = useState(
    initial?.presalePrice != null ? String(initial.presalePrice) : "",
  );
  const [doorPrice, setDoorPrice] = useState(
    initial?.doorPrice != null ? String(initial.doorPrice) : "",
  );
  const [presaleCap, setPresaleCap] = useState(
    initial?.presaleCap != null ? String(initial.presaleCap) : "",
  );
  const [doorCap, setDoorCap] = useState(
    initial?.doorCap != null ? String(initial.doorCap) : "",
  );
  const [tablesTotal, setTablesTotal] = useState(
    initial?.tablesTotal != null ? String(initial.tablesTotal) : "",
  );
  const [primeThreshold, setPrimeThreshold] = useState(
    initial?.primeThreshold != null ? String(initial.primeThreshold) : "",
  );
  const [happyHour, setHappyHour] = useState(
    initial?.happyHourMinutes != null ? String(initial.happyHourMinutes) : "",
  );

  // Bloques: pre-cargados del detalle. style llega solo con nombre → se
  // resuelve el id contra el catálogo /styles (match por nombre exacto).
  const [blocks, setBlocks] = useState<BlockDraft[]>(
    (initial?.scheduleBlocks ?? []).map((b) => ({
      startsAt: toLocalInput(b.startsAt),
      endsAt: toLocalInput(b.endsAt),
      styleId:
        styles.find((s) => s.name === b.style?.name)?.id ?? "",
      djId: "",
    })),
  );
  const [blocksDirty, setBlocksDirty] = useState(false);
  const [djsText, setDjsText] = useState("");
  const [djsDirty, setDjsDirty] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  // En edición, si la serie actual no está en las opciones la agregamos
  // para no perderla al guardar.
  const seriesChoices = (() => {
    const opts = [...seriesOptions];
    const currentId = initial?.seriesId ?? initial?.series?.id;
    const currentName = initial?.series?.name;
    if (currentId && currentName && !opts.some((o) => o.id === currentId)) {
      opts.unshift({ id: currentId, name: currentName });
    }
    return opts;
  })();

  const currentDjNames = (initial?.djs ?? [])
    .map((d) => d.person.name)
    .filter((n): n is string => Boolean(n));

  function patchBlock(index: number, patch: Partial<BlockDraft>) {
    setBlocksDirty(true);
    setBlocks((bs) => bs.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  const datesValid =
    startsAt !== "" && endsAt !== "" && new Date(endsAt) > new Date(startsAt);
  const blocksValid = blocks.every((b) => {
    const any = b.startsAt !== "" || b.endsAt !== "";
    if (!any) return true; // bloque vacío = se ignora
    if (b.startsAt === "" || b.endsAt === "") return false;
    return new Date(b.endsAt) > new Date(b.startsAt);
  });
  const formValid = name.trim() !== "" && datesValid && blocksValid;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setInvalid(false);
    if (!formValid) {
      setInvalid(true);
      return;
    }
    if (busy) return;
    setBusy(true);
    setError(null);

    const filledBlocks = blocks
      .filter((b) => b.startsAt !== "" && b.endsAt !== "")
      .map((b) => ({
        startsAt: new Date(b.startsAt).toISOString(),
        endsAt: new Date(b.endsAt).toISOString(),
        ...(b.styleId ? { styleId: b.styleId } : {}),
        ...(b.djId.trim() ? { djId: b.djId.trim() } : {}),
      }));
    const djIds = [
      ...new Set(
        djsText
          .split(/[\s,;]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];

    const payload: EventPayload = {
      name: name.trim(),
      // type no es editable vía PATCH (UpdateEventDto no lo incluye).
      ...(mode === "create" ? { type } : {}),
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      ...(venueId ? { venueId } : {}),
      ...(seriesId ? { seriesId } : {}),
      ...(toOptionalInt(capacity) !== undefined
        ? { capacity: toOptionalInt(capacity) }
        : {}),
      ...(toOptionalInt(presalePrice) !== undefined
        ? { presalePrice: toOptionalInt(presalePrice) }
        : {}),
      ...(toOptionalInt(doorPrice) !== undefined
        ? { doorPrice: toOptionalInt(doorPrice) }
        : {}),
      ...(toOptionalInt(presaleCap) !== undefined
        ? { presaleCap: toOptionalInt(presaleCap) }
        : {}),
      ...(toOptionalInt(doorCap) !== undefined
        ? { doorCap: toOptionalInt(doorCap) }
        : {}),
      // vacío = sin servicio de mesas → en edit se envía null (limpia)
      ...(mode === "edit" && tablesTotal.trim() === ""
        ? { tablesTotal: null }
        : toOptionalInt(tablesTotal) !== undefined
          ? { tablesTotal: toOptionalInt(tablesTotal) }
          : {}),
      ...(toOptionalInt(primeThreshold) !== undefined
        ? { primeThreshold: toOptionalInt(primeThreshold) }
        : {}),
      ...(toOptionalInt(happyHour) !== undefined
        ? { happyHourMinutes: toOptionalInt(happyHour) }
        : {}),
      // create: siempre se envían (vacío = sin bloques). edit: solo si el
      // usuario los modificó — PATCH reemplaza el set completo.
      ...(mode === "create" || blocksDirty
        ? { scheduleBlocks: filledBlocks }
        : {}),
      ...(mode === "create" || djsDirty ? { djIds } : {}),
    };

    try {
      const err = await onSubmit(payload);
      if (err !== null) {
        setError(err);
        return;
      }
      if (mode === "create") {
        setName("");
        setStartsAt("");
        setEndsAt("");
        setVenueId("");
        setSeriesId("");
        setCapacity("");
        setPresalePrice("");
        setDoorPrice("");
        setPresaleCap("");
        setDoorCap("");
        setTablesTotal("");
        setPrimeThreshold("");
        setHappyHour("");
        setBlocks([]);
        setBlocksDirty(false);
        setDjsText("");
        setDjsDirty(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="text-sm text-white/70">
          {t("form.name")}
          <span aria-hidden="true" className="text-neon"> *</span>
        </span>
        <input
          type="text"
          required
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputCls}
        />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm text-white/70">
            {t("form.startsAt")}
            <span aria-hidden="true" className="text-neon"> *</span>
          </span>
          <input
            type="datetime-local"
            required
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm text-white/70">
            {t("form.endsAt")}
            <span aria-hidden="true" className="text-neon"> *</span>
          </span>
          <input
            type="datetime-local"
            required
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className={inputCls}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm text-white/70">{t("form.venue")}</span>
          <select
            value={venueId}
            onChange={(e) => setVenueId(e.target.value)}
            className={inputCls}
          >
            <option value="">{t("form.noVenue")}</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm text-white/70">{t("form.type")}</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            disabled={mode === "edit"}
            className={inputCls}
          >
            {EVENT_TYPES.map((et) => (
              <option key={et} value={et}>
                {te.has(`type.${et}`) ? te(`type.${et}`) : et}
              </option>
            ))}
          </select>
        </label>
      </div>

      {seriesChoices.length > 0 && (
        <label className="flex flex-col gap-2">
          <span className="text-sm text-white/70">{t("form.series")}</span>
          <select
            value={seriesId}
            onChange={(e) => setSeriesId(e.target.value)}
            className={inputCls}
          >
            <option value="">{t("form.noSeries")}</option>
            {seriesChoices.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-2">
          <span className="text-sm text-white/70">
            {t("form.presalePrice")}
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={presalePrice}
            onChange={(e) => setPresalePrice(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm text-white/70">{t("form.doorPrice")}</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={doorPrice}
            onChange={(e) => setDoorPrice(e.target.value)}
            className={inputCls}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-2">
          <span className="text-sm text-white/70">{t("form.capacity")}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm text-white/70">{t("form.presaleCap")}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={presaleCap}
            onChange={(e) => setPresaleCap(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm text-white/70">{t("form.doorCap")}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={doorCap}
            onChange={(e) => setDoorCap(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm text-white/70">
            {t("form.tablesTotal")}
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={tablesTotal}
            onChange={(e) => setTablesTotal(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm text-white/70">
            {t("form.primeThreshold")}
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={primeThreshold}
            onChange={(e) => setPrimeThreshold(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm text-white/70">
            {t("form.happyHourMinutes")}
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={happyHour}
            onChange={(e) => setHappyHour(e.target.value)}
            className={inputCls}
          />
        </label>
      </div>

      {/* Bloques horarios (opcional) */}
      <fieldset className="flex flex-col gap-3 rounded-2xl border border-night-700 p-4">
        <legend className="px-1 text-sm font-semibold text-white/70">
          {t("form.schedule")}
        </legend>
        {blocks.map((b, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-xl border border-night-700 bg-night-950 p-3"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-white/50">
                  {t("form.blockStart")}
                </span>
                <input
                  type="datetime-local"
                  value={b.startsAt}
                  onChange={(e) =>
                    patchBlock(i, { startsAt: e.target.value })
                  }
                  className={`${inputCls} min-h-11 py-2 text-sm`}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-white/50">
                  {t("form.blockEnd")}
                </span>
                <input
                  type="datetime-local"
                  value={b.endsAt}
                  onChange={(e) => patchBlock(i, { endsAt: e.target.value })}
                  className={`${inputCls} min-h-11 py-2 text-sm`}
                />
              </label>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-white/50">
                  {t("form.blockStyle")}
                </span>
                <select
                  value={b.styleId}
                  onChange={(e) => patchBlock(i, { styleId: e.target.value })}
                  className={`${inputCls} min-h-11 py-2 text-sm`}
                >
                  <option value="">—</option>
                  {styles.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-white/50">
                  {t("form.blockDj")}
                </span>
                <input
                  type="text"
                  autoComplete="off"
                  value={b.djId}
                  onChange={(e) => patchBlock(i, { djId: e.target.value })}
                  className={`${inputCls} min-h-11 py-2 text-sm`}
                />
              </label>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-end"
              onClick={() => {
                setBlocksDirty(true);
                setBlocks((bs) => bs.filter((_, j) => j !== i));
              }}
            >
              {t("form.removeBlock")}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={() => {
            setBlocksDirty(true);
            setBlocks((bs) => [
              ...bs,
              { startsAt: "", endsAt: "", styleId: "", djId: "" },
            ]);
          }}
        >
          ＋ {t("form.addBlock")}
        </Button>
      </fieldset>

      <label className="flex flex-col gap-2">
        <span className="text-sm text-white/70">
          {t("form.djs")}{" "}
          <span className="text-white/50">({t("form.optional")})</span>
        </span>
        <input
          type="text"
          autoComplete="off"
          value={djsText}
          onChange={(e) => {
            setDjsDirty(true);
            setDjsText(e.target.value);
          }}
          className={inputCls}
          aria-describedby="producer-djs-help"
        />
        <span id="producer-djs-help" className="text-xs text-white/50">
          {t("form.djsHelp")}
        </span>
        {mode === "edit" && currentDjNames.length > 0 && (
          <span className="text-xs text-white/50">
            {t("form.currentDjs")}: {currentDjNames.join(", ")}
          </span>
        )}
      </label>

      {invalid && (
        <p role="alert" className="text-sm text-red-400">
          {t("form.datesInvalid")}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={!formValid || busy} className="flex-1">
          {busy
            ? tc("loading")
            : mode === "create"
              ? t("createEvent")
              : tc("save")}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {tc("cancel")}
          </Button>
        )}
      </div>
    </form>
  );
}
