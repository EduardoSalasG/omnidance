"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import type { IDetectedBarcode } from "@yudiel/react-qr-scanner";
import { apiFetch } from "@/lib/api";
import { Badge, Button, EventDate, SkeletonList } from "@/components/ui";
import {
  decodeJwtPayload,
  doorDb,
  type DoorManifest,
  type QueuedScan,
} from "@/lib/door-db";

// La cámara solo existe en el cliente - sin SSR.
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

// Breakpoint lg (1024px): en desktop la consola muestra a la vez la
// columna de acciones (escáner + ingreso manual) y la lista de
// check-ins; `view` solo alterna paneles en pantallas chicas.
// useSyncExternalStore suscribe el media query sin render extra.
const LG_QUERY = "(min-width: 1024px)";
const subscribeLg = (onChange: () => void) => {
  const mq = window.matchMedia(LG_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
const getLgSnapshot = () => window.matchMedia(LG_QUERY).matches;
const getLgServerSnapshot = () => false;

type CheckinResult = {
  checkin: { id: string; inAt: string; method: string };
  person: { name: string; photoUrl: string | null };
  ticket: { id: string; status: string } | null;
  /** Tipo de EntryPass cuando el check-in no vino de un Ticket
      (LIST/COMP/ARTIST/STAFF…) - contrato nuevo del API. */
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
  | { kind: "ok"; name: string; passType?: string | null; offline?: boolean }
  | { kind: "nopass"; name: string; offline?: boolean }
  | { kind: "duplicate"; name: string | null; at: string | null }
  | { kind: "error"; message: string };

type Gate = "loading" | "ok" | "unauth" | "notStaff";
type View = "scan" | "list";

/** Vibración háptica - puerta ruidosa, la confirmación se siente en la mano. */
function buzz(pattern: number | number[]) {
  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function"
    ) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Dispositivo sin vibración - el feedback visual basta.
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
    // Body no-JSON - se usa el fallback del catálogo.
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
    // configurar remotePatterns - fuera de alcance v1.
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
  // Pending → skeleton de ancho fijo en el slot del título; resuelto
  // sin nombre → header vacío (mismo fallback de antes).
  const [eventNameDone, setEventNameDone] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [offline, setOffline] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [personId, setPersonId] = useState("");
  const [manualQuery, setManualQuery] = useState("");
  // Spec staff-offline-checkin: manifiesto cacheado + cola de escaneos.
  const [manifest, setManifest] = useState<DoorManifest | null>(null);
  const [queue, setQueue] = useState<QueuedScan[]>([]);
  const isDesktop = useSyncExternalStore(
    subscribeLg,
    getLgSnapshot,
    getLgServerSnapshot,
  );

  const inFlight = useRef(false);
  const lastScan = useRef({ token: "", at: 0 });
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Espejo mutable de `checkins` para resolver el nombre en un 409
  // (la respuesta de conflicto trae el checkin pero no el nombre).
  const checkinsRef = useRef<ListedCheckin[]>([]);
  // Espejo de queue para chequeos de duplicado fuera del render.
  const queueRef = useRef<QueuedScan[]>([]);
  // Evita flush concurrente (interval + evento online + post-scan).
  const flushing = useRef(false);

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
        // 404 u otro - conserva la lista anterior; no hay gate posible.
        setGate((g) => (g === "loading" ? "ok" : g));
        return;
      }
      const list = (await res.json()) as ListedCheckin[];
      // La API ordena inAt asc - la puerta quiere lo más reciente arriba.
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

  const applyQueue = useCallback((list: QueuedScan[]) => {
    queueRef.current = list;
    setQueue(list);
  }, []);

  const pendingQueue = queue.filter((q) => q.status === "pending");
  const pendingCount = pendingQueue.length;

  /**
   * Manifiesto de puerta: una llamada con todos los pases ACTIVE +
   * check-ins abiertos, persistida en IndexedDB. Se refresca con el
   * mismo poll de la lista; sin red opera el cache previo (badge de
   * antigüedad en el banner).
   */
  const loadManifest = useCallback(async () => {
    try {
      const res = await apiFetch(`/events/${eventId}/door-manifest`);
      if (!res.ok) return;
      const m = (await res.json()) as DoorManifest;
      setManifest(m);
      void doorDb.saveManifest(m).catch(() => {});
    } catch {
      // Sin red - el cache de IndexedDB es la fuente de trabajo.
      const cached = await doorDb.loadManifest(eventId).catch(() => null);
      if (cached) setManifest(cached);
    }
  }, [eventId]);

  // Hidratación inicial: manifiesto del server o el último cacheado, y
  // la cola pendiente de este evento (sobrevive reload offline).
  useEffect(() => {
    void loadManifest();
    void doorDb.listQueue(eventId).then(applyQueue).catch(() => {});
  }, [eventId, loadManifest, applyQueue]);

  /**
   * Flush del batch offline → POST /checkins/sync. Resultado por ítem:
   * synced sale de la cola y refresca la lista; duplicate queda como
   * conflicto visible (decisión humana: dejar o anular); invalid_token
   * y error quedan como fallidos persistentes.
   */
  const flushQueue = useCallback(async () => {
    if (flushing.current || !navigator.onLine) return;
    const pending = queueRef.current.filter((q) => q.status === "pending");
    if (pending.length === 0) return;
    flushing.current = true;
    try {
      const res = await apiFetch("/checkins/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: pending.map((q) => ({
            clientRef: q.clientRef,
            qrToken: q.qrToken || undefined,
            personId: q.qrToken ? undefined : q.personId,
            eventId: q.eventId,
            scannedAt: q.scannedAt,
          })),
        }),
      });
      if (!res.ok) return;
      const { results } = (await res.json()) as {
        results: {
          clientRef: string;
          result: "synced" | "duplicate" | "invalid_token" | "error";
        }[];
      };
      for (const r of results) {
        if (r.result === "synced") {
          await doorDb.removeQueueItem(r.clientRef);
        } else {
          await doorDb.patchQueue(r.clientRef, {
            status: r.result === "duplicate" ? "conflict" : "failed",
          });
        }
      }
      applyQueue(await doorDb.listQueue(eventId));
      if (results.some((r) => r.result === "synced")) void loadCheckins();
      // El manifiesto queda stale tras admitir gente - refresh suave.
      void loadManifest();
    } catch {
      // Sigue sin red - la cola espera al próximo trigger.
    } finally {
      flushing.current = false;
    }
  }, [eventId, applyQueue, loadCheckins, loadManifest]);

  // Triggers de flush: al volver la señal, cada ~30s, y tras el mount.
  useEffect(() => {
    const onOnline = () => void flushQueue();
    window.addEventListener("online", onOnline);
    const id = setInterval(() => void flushQueue(), 30_000);
    void flushQueue();
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(id);
    };
  }, [flushQueue]);

  // Wake lock: la pantalla no se puede apagar en plena fila.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: "screen") => Promise<typeof lock> };
    };
    void nav.wakeLock
      ?.request("screen")
      .then((l) => {
        if (cancelled) void l?.release();
        else lock = l;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      void lock?.release().catch(() => {});
    };
  }, []);

  /**
   * Registro local sin señal: decodifica el JWT (persona legible), la
   * valida contra el manifiesto y encola. El resultado visual replica
   * el online (verde/ámbar) con sello "offline"; el server confirma al
   * sincronizar (firma + dedup real).
   */
  const registerLocal = useCallback(
    async (token: string) => {
      const payload = decodeJwtPayload(token);
      if (!payload?.sub) {
        buzz([80, 60, 80]);
        showResult({ kind: "error", message: tc("error") });
        return;
      }
      // QR vencido: el server lo rechazará en el sync - ámbar y a
      // buscar por nombre (la persona puede estar igual sin señal).
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        buzz([80, 60, 80]);
        showResult({ kind: "error", message: t("expiredQr") });
        return;
      }
      const pid = payload.sub;
      // Duplicado local: cola pendiente o check-in ya sincronizado.
      const already =
        queueRef.current.some(
          (q) => q.personId === pid && q.status !== "failed",
        ) ||
        checkinsRef.current.some((c) => c.personId === pid && !c.outAt);
      if (already) {
        buzz([80, 60, 80]);
        showResult({
          kind: "duplicate",
          name: manifest?.tickets.find((x) => x.personId === pid)?.name ?? null,
          at: null,
        });
        return;
      }
      // Lookup en el manifiesto: ticket > entry pass > series pass.
      const tkt = manifest?.tickets.find((x) => x.personId === pid);
      const ep = manifest?.entryPasses.find((x) => x.personId === pid);
      const sp = manifest?.seriesPasses.find((x) => x.personId === pid);
      const person = tkt ?? ep ?? sp;
      const passType = tkt ? null : (ep?.type ?? (sp ? "SERIES_PASS" : null));
      const name = person?.name ?? "?";
      const item: QueuedScan = {
        clientRef: crypto.randomUUID(),
        eventId,
        qrToken: token,
        personId: pid,
        name,
        photoUrl: person?.photoUrl ?? null,
        passType,
        scannedAt: new Date().toISOString(),
        status: "pending",
      };
      await doorDb.enqueue(item).catch(() => {});
      applyQueue(await doorDb.listQueue(eventId).catch(() => [item]));
      buzz(50);
      // No está en el manifiesto → ámbar-revisar (puede estar stale),
      // nunca rojo-duro: el check-in sí se registra para sync.
      showResult(
        person || passType
          ? { kind: "ok", name, passType, offline: true }
          : { kind: "nopass", name, offline: true },
      );
    },
    [eventId, manifest, applyQueue, showResult, t, tc],
  );

  // Contador/lista de la noche - polling ligero cada ~15s.
  useEffect(() => {
    void loadCheckins();
    const id = setInterval(() => void loadCheckins(), POLL_MS);
    return () => clearInterval(id);
  }, [loadCheckins]);

  // Nombre del evento para el header (endpoint público, best-effort).
  useEffect(() => {
    let cancelled = false;
    setEventNameDone(false);
    apiFetch(`/events/${eventId}`)
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const e = (await res.json()) as { name?: string };
        if (e.name) setEventName(e.name);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setEventNameDone(true);
      });
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
          // Body inesperado - se muestra el duplicado sin detalle.
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
      // 400 QR inválido / 404 evento o persona / 500 - mensaje del server si hay.
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
      // Sin señal → registro local + cola de sync (spec staff-offline-checkin).
      // La puerta no se detiene: la firma la confirma el server al volver.
      if (!navigator.onLine) {
        setOffline(true);
        void registerLocal(token);
        return;
      }
      inFlight.current = true;
      apiFetch("/checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrToken: token, eventId, method: "SCAN" }),
      })
        .then(handleResponse)
        .catch(() => {
          // Fetch rechazado = se cayó a mitad de escaneo → mismo camino
          // offline (si el POST llegó al server, el sync dirá duplicate).
          setOffline(true);
          void registerLocal(token);
        })
        .finally(() => {
          inFlight.current = false;
        });
    },
    [eventId, handleResponse, showResult, registerLocal],
  );

  /**
   * Manual por nombre: el staff busca en el manifest (ya cacheado en
   * IndexedDB - funciona sin señal) y registra a la persona elegida.
   * Online → POST /checkins/manual (flujo vigente); offline → encola
   * como ítem manual (personId sin qrToken).
   */
  const registerManual = useCallback(
    async (pid: string, name: string, photoUrl: string | null) => {
      if (inFlight.current) return;
      const already =
        queueRef.current.some(
          (q) => q.personId === pid && q.status !== "failed",
        ) || checkinsRef.current.some((c) => c.personId === pid && !c.outAt);
      if (already) {
        buzz([80, 60, 80]);
        showResult({ kind: "duplicate", name, at: null });
        setManualQuery("");
        setManualOpen(false);
        return;
      }
      inFlight.current = true;
      try {
        if (navigator.onLine) {
          const res = await apiFetch("/checkins/manual", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventId, personId: pid }),
          });
          if (res.status === 201) {
            setManualQuery("");
            setManualOpen(false);
          }
          await handleResponse(res);
        } else {
          const item: QueuedScan = {
            clientRef: crypto.randomUUID(),
            eventId,
            qrToken: "",
            personId: pid,
            name,
            photoUrl,
            passType: null,
            scannedAt: new Date().toISOString(),
            status: "pending",
          };
          await doorDb.enqueue(item).catch(() => {});
          applyQueue(await doorDb.listQueue(eventId).catch(() => [item]));
          buzz(50);
          setOffline(true);
          setManualQuery("");
          setManualOpen(false);
          showResult({ kind: "ok", name, offline: true });
        }
      } catch {
        setOffline(true);
        buzz([80, 60, 80]);
        showResult({ kind: "error", message: tc("error") });
      } finally {
        inFlight.current = false;
      }
    },
    [eventId, handleResponse, applyQueue, showResult, tc],
  );

  // Candidatos del manifest para la búsqueda manual (normalizado, ≤8).
  const manualCandidates = (() => {
    if (!manifest || !manualQuery.trim()) return [];
    const q = manualQuery.trim().toLowerCase();
    const all = [
      ...manifest.tickets.map((p) => ({ ...p, kind: "TICKET" })),
      ...manifest.entryPasses.map((p) => ({ ...p, kind: p.type ?? "PASS" })),
      ...manifest.seriesPasses.map((p) => ({ ...p, kind: "SERIES_PASS" })),
    ];
    const seen = new Set<string>();
    return all
      .filter((p) => p.name.toLowerCase().includes(q))
      .filter((p) => (seen.has(p.personId) ? false : (seen.add(p.personId), true)))
      .slice(0, 8);
  })();

  const submitManual = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      // Solo aplica el fallback por personId crudo cuando no hay manifest.
      if (manifest) return;
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
    [eventId, personId, manifest, handleResponse, showResult, tc],
  );

  // Los pendientes de sync ya admitieron gente - cuentan en el total
  // y aparecen en la lista con su badge.
  const count = checkins.filter((c) => !c.voidedAt).length + pendingCount;
  const conflictCount = queue.filter((q) => q.status !== "pending").length;

  // Lista fusionada: check-ins confirmados + cola local (arriba).
  const mergedList: {
    key: string;
    name: string;
    photoUrl: string | null;
    inAt: string;
    badge: string;
    voided?: boolean;
    pending?: boolean;
    conflict?: boolean;
  }[] = [
    ...queue
      .slice()
      .reverse()
      .map((q) => ({
        key: `q-${q.clientRef}`,
        name: q.name,
        photoUrl: q.photoUrl,
        inAt: q.scannedAt,
        badge:
          q.status === "pending"
            ? t("pendingSync")
            : q.status === "conflict"
              ? t("conflictBadge")
              : t("failedBadge"),
        pending: q.status === "pending",
        conflict: q.status !== "pending",
      })),
    ...checkins.map((c) => ({
      key: c.id,
      name: c.person.name,
      photoUrl: c.person.photoUrl,
      inAt: c.inAt,
      badge: c.method,
      voided: !!c.voidedAt,
    })),
  ];

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

  // ≥lg ambas columnas visibles (el tab bar inferior se oculta); <lg
  // `view` alterna paneles y la cámara se desmonta al pasar a la lista.
  const showScan = isDesktop || view === "scan";
  const showList = isDesktop || view === "list";

  return (
    <main className="flex min-h-dvh flex-col bg-night-950">
      {/* Header compacto: volver + evento + contador de la noche.
          En ≥lg el contenido se centra en max-w-6xl (contents en móvil:
          el DOM no cambia bajo lg). */}
      <header className="flex items-center gap-3 border-b border-night-700 px-4 py-2.5 lg:block lg:px-8">
        <div className="contents lg:mx-auto lg:flex lg:max-w-6xl lg:items-center lg:gap-3">
        <Link
          href="/staff"
          className="flex min-h-11 items-center text-sm font-semibold text-white/70"
        >
          ‹ {t("title")}
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-center text-sm font-semibold">
          {eventName ??
            (eventNameDone ? (
              ""
            ) : (
              /* Skeleton de ancho fijo en el slot del título - span
                 porque h1 solo admite phrasing content. */
              <span
                aria-hidden="true"
                className="page-loading inline-block h-4 w-32 animate-pulse rounded-lg bg-night-800 align-middle motion-reduce:animate-none"
              />
            ))}
        </h1>
        <div className="flex min-h-11 items-baseline gap-1.5">
          <span className="text-2xl font-black text-neon">{count}</span>
          <span className="text-xs text-white/50">{t("list")}</span>
        </div>
        </div>
      </header>

      {/* Aviso de conectividad: pendientes de sync + antigüedad del
          manifiesto (el staff sabe contra qué padrón está validando) */}
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
          <span>
            {t("offline")}
            {pendingCount > 0 && ` · ${t("pendingSyncCount", { count: pendingCount })}`}
            {conflictCount > 0 && ` · ${t("conflictCount", { count: conflictCount })}`}
            {manifest &&
              ` · ${t("manifestAge", { age: manifest.generatedAt.slice(11, 16) })}`}
          </span>
        </div>
      )}

      {/* Volvió la señal con cola viva: sincronizando en segundo plano
          o conflictos que requieren decisión del staff */}
      {!offline && (pendingCount > 0 || conflictCount > 0) && (
        <div className="flex items-center justify-center gap-2 border-b border-night-700 bg-night-900 px-4 py-2 text-sm font-medium text-white/70">
          {pendingCount > 0 && t("pendingSyncCount", { count: pendingCount })}
          {pendingCount > 0 && conflictCount > 0 && " · "}
          {conflictCount > 0 && (
            <span className="text-amber-300">
              {t("conflictCount", { count: conflictCount })}
            </span>
          )}
        </div>
      )}

      {gate === "loading" && (
        /* Filas de asistentes en vuelo → SkeletonList (layout conocido),
           nunca spinner desnudo a nivel panel. */
        <div className="flex-1 px-4 py-3 lg:mx-auto lg:w-full lg:max-w-6xl lg:px-8">
          <SkeletonList items={4} lines={1} />
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

      {/* ≥lg: dos columnas - izquierda métricas/acciones (escáner +
          ingreso manual), derecha la lista de check-ins con scroll
          propio. El wrapper es display:contents en móvil: el DOM y el
          layout <lg no cambian, `view` solo alterna paneles ahí. */}
      {gate === "ok" && (
        <div className="contents lg:mx-auto lg:grid lg:min-h-0 lg:w-full lg:max-w-6xl lg:flex-1 lg:grid-cols-[380px_1fr] lg:items-stretch lg:gap-8 lg:px-8 lg:py-6">
      {showScan && (
        <section
          aria-label={t("scan")}
          className={
            view === "scan"
              ? "flex min-h-0 flex-1 flex-col lg:gap-4"
              : "hidden lg:flex lg:min-h-0 lg:flex-col lg:gap-4"
          }
        >
          {/* Cámara grande - el teléfono se sostiene a la altura del pecho */}
          <div className="relative min-h-0 flex-1 lg:overflow-hidden lg:rounded-2xl lg:border lg:border-night-700">
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

          {/* Check-in manual colapsable - v1 por personId.
              TODO(ux): selector por nombre cuando exista búsqueda de personas. */}
          <section className="border-t border-night-700 px-4 lg:rounded-2xl lg:border lg:bg-night-900 lg:p-4">
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
            {manualOpen &&
              (manifest ? (
                /* Búsqueda por nombre sobre el manifiesto cacheado -
                   funciona sin señal y sin saberse el personId. */
                <div className="pb-3">
                  <input
                    value={manualQuery}
                    onChange={(e) => setManualQuery(e.target.value)}
                    placeholder={t("searchName")}
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="min-h-12 w-full rounded-xl border border-night-700 bg-night-900 px-4 text-white focus:border-neon focus-visible:ring-2 focus-visible:ring-neon/50"
                  />
                  {manualCandidates.length > 0 && (
                    <ul className="mt-1 divide-y divide-night-700 overflow-hidden rounded-xl border border-night-700">
                      {manualCandidates.map((p) => (
                        <li key={p.personId}>
                          <button
                            type="button"
                            onClick={() =>
                              void registerManual(p.personId, p.name, p.photoUrl)
                            }
                            className="flex min-h-12 w-full items-center gap-3 px-4 text-left active:bg-night-800"
                          >
                            <Avatar name={p.name} photoUrl={p.photoUrl} />
                            <span className="min-w-0 flex-1 truncate font-medium">
                              {p.name}
                            </span>
                            <Badge variant="muted">{p.kind}</Badge>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                /* Sin manifiesto (nunca cargó) → fallback por personId. */
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
              ))}
          </section>
        </section>
      )}

      {showList && (
        <section
          aria-label={t("list")}
          className={
            view === "list"
              ? "flex min-h-0 flex-1 flex-col"
              : "hidden lg:flex lg:min-h-0 lg:flex-col"
          }
        >
        <ul className="min-h-0 flex-1 divide-y divide-night-700 overflow-y-auto lg:rounded-2xl lg:border lg:border-night-700 lg:bg-night-900">
          {mergedList.length === 0 ? (
            <li className="p-8 text-center text-sm text-white/50">
              {t("scanning")}
            </li>
          ) : (
            mergedList.map((c) => (
              <li
                key={c.key}
                className={`flex items-center gap-3 px-4 py-3 ${
                  c.voided ? "opacity-40" : c.conflict ? "bg-amber-500/10" : ""
                }`}
              >
                <Avatar name={c.name} photoUrl={c.photoUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="text-xs text-white/50">
                    <EventDate start={c.inAt} variant="time" />
                  </p>
                </div>
                <Badge
                  variant={
                    c.pending ? "outline" : c.conflict ? "muted" : c.badge === "MANUAL" ? "outline" : "muted"
                  }
                >
                  {c.badge}
                </Badge>
              </li>
            ))
          )}
        </ul>
        </section>
      )}
        </div>
      )}

      {/* Tabs inferiores - al alcance del pulgar con una mano.
          En ≥lg no aplican: las dos columnas ya están visibles. */}
      {gate === "ok" && (
        <nav className="grid grid-cols-2 border-t border-night-700 bg-night-900 lg:hidden">
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

      {/* Resultado a pantalla completa - legible a brazo de distancia */}
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
              {result.offline && (
                <p className="text-base font-semibold opacity-80">
                  {t("offlineSeal")}
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
              {result.offline && (
                <p className="text-base font-semibold opacity-80">
                  {t("offlineSeal")}
                </p>
              )}
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
