// Setup por worker de Vitest (corre antes de que cada spec instancie
// PrismaService). Cada spec e2e levanta su propia app Nest → su propio
// PrismaClient con pool default num_cpus*2+1 (~33 con 16 cores). Con
// ~15 workers en paralelo eso supera max_connections=100 de Postgres y
// los beforeAll se cuelgan esperando conexión → flake por timeout.
// Capando el pool por spec (4) el total queda muy por debajo del límite;
// dentro de un spec los requests son secuenciales y no necesitan más.
const url = process.env.DATABASE_URL;
if (url && !url.includes("connection_limit")) {
  const sep = url.includes("?") ? "&" : "?";
  process.env.DATABASE_URL = `${url}${sep}connection_limit=4`;
}
