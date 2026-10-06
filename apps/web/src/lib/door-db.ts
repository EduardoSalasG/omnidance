/**
 * door-db — IndexedDB para la puerta offline (spec staff-offline-checkin).
 *
 * Dos stores:
 * - `manifest` (key = eventId): el snapshot de GET /events/:id/door-manifest
 *   - pases ACTIVE con persona resuelta + check-ins abiertos.
 * - `queue` (keyPath = clientRef): escaneos registrados sin señal,
 *   pendientes de POST /checkins/sync. `status` refleja el resultado del
 *   sync: pending | conflict (duplicate) | failed (invalid_token|error).
 *
 * Sin dependencias nuevas - wrapper mínimo sobre la API nativa.
 */

export type DoorManifest = {
  event: {
    id: string;
    status: string;
    seriesId?: string | null;
    doorPrice?: number | null;
    doorCap?: number | null;
  };
  tickets: { personId: string; name: string; photoUrl: string | null }[];
  entryPasses: {
    personId: string;
    type: string | null;
    name: string;
    photoUrl: string | null;
  }[];
  seriesPasses: { personId: string; name: string; photoUrl: string | null }[];
  checkins: { personId: string; inAt: string }[];
  generatedAt: string;
};

export type QueuedScan = {
  /** uuid del dispositivo - idempotencia exacta del retry en el server. */
  clientRef: string;
  eventId: string;
  /** JWT crudo escaneado - vacío cuando el registro fue manual por nombre. */
  qrToken: string;
  /** Resuelto localmente al escanear (o elegido en búsqueda manual). */
  personId: string;
  name: string;
  photoUrl: string | null;
  /** Tipo de pase encontrado en el manifest (display-only). */
  passType: string | null;
  /** Hora real del escaneo - el server la persiste en Checkin.inAt. */
  scannedAt: string;
  status: "pending" | "conflict" | "failed";
  detail?: string | null;
};

const DB_NAME = "omnidance-door";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("manifest")) {
        db.createObjectStore("manifest");
      }
      if (!db.objectStoreNames.contains("queue")) {
        const store = db.createObjectStore("queue", { keyPath: "clientRef" });
        store.createIndex("eventId", "eventId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error as Error);
  });
}

function tx<T>(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = run(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error as Error);
  });
}

function txKeys<T>(
  db: IDBDatabase,
  store: string,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return tx(db, store, "readonly", run);
}

export const doorDb = {
  async saveManifest(manifest: DoorManifest): Promise<void> {
    const db = await openDb();
    await tx(db, "manifest", "readwrite", (s) =>
      s.put(manifest, manifest.event.id),
    );
  },

  async loadManifest(eventId: string): Promise<DoorManifest | null> {
    const db = await openDb();
    const m = await txKeys<DoorManifest | undefined>(db, "manifest", (s) =>
      s.get(eventId),
    );
    return m ?? null;
  },

  async enqueue(item: QueuedScan): Promise<void> {
    const db = await openDb();
    await tx(db, "queue", "readwrite", (s) => s.put(item));
  },

  async listQueue(eventId: string): Promise<QueuedScan[]> {
    const db = await openDb();
    const all = await txKeys<QueuedScan[]>(db, "queue", (s) => s.getAll());
    return all.filter((q) => q.eventId === eventId);
  },

  async patchQueue(
    clientRef: string,
    patch: Partial<QueuedScan>,
  ): Promise<void> {
    const db = await openDb();
    const cur = await txKeys<QueuedScan | undefined>(db, "queue", (s) =>
      s.get(clientRef),
    );
    if (!cur) return;
    await tx(db, "queue", "readwrite", (s) => s.put({ ...cur, ...patch }));
  },

  async removeQueueItem(clientRef: string): Promise<void> {
    const db = await openDb();
    await tx(db, "queue", "readwrite", (s) => s.delete(clientRef));
  },
};

/** Decodifica el payload de un JWT sin verificar (offline: la firma la
 *  confirma el server al sincronizar). Devuelve {sub, exp} o null. */
export function decodeJwtPayload(
  token: string,
): { sub?: string; exp?: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64)) as { sub?: string; exp?: number };
  } catch {
    return null;
  }
}
