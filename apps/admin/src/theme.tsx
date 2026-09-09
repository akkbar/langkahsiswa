import { useState } from "react";
export function ThemeToggle() {
  const [theme, setTheme] = useState(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={
        theme === "dark" ? "Aktifkan mode terang" : "Aktifkan mode gelap"
      }
      onClick={() => {
        const next = theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("schoolapp-theme", next);
        } catch {
          /* Theme works without storage. */
        }
        setTheme(next);
      }}
    >
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
      <span>{theme === "dark" ? "Terang" : "Gelap"}</span>
    </button>
  );
}
