"use client";

import { useState } from "react";
import { Theme, useTheme } from "@/lib/theme";

const THEME_OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "☀️" },
  { value: "dark", label: "Dark", icon: "🌙" },
  { value: "system", label: "System", icon: "🖥️" },
];

/**
 * Settings entry pinned to the bottom of the left nav. Clicking it expands a
 * panel of settings; Theme is the first one.
 */
export function SettingsNav() {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  return (
    <div className="border-t border-gray-200 dark:border-gray-700">
      {open && (
        <div className="animate-fade-in space-y-3 px-4 py-3">
          <div>
            <div className="mb-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
              Theme
            </div>
            <div className="flex gap-1.5">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  className={`chip flex-1 justify-center transition ${
                    theme === opt.value
                      ? "bg-indigo-600 text-white"
                      : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  }`}
                  title={opt.label}
                >
                  <span>{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-200/60 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        <span className="flex items-center gap-2">
          <span>⚙️</span> Settings
        </span>
        <span className="text-gray-400">{open ? "▾" : "▸"}</span>
      </button>
    </div>
  );
}
