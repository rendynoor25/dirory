import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#dbe6ff",
          200: "#bccfff",
          300: "#93aeff",
          400: "#6a86ff",
          500: "#4a5fff",
          600: "#3440e8",
          700: "#2a31bd",
          800: "#262e96",
          900: "#252e77",
        },
      },
    },
  },
  plugins: [],
};

export default config;
