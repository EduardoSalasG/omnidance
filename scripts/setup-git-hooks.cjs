// Activa los hooks versionados de .githooks/ via core.hooksPath.
// Corre en postinstall (raíz del workspace): cualquier clone que haga
// `pnpm install` queda con la regla de commits activa. Fuera de un
// repo git o sin git instalado, no hace nada.
const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");

if (!existsSync(join(root, ".git")) || !existsSync(join(root, ".githooks"))) {
  process.exit(0);
}

try {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
    cwd: root,
    stdio: "ignore",
  });
} catch {
  // Sin git o fuera de repo: nada que hacer.
}
