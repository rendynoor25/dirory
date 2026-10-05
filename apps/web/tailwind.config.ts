import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Sampled from the Dirory logo: a slate-indigo gradient from
        // #3B52A1 (deep) to #5C6FB1 (light), averaging ~#4A5FAB.
        brand: {
          50: "#f2f5fb",
          100: "#e4eaf6",
          200: "#c7d3ec",
          300: "#a1b3de",
          400: "#7489c8",
          500: "#576baf",
          600: "#4a5fab",
          700: "#3b52a1",
          800: "#31447f",
          900: "#2a3861",
        },
      },
    },
  },
  plugins: [],
};

export default config;
