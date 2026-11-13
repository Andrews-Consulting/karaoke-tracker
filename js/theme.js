// Applies the theme choice (R32) to the page: the data-theme attribute that
// css/app.css styles, the browser-chrome colour, and the saved choice. The
// inline script in index.html applies the saved choice before the first paint;
// this module keeps it current afterwards and follows the phone's setting when
// the choice is "Match the phone".
import {
  normalizeThemeChoice, resolveTheme, THEME_COLORS, normalizeAccentChoice, DEFAULT_ACCENT_CHOICE,
} from './lib/theme.js';

const STORAGE_KEY = 'theme';
const ACCENT_KEY = 'accent';
const lightQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

function systemPrefersLight() {
  return !!(lightQuery && lightQuery.matches);
}

export function savedThemeChoice() {
  try {
    return normalizeThemeChoice(localStorage.getItem(STORAGE_KEY));
  } catch {
    return normalizeThemeChoice(null);
  }
}

function paint(choice) {
  const theme = resolveTheme(choice, systemPrefersLight());
  if (theme === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[theme]);
}

// Saves and shows a choice: 'dark', 'light' or 'system'.
export function applyThemeChoice(value) {
  const choice = normalizeThemeChoice(value);
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Private mode or storage blocked: the choice lasts for this visit only.
  }
  paint(choice);
}

// ---- Accent (R55): green by default, or amber, lime or pink ----

export function savedAccentChoice() {
  try {
    return normalizeAccentChoice(localStorage.getItem(ACCENT_KEY));
  } catch {
    return DEFAULT_ACCENT_CHOICE;
  }
}

function paintAccent(choice) {
  if (choice === DEFAULT_ACCENT_CHOICE) delete document.documentElement.dataset.accent;
  else document.documentElement.dataset.accent = choice;
}

export function applyAccentChoice(value) {
  const choice = normalizeAccentChoice(value);
  try {
    localStorage.setItem(ACCENT_KEY, choice);
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
  paintAccent(choice);
}

// At startup: show the saved choices and follow the phone when asked to.
export function initTheme() {
  paint(savedThemeChoice());
  paintAccent(savedAccentChoice());
  if (lightQuery) {
    lightQuery.addEventListener('change', () => {
      if (savedThemeChoice() === 'system') paint('system');
    });
  }
}
