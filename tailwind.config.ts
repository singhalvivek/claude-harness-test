import type { Config } from "tailwindcss";

const config: Config = {
  // Glob every source file so utilities used anywhere in the app are emitted.
  // The Phase-1 gate checks the built CSS contains real utility selectors.
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        serif: ["var(--font-serif)", "ui-serif", "Georgia", "Cambria", "serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        paper: "hsl(43 40% 97%)",
        ink: "hsl(28 18% 18%)",
        trail: "hsl(18 62% 47%)",
      },
    },
  },
  plugins: [],
};

export default config;
