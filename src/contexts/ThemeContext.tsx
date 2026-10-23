import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type Theme = "light" | "dark" | "sepia" | "system";
export type EffectiveTheme = "light" | "dark" | "sepia";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  effectiveTheme: EffectiveTheme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = "novelaide-theme";

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    return saved || "system";
  });

  const [effectiveTheme, setEffectiveTheme] = useState<EffectiveTheme>("dark");

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
  };

  const toggleTheme = () => {
    const themeCycle: Theme[] = ["dark", "light", "sepia", "system"];
    const currentIndex = themeCycle.indexOf(theme);
    const nextTheme = themeCycle[(currentIndex + 1) % themeCycle.length];
    setTheme(nextTheme);
  };

  useEffect(() => {
    const applyTheme = () => {
      const root = document.documentElement;
      let calculated: EffectiveTheme = "dark";

      if (theme === "system") {
        const isLight = window.matchMedia("(prefers-color-scheme: light)").matches;
        calculated = isLight ? "light" : "dark";
        root.removeAttribute("data-theme");
      } else {
        calculated = theme;
        root.setAttribute("data-theme", theme);
      }

      setEffectiveTheme(calculated);
    };

    applyTheme();

    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const handleChange = () => {
      if (theme === "system") {
        applyTheme();
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, effectiveTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
