// Estilos que existen en el catálogo (series de academia, eventos,
// bloques de horario) pero no se ofrecen en el picker "Tu baile" del
// perfil ni en /bienvenida - la selección personal se acota a los
// estilos mainstream de la escena. La comparación es por nombre porque
// el catálogo viene de la DB (los seeds no borran filas existentes,
// así que el filtro también cubre DBs ya pobladas).
export const PROFILE_HIDDEN_STYLES: ReadonlySet<string> = new Set([
  "Salsa on2",
  "Bachata dominicana",
  "Afrocubano",
  "Rueda de casino",
  "Fusión",
]);

export function isProfileStyleVisible(name: string): boolean {
  return !PROFILE_HIDDEN_STYLES.has(name);
}
