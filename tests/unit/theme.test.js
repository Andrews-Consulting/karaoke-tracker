import { describe, it, expect } from 'vitest';
import {
  THEME_CHOICES, DEFAULT_THEME_CHOICE, THEME_COLORS, normalizeThemeChoice, resolveTheme,
} from '../../js/lib/theme.js';

describe('theme (R32)', () => {
  it('offers dark, light and the phone setting, dark first', () => {
    expect(THEME_CHOICES.map(([key]) => key)).toEqual(['dark', 'light', 'system']);
    expect(DEFAULT_THEME_CHOICE).toBe('dark');
  });

  it('turns unknown saved values into the default', () => {
    expect(normalizeThemeChoice('light')).toBe('light');
    expect(normalizeThemeChoice('system')).toBe('system');
    for (const bad of [null, undefined, '', 'blue', 'LIGHT', 0, {}]) expect(normalizeThemeChoice(bad)).toBe('dark');
  });

  it('resolves a choice to dark or light', () => {
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
    expect(resolveTheme('system')).toBe('dark');
    expect(resolveTheme('nonsense', true)).toBe('dark');
  });

  it('has a browser-chrome colour for each theme', () => {
    expect(Object.keys(THEME_COLORS).sort()).toEqual(['dark', 'light']);
    for (const colour of Object.values(THEME_COLORS)) expect(colour).toMatch(/^#[0-9a-f]{6}$/);
  });
});
