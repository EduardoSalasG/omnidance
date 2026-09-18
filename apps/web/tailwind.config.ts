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
          DEFAULT: "#a3e635", // accent — marca (icon.svg, og-image, icons PWA)
          soft: "#baf360",
        },
      },
    },
  },
  plugins: [],
};

export default config;
