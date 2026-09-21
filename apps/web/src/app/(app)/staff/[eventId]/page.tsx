"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import type { IDetectedBarcode } from "@yudiel/react-qr-scanner";
import { apiFetch } from "@/lib/api";
import { Badge, Button, EventDate } from "@/components/ui";
import { Spinner } from "@/components/ui/spinner";

// La cámara solo existe en el cliente — sin SSR.
const Scanner = dynamic(
  () => import("@yudiel/react-qr-scanner").then((m) => m.Scanner),
  { ssr: false },
);

// Cuánto tiempo queda visible el resultado del escaneo (ms).
// La fila no se bloquea: el próximo QR se puede escanear antes de que expire.
const RESULT_MS = 2500;
// Evita doble POST si la cámara re-detecta el mismo QR de inmediato.
const RESCAN_MS = 1500;
const POLL_MS = 15_000;

type CheckinResult = {
  checkin: { id: string; inAt: string; method: string };
  person: { name: string; photoUrl: string | null };
  ticket: { id: string; status: string } | null;
  /** Tipo de EntryPass cuando el check-in no vino de un Ticket
      (LIST/COMP/ARTIST/STAFF…) — contrato nuevo del API. */
  passType?: string | null;
};

type ListedCheckin = {
  id: string;
  personId: string;
  passId: string | null;
  staffId: string | null;
  method: string;
  inAt: string;
  outAt: string | null;
  voidedAt: string | null;
  person: { name: string; photoUrl: string | null };
};

type ScanResult =
  | { kind: "ok"; name: string; passType?: string | null }
  | { kind: "nopass"; name: string }
  | { kind: "duplicate"; name: string | null; at: string | null }
  | { kind: "error"; message: string };

type Gate = "loading" | "ok" | "unauth" | "notStaff";
type View = "scan" | "list";

/** Vibración háptica — puerta ruidosa, la confirmación se siente en la mano. */
function buzz(pattern: number | number[]) {
  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function"
    ) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Dispositivo sin vibración — el feedback visual basta.
  }
}

/** Extrae `message` del body de error de NestJS (string o string[]). */
async function readApiMessage(res: Response): Promise<string | null> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && "message" in body) {
      const m = (body as { message: unknown }).message;
      if (typeof m === "string") return m;
      if (Array.isArray(m) && typeof m[0] === "string") return m[0] as string;
    }
  } catch {
    // Body no-JSON — se usa el fallback del catálogo.
  }
  return null;
}

function Avatar({
  name,
  photoUrl,
}: {
  name: string;
  photoUrl: string | null;
}) {
  if (photoUrl) {
    // <img> a propósito: photoUrl es remoto y next/image requeriría
    // configurar remotePatterns — fuera de alcance v1.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt=""
        className="h-11 w-11 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-night-800 text-lg font-bold text-neon"
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export default function DoorConsolePage({
  params,
}: {
  params: { eventId: string };
}) {
  const { eventId } = params;
  const t = useTranslations("staff");
  const tc = useTranslations("common");

  const [gate, setGate] = useState<Gate>("loading");
  const [view, setView] = useState<View>("scan");
  const [checkins, setCheckins] = useState<ListedCheckin[]>([]);
  const [eventName, setEventName] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [offline, setOffline] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [personId, setPersonId] = useState("");

  const inFlight = useRef(false);
  const lastScan = useRef({ token: "", at: 0 });
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Espejo mutable de `checkins` para resolver el nombre en un 409
  // (la respuesta de conflicto trae el checkin pero no el nombre).
  const checkinsRef = useRef<ListedCheckin[]>([]);

  const applyCheckins = useCallback((list: ListedCheckin[]) => {
    checkinsRef.current = list;
    setCheckins(list);
  }, []);

  const showResult = useCallback((r: ScanResult) => {
    if (resultTimer.current) clearTimeout(resultTimer.current);
    setResult(r);
    resultTimer.current = setTimeout(() => setResult(null), RESULT_MS);
  }, []);

  useEffect(
    () => () => {
      if (resultTimer.current) clearTimeout(resultTimer.current);
    },
    [],
  );

  const loadCheckins = useCallback(async () => {
    try {
      const res = await apiFetch(`/events/${eventId}/checkins`);
      if (res.status === 401) {
        setGate("unauth");
        return;
      }
      if (res.status === 403) {
        setGate("notStaff");
        return;
      }
      if (!res.ok) {
        // 404 u otro — conserva la lista anterior; no hay gate posible.
        setGate((g) => (g === "loading" ? "ok" : g));
        return;
      }
      const list = (await res.json()) as ListedCheckin[];
      // La API ordena inAt asc — la puerta quiere lo más reciente arriba.
      applyCheckins([...list].reverse());
      setOffline(false);
      setGate("ok");
    } catch {
      // Red caída en plena puerta.
      // TODO(offline-first): encolar check-ins en IndexedDB y sincronizar
      // al volver la conexión (spec: staff offline-first).
      setOffline(true);
      setGate((g) => (g === "loading" ? "ok" : g));
    }
  }, [eventId, applyCheckins]);

  // Contador/lista de la noche — polling ligero cada ~15s.
  useEffect(() => {
    void loadCheckins();
    const id = setInterval(() => void loadCheckins(), POLL_MS);
    return () => clearInterval(id);
  }, [loadCheckins]);

  // Nombre del evento para el header (endpoint público, best-effort).
  useEffect(() => {
    let cancelled = false;
    apiFetch(`/events/${eventId}`)
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const e = (await res.json()) as { name?: string };
        if (e.name) setEventName(e.name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  // Manejo compartido de respuestas de POST /checkins y /checkins/manual.
  const handleResponse = useCallback(
    async (res: Response) => {
      setOffline(false);
      if (res.status === 201) {
        const data = (await res.json()) as CheckinResult;
        buzz(50);
        // EntryPass (lista/cortesía/artist) → éxito verde con el tipo de pase,
        // no el ámbar "sin entrada" (el check-in sí se registró).
        showResult(
          data.ticket || data.passType
            ? {
                kind: "ok",
                name: data.person.name,
                passType: data.passType ?? null,
              }
            : { kind: "nopass", name: data.person.name },
        );
        void loadCheckins();
        return;
      }
      if (res.status === 409) {
        let at: string | null = null;
        let name: string | null = null;
        try {
          const body = (await res.json()) as {
            checkin?: { inAt?: string; personId?: string };
          };
          at = body.checkin?.inAt ?? null;
          name =
            checkinsRef.current.find(
              (c) => c.personId === body.checkin?.personId,
            )?.person.name ?? null;
        } catch {
          // Body inesperado — se muestra el duplicado sin detalle.
        }
        buzz([80, 60, 80]);
        showResult({ kind: "duplicate", name, at });
        return;
      }
      if (res.status === 401) {
        setGate("unauth");
        return;
      }
      if (res.status === 403) {
        setGate("notStaff");
        return;
      }
      // 400 QR inválido / 404 evento o persona / 500 — mensaje del server si hay.
      buzz([80, 60, 80]);
      showResult({
        kind: "error",
        message: (await readApiMessage(res)) ?? tc("error"),
      });
    },
    [loadCheckins, showResult, tc],
  );

  const onScan = useCallback(
    (codes: IDetectedBarcode[]) => {
      const token = codes[0]?.rawValue;
      if (!token || inFlight.current) return;
      const now = Date.now();
      if (
        lastScan.current.token === token &&
        now - lastScan.current.at < RESCAN_MS
      ) {
        return;
      }
      lastScan.current = { token, at: now };
      inFlight.current = true;
      apiFetch("/checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrToken: token, eventId, method: "SCAN" }),
      })
        .then(handleResponse)
        .catch(() => {
          // Fetch rechazado = sin conexión.
          setOffline(true);
          buzz([80, 60, 80]);
          showResult({ kind: "error", message: tc("error") });
        })
        .finally(() => {
          inFlight.current = false;
        });
    },
    [eventId, handleResponse, showResult, tc],
  );

  const submitManual = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const id = personId.trim();
      if (!id || inFlight.current) return;
      inFlight.current = true;
      try {
        const res = await apiFetch("/checkins/manual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId, personId: id }),
        });
        if (res.status === 201) {
          setPersonId("");
          setManualOpen(false);
        }
        await handleResponse(res);
      } catch {
        setOffline(true);
        buzz([80, 60, 80]);
        showResult({ kind: "error", message: tc("error") });
      } finally {
        inFlight.current = false;
      }
    },
    [eventId, personId, handleResponse, showResult, tc],
  );

  const count = checkins.filter((c) => !c.voidedAt).length;

  const overlayTone =
    result?.kind === "ok"
      ? "bg-green-600 text-white"
      : result?.kind === "nopass"
        ? "bg-amber-400 text-night-950"
        : "bg-red-600 text-white";

  const tabCls = (active: boolean) =>
    `flex min-h-14 items-center justify-center gap-2 text-base font-semibold transition-colors ${
      active ? "bg-night-800 text-neon" : "text-white/60 active:bg-night-800"
    }`;

  return (
    <main className="flex min-h-dvh flex-col bg-night-950">
      {/* Header compacto: volver + evento + contador de la noche */}
      <header className="flex items-center gap-3 border-b border-night-700 px-4 py-2.5">
        <Link
          href="/staff"
          className="flex min-h-11 items-center text-sm font-semibold text-white/70"
        >
          ‹ {t("title")}
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-center text-sm font-semibold">
          {eventName ?? ""}
        </h1>
        <div className="flex min-h-11 items-baseline gap-1.5">
          <span className="text-2xl font-black text-neon">{count}</span>
          <span className="text-xs text-white/50">{t("list")}</span>
        </div>
      </header>

      {/* Aviso de conectividad — la puerta no se detiene, pero el staff sabe */}
      {offline && (
        <div className="flex items-center justify-center gap-2 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm font-medium text-amber-300">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="h-4 w-4"
          >
            <path d="M5 12.55a11 11 0 0 1 14.08 0" />
            <path d="M1.42 9a16 16 0 0 1 21.16 0" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <circle cx="12" cy="20" r="1" fill="currentColor" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
          {t("offline")}
        </div>
      )}

      {gate === "loading" && (
        <div className="flex flex-1 items-center justify-center p-6">
          <Spinner size="lg" className="page-loading" />
        </div>
      )}

      {gate === "unauth" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
          <Button href="/login" size="lg">
            {tc("login")}
          </Button>
        </div>
      )}

      {gate === "notStaff" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
          <p className="text-white/70">{t("notStaff")}</p>
          <Button href="/inicio" variant="secondary">
            {tc("appName")}
          </Button>
        </div>
      )}

      {gate === "ok" && view === "scan" && (
        <>
          {/* Cámara grande — el teléfono se sostiene a la altura del pecho */}
          <div className="relative min-h-0 flex-1">
            {cameraError ? (
              <div className="flex h-full items-center justify-center p-6">
                <p className="text-center text-white/70">{t("cameraError")}</p>
              </div>
            ) : (
              <Scanner
                onScan={onScan}
                onError={() => setCameraError(true)}
                constraints={{ facingMode: "environment" }}
                components={{ finder: true, torch: true }}
                styles={{
                  container: { width: "100%", height: "100%" },
                  video: {
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  },
                }}
              />
            )}
            <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-night-950/70 py-2 text-center text-sm text-white/80">
              {t("scanning")}
            </p>
          </div>

          {/* Check-in manual colapsable — v1 por personId.
              TODO(ux): selector por nombre cuando exista búsqueda de personas. */}
          <section className="border-t border-night-700 px-4">
            <button
              type="button"
              aria-expanded={manualOpen}
              onClick={() => setManualOpen((o) => !o)}
              className="flex min-h-11 w-full items-center justify-between text-sm font-semibold text-white/80"
            >
              {t("manual")}
              <span aria-hidden className="text-lg">
                {manualOpen ? "−" : "+"}
              </span>
            </button>
            {manualOpen && (
              <form onSubmit={submitManual} className="flex gap-2 pb-3">
                <input
                  value={personId}
                  onChange={(e) => setPersonId(e.target.value)}
                  placeholder="personId"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="min-h-12 min-w-0 flex-1 rounded-xl border border-night-700 bg-night-900 px-4 text-white focus:border-neon focus-visible:ring-2 focus-visible:ring-neon/50"
                />
                <Button type="submit" disabled={!personId.trim()}>
                  {t("manual")}
                </Button>
              </form>
            )}
          </section>
        </>
      )}

      {gate === "ok" && view === "list" && (
        <ul className="min-h-0 flex-1 divide-y divide-night-700 overflow-y-auto">
          {checkins.length === 0 ? (
            <li className="p-8 text-center text-sm text-white/50">
              {t("scanning")}
            </li>
          ) : (
            checkins.map((c) => (
              <li
                key={c.id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  c.voidedAt ? "opacity-40" : ""
                }`}
              >
                <Avatar name={c.person.name} photoUrl={c.person.photoUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.person.name}</p>
                  <p className="text-xs text-white/50">
                    <EventDate start={c.inAt} variant="time" />
                  </p>
                </div>
                <Badge variant={c.method === "MANUAL" ? "outline" : "muted"}>
                  {c.method}
                </Badge>
              </li>
            ))
          )}
        </ul>
      )}

      {/* Tabs inferiores — al alcance del pulgar con una mano */}
      {gate === "ok" && (
        <nav className="grid grid-cols-2 border-t border-night-700 bg-night-900">
          <button
            type="button"
            onClick={() => setView("scan")}
            className={tabCls(view === "scan")}
          >
            {t("scan")}
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={tabCls(view === "list")}
          >
            {t("list")} · {count}
          </button>
        </nav>
      )}

      {/* Resultado a pantalla completa — legible a brazo de distancia */}
      {result && (
        <div
          role="status"
          aria-live="assertive"
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 p-8 text-center ${overlayTone}`}
        >
          {result.kind === "ok" && (
            <>
              <span aria-hidden className="text-7xl font-black leading-none">
                ✓
              </span>
              <p className="max-w-full break-words text-4xl font-black leading-tight">
                {result.name}
              </p>
              <p className="text-xl font-semibold">{t("checkinOk")}</p>
              {result.passType && (
                <p className="text-lg font-semibold opacity-90">
                  {t("pass", { type: result.passType })}
                </p>
              )}
            </>
          )}
          {result.kind === "nopass" && (
            <>
              <span aria-hidden className="text-7xl font-black leading-none">
                !
              </span>
              <p className="max-w-full break-words text-4xl font-black leading-tight">
                {result.name}
              </p>
              <p className="text-xl font-semibold">{t("noPass")}</p>
            </>
          )}
          {result.kind === "duplicate" && (
            <>
              <span aria-hidden className="text-7xl font-black leading-none">
                ✕
              </span>
              {result.name && (
                <p className="max-w-full break-words text-4xl font-black leading-tight">
                  {result.name}
                </p>
              )}
              <p className="text-2xl font-bold">{t("duplicate")}</p>
              {result.at && (
                <p className="text-xl font-semibold">
                  <EventDate start={result.at} variant="time" />
                </p>
              )}
            </>
          )}
          {result.kind === "error" && (
            <>
              <span aria-hidden className="text-7xl font-black leading-none">
                ✕
              </span>
              <p className="text-3xl font-bold leading-tight">
                {result.message}
              </p>
            </>
          )}
        </div>
      )}
    </main>
  );
}
