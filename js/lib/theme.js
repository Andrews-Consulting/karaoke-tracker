// Theme choice (R32). Pure: no DOM, no storage.
//
// The app is dark by default, for a dim bar. The owner can pick light, or
// follow the phone's setting. `choice` is what is saved; `resolveTheme()` turns
// it into the theme to show.

export const THEME_CHOICES = [
  ['dark', 'Dark'],
  ['light', 'Light'],
  ['system', 'Match the phone'],
];

export const DEFAULT_THEME_CHOICE = 'dark';

// The browser-chrome colour (meta theme-color) for each theme; the same values
// as --bg in css/app.css.
export const THEME_COLORS = { dark: '#14121a', light: '#f6f3fb' };

// A saved value, or anything unexpected, as one of the choices.
export function normalizeThemeChoice(value) {
  return THEME_CHOICES.some(([key]) => key === value) ? value : DEFAULT_THEME_CHOICE;
}

// 'dark' or 'light' for a choice; `systemPrefersLight` is the phone's setting.
export function resolveTheme(choice, systemPrefersLight = false) {
  const key = normalizeThemeChoice(choice);
  if (key === 'light') return 'light';
  if (key === 'system') return systemPrefersLight ? 'light' : 'dark';
  return 'dark';
}
