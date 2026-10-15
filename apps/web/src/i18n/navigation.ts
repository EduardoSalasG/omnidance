import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Adapter de navegación locale-aware: Link/redirect/useRouter/
 * usePathname resuelven el prefijo del locale activo
 * ("/en/eventos" bajo /en). Las URLs del código siguen siendo sin
 * prefijo - igual que antes de multi-locale.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
