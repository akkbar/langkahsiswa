import { useState } from "react";
export function ThemeToggle({ menuItem = false }: { menuItem?: boolean }) {
  const [theme, setTheme] = useState(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  return (
    <button
      type="button"
      role={menuItem ? "menuitem" : undefined}
      className="theme-toggle"
      aria-label={
        theme === "dark" ? "Aktifkan mode terang" : "Aktifkan mode gelap"
      }
      onClick={() => {
        const next = theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("langkahsiswa-theme", next);
        } catch {
          /* Theme works without storage. */
        }
        setTheme(next);
      }}
    >
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
      <span>{theme === "dark" ? "Mode Terang" : "Mode Gelap"}</span>
    </button>
  );
}
