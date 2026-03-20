/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./app/**/*.js",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary":   "#0995ec",
        "bg-light":  "#F8FAFC",
        "bg-dark":   "#101b22",
        "sidebar":   "#ffffff",
        "emerald-v": "#10B981",
        "amber-v":   "#F59E0B",
      },
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        body:    ["Inter", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        "lg":    "1rem",
        "xl":    "1.5rem",
        "2xl":   "2rem",
        "3xl":   "2.5rem",
        "full":  "9999px",
      },
    },
  },
  plugins: [
    require("@tailwindcss/forms"),
    require("@tailwindcss/container-queries"),
  ],
};
