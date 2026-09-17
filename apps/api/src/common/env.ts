/**
 * Secreto de entorno con fallback SOLO fuera de producción.
 * En producción un secreto ausente es un error de arranque (fail-fast):
 * firmar tokens con un default público haría falsificables sesiones y QR.
 */
export function secretOrDevFallback(key: string, devFallback: string): string {
  const value = process.env[key];
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${key} es requerido en producción`);
  }
  return devFallback;
}
