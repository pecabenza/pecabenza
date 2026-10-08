import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/modules/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        tenant: {
          primary: "var(--color-primary, #A84B2C)",
          secondary: "var(--color-secondary, #D99B26)",
          accent: "var(--color-accent, #2C1A14)",
          background: "var(--color-background, #FDFBF7)",
          surface: "var(--color-surface, #FFFFFF)",
          text: "var(--color-text, #1C1917)",
          muted: "var(--color-muted, #78716C)",
          border: "var(--color-border, #E7E5E4)",
        },
      },
      borderRadius: {
        tenant: "var(--border-radius, 0.5rem)",
      },
      fontFamily: {
        heading: ["var(--font-heading, Inter)", "system-ui", "sans-serif"],
        body: ["var(--font-body, Inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
