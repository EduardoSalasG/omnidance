// NEXT_PUBLIC_API_URL vacío (default) → URL relativa → same-origin, el
// rewrite de next.config.mjs proxea /api/* al API. Solo setearla para
// apuntar a un API en otro host sin proxy (modo cross-site).
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export function apiFetch(path: string, init?: RequestInit) {
  return fetch(`${API_URL}/api${path}`, {
    credentials: "include",
    ...init,
  });
}
