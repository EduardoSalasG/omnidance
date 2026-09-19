import type { Config } from "tailwindcss";

// Design tokens — dark-first (la app se usa de noche en locales oscuros)
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        night: {
          950: "#0a0a0f",
          900: "#12121a",
          800: "#1c1c28",
          700: "#2a2a3a",
        },
        neon: {
          // CSS vars — swappean por modo de vista (data-mode en <html>):
          // Social = lime, Academia = violeta. Marca lime vive en
          // icon.svg/OG/PWA (estáticos, fuera del theming).
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          soft: "rgb(var(--accent-soft) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
