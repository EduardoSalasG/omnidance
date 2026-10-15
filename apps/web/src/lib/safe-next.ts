/**
 * Sanitiza el parámetro `?next=` de post-login/post-onboarding.
 * Una ruta "interna" legítima empieza con `/` y no es:
 * - `//host`     protocol-relative → open redirect
 * - `/\host`     el backslash se normaliza a `/` en location.href →
 *                equivalente a `//host` (bypass del check de "//")
 * - `%5c` variantes URL-encoded del mismo truco.
 * Uso: `const next = safeInternalPath(params.get("next")) ?? "/inicio"`.
 */
export function safeInternalPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const decoded = path.replace(/%5c/gi, "\\");
  if (decoded.startsWith("/") && !decoded.startsWith("//") && !decoded.startsWith("/\\")) {
    return decoded;
  }
  return null;
}
