// Theme system for Ideate
// Each theme has light/dark mode variants with full design token support

export type ThemeId = 'ideate' | 'midnight' | 'forest' | 'sunset' | 'ocean' | 'monochrome';
export type ColorMode = 'system' | 'light' | 'dark';

export interface ThemeColors {
  background: string;
  backgroundSecondary: string;
  foreground: string;
  secondary: string;
  muted: string;
  accent: string;
  accentForeground: string;
  border: string;
  card: string;
  destructive: string;
  success: string;
  warning: string;
}

export interface ThemeTypography {
  fontSans: string;
  fontMono: string;
  fontSize: string;
  lineHeight: string;
}

export interface ThemeRadii {
  sm: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
  full: string;
}

export interface ThemeShadows {
  xs: string;
  sm: string;
  md: string;
  lg: string;
}

export interface ThemeLayout {
  panelHeaderHeight: string;
  panelPadding: string;
  panelTitlePadding: string;
  panelGap: string;
  panelBorderWidth: string;
  buttonPadding: string;
  buttonPaddingSm: string;
  buttonPaddingLg: string;
  inputPadding: string;
  modalPadding: string;
}

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  description: string;
  typography: ThemeTypography;
  radii: ThemeRadii;
  shadows: ThemeShadows;
  layout: ThemeLayout;
  light: ThemeColors;
  dark: ThemeColors;
}

// ============================================================================
// Theme Definitions
// ============================================================================

export const themes: Record<ThemeId, ThemeDefinition> = {
  // Default Ideate theme - preserves the original design
  ideate: {
    id: 'ideate',
    name: 'Ideate',
    description: 'The original Ideate design with vibrant green accents',
    typography: {
      fontSans: '"Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
      fontMono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
      fontSize: '13px',
      lineHeight: '1.5',
    },
    radii: {
      sm: '4px',
      md: '6px',
      lg: '8px',
      xl: '12px',
      '2xl': '16px',
      full: '9999px',
    },
    shadows: {
      xs: '0 1px 0 rgba(15, 23, 42, 0.04)',
      sm: '0 1px 2px rgba(15, 23, 42, 0.08)',
      md: '0 4px 6px rgba(15, 23, 42, 0.10)',
      lg: '0 10px 15px rgba(15, 23, 42, 0.15)',
    },
    layout: {
      panelHeaderHeight: '32px',
      panelPadding: '16px',
      panelTitlePadding: '12px 16px',
      panelGap: '8px',
      panelBorderWidth: '1px',
      buttonPadding: '6px 12px',
      buttonPaddingSm: '4px 8px',
      buttonPaddingLg: '10px 20px',
      inputPadding: '8px 12px',
      modalPadding: '24px',
    },
    light: {
      background: '255 255 255',
      backgroundSecondary: '250 250 250',
      foreground: '10 10 10',
      secondary: '113 113 122',
      muted: '161 161 170',
      accent: '34 197 94',
      accentForeground: '255 255 255',
      border: '228 228 231',
      card: '243 244 246',
      destructive: '239 68 68',
      success: '34 197 94',
      warning: '245 158 11',
    },
    dark: {
      background: '10 10 10',
      backgroundSecondary: '17 17 17',
      foreground: '255 255 255',
      secondary: '161 161 170',
      muted: '113 113 122',
      accent: '34 197 94',
      accentForeground: '255 255 255',
      border: '38 38 38',
      card: '26 26 26',
      destructive: '239 68 68',
      success: '34 197 94',
      warning: '245 158 11',
    },
  },

  // Midnight - Deep blue theme for late-night coding
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep blue tones for comfortable late-night sessions',
    typography: {
      fontSans: '"Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
      fontMono: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
      fontSize: '13px',
      lineHeight: '1.5',
    },
    radii: {
      sm: '4px',
      md: '8px',
      lg: '10px',
      xl: '14px',
      '2xl': '18px',
      full: '9999px',
    },
    shadows: {
      xs: '0 1px 0 rgba(0, 0, 0, 0.1)',
      sm: '0 2px 4px rgba(0, 0, 0, 0.15)',
      md: '0 4px 8px rgba(0, 0, 0, 0.20)',
      lg: '0 8px 16px rgba(0, 0, 0, 0.25)',
    },
    layout: {
      panelHeaderHeight: '36px',
      panelPadding: '16px',
      panelTitlePadding: '14px 16px',
      panelGap: '8px',
      panelBorderWidth: '1px',
      buttonPadding: '8px 14px',
      buttonPaddingSm: '4px 10px',
      buttonPaddingLg: '12px 22px',
      inputPadding: '10px 14px',
      modalPadding: '24px',
    },
    light: {
      background: '241 245 249',
      backgroundSecondary: '226 232 240',
      foreground: '15 23 42',
      secondary: '71 85 105',
      muted: '100 116 139',
      accent: '59 130 246',
      accentForeground: '255 255 255',
      border: '203 213 225',
      card: '248 250 252',
      destructive: '220 38 38',
      success: '22 163 74',
      warning: '234 179 8',
    },
    dark: {
      background: '15 23 42',
      backgroundSecondary: '30 41 59',
      foreground: '241 245 249',
      secondary: '148 163 184',
      muted: '100 116 139',
      accent: '96 165 250',
      accentForeground: '15 23 42',
      border: '51 65 85',
      card: '30 41 59',
      destructive: '248 113 113',
      success: '74 222 128',
      warning: '250 204 21',
    },
  },

  // Forest - Natural green theme inspired by nature
  forest: {
    id: 'forest',
    name: 'Forest',
    description: 'Earthy greens and warm browns inspired by nature',
    typography: {
      fontSans: '"Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      fontMono: '"Fira Code", ui-monospace, SFMono-Regular, monospace',
      fontSize: '13px',
      lineHeight: '1.55',
    },
    radii: {
      sm: '3px',
      md: '5px',
      lg: '8px',
      xl: '12px',
      '2xl': '16px',
      full: '9999px',
    },
    shadows: {
      xs: '0 1px 0 rgba(20, 83, 45, 0.05)',
      sm: '0 1px 3px rgba(20, 83, 45, 0.10)',
      md: '0 4px 6px rgba(20, 83, 45, 0.12)',
      lg: '0 10px 15px rgba(20, 83, 45, 0.15)',
    },
    layout: {
      panelHeaderHeight: '34px',
      panelPadding: '14px',
      panelTitlePadding: '12px 14px',
      panelGap: '6px',
      panelBorderWidth: '1px',
      buttonPadding: '6px 14px',
      buttonPaddingSm: '4px 10px',
      buttonPaddingLg: '10px 20px',
      inputPadding: '8px 12px',
      modalPadding: '20px',
    },
    light: {
      background: '250 250 247',
      backgroundSecondary: '243 244 240',
      foreground: '28 25 23',
      secondary: '87 83 78',
      muted: '120 113 108',
      accent: '22 163 74',
      accentForeground: '255 255 255',
      border: '214 211 209',
      card: '245 245 244',
      destructive: '185 28 28',
      success: '22 163 74',
      warning: '202 138 4',
    },
    dark: {
      background: '28 25 23',
      backgroundSecondary: '41 37 36',
      foreground: '250 250 249',
      secondary: '168 162 158',
      muted: '120 113 108',
      accent: '74 222 128',
      accentForeground: '20 83 45',
      border: '68 64 60',
      card: '41 37 36',
      destructive: '248 113 113',
      success: '74 222 128',
      warning: '250 204 21',
    },
  },

  // Sunset - Warm orange and coral tones
  sunset: {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm orange and coral tones for a cozy atmosphere',
    typography: {
      fontSans: '"Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      fontMono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
      fontSize: '13px',
      lineHeight: '1.5',
    },
    radii: {
      sm: '4px',
      md: '6px',
      lg: '10px',
      xl: '14px',
      '2xl': '20px',
      full: '9999px',
    },
    shadows: {
      xs: '0 1px 0 rgba(194, 65, 12, 0.04)',
      sm: '0 1px 2px rgba(194, 65, 12, 0.08)',
      md: '0 4px 6px rgba(194, 65, 12, 0.10)',
      lg: '0 10px 15px rgba(194, 65, 12, 0.12)',
    },
    layout: {
      panelHeaderHeight: '32px',
      panelPadding: '16px',
      panelTitlePadding: '12px 16px',
      panelGap: '8px',
      panelBorderWidth: '1px',
      buttonPadding: '6px 12px',
      buttonPaddingSm: '4px 8px',
      buttonPaddingLg: '10px 20px',
      inputPadding: '8px 12px',
      modalPadding: '24px',
    },
    light: {
      background: '255 251 245',
      backgroundSecondary: '254 243 232',
      foreground: '67 20 7',
      secondary: '120 53 15',
      muted: '154 90 42',
      accent: '234 88 12',
      accentForeground: '255 255 255',
      border: '253 186 116',
      card: '255 247 237',
      destructive: '185 28 28',
      success: '22 163 74',
      warning: '217 119 6',
    },
    dark: {
      background: '28 17 12',
      backgroundSecondary: '41 28 22',
      foreground: '255 247 237',
      secondary: '253 186 116',
      muted: '194 120 67',
      accent: '251 146 60',
      accentForeground: '28 17 12',
      border: '67 37 23',
      card: '41 28 22',
      destructive: '248 113 113',
      success: '74 222 128',
      warning: '251 191 36',
    },
  },

  // Ocean - Cool cyan and teal inspired by the sea
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    description: 'Cool cyan and teal tones inspired by the sea',
    typography: {
      fontSans: '"Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      fontMono: '"Source Code Pro", ui-monospace, SFMono-Regular, monospace',
      fontSize: '13px',
      lineHeight: '1.5',
    },
    radii: {
      sm: '4px',
      md: '6px',
      lg: '8px',
      xl: '12px',
      '2xl': '16px',
      full: '9999px',
    },
    shadows: {
      xs: '0 1px 0 rgba(6, 95, 70, 0.05)',
      sm: '0 1px 2px rgba(6, 95, 70, 0.10)',
      md: '0 4px 6px rgba(6, 95, 70, 0.12)',
      lg: '0 10px 15px rgba(6, 95, 70, 0.15)',
    },
    layout: {
      panelHeaderHeight: '32px',
      panelPadding: '16px',
      panelTitlePadding: '12px 16px',
      panelGap: '8px',
      panelBorderWidth: '1px',
      buttonPadding: '6px 12px',
      buttonPaddingSm: '4px 8px',
      buttonPaddingLg: '10px 20px',
      inputPadding: '8px 12px',
      modalPadding: '24px',
    },
    light: {
      background: '240 253 250',
      backgroundSecondary: '204 251 241',
      foreground: '17 94 89',
      secondary: '15 118 110',
      muted: '45 148 136',
      accent: '20 184 166',
      accentForeground: '255 255 255',
      border: '153 246 228',
      card: '236 254 255',
      destructive: '220 38 38',
      success: '16 185 129',
      warning: '217 119 6',
    },
    dark: {
      background: '15 23 25',
      backgroundSecondary: '17 33 35',
      foreground: '204 251 241',
      secondary: '94 234 212',
      muted: '45 148 136',
      accent: '45 212 191',
      accentForeground: '15 23 25',
      border: '30 58 62',
      card: '17 33 35',
      destructive: '248 113 113',
      success: '52 211 153',
      warning: '251 191 36',
    },
  },

  // Monochrome - Minimal black, white, and grays
  monochrome: {
    id: 'monochrome',
    name: 'Monochrome',
    description: 'Minimal and focused with pure black, white, and grays',
    typography: {
      fontSans: '"SF Pro Text", -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
      fontMono: '"SF Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: '13px',
      lineHeight: '1.5',
    },
    radii: {
      sm: '2px',
      md: '4px',
      lg: '6px',
      xl: '8px',
      '2xl': '12px',
      full: '9999px',
    },
    shadows: {
      xs: '0 1px 0 rgba(0, 0, 0, 0.05)',
      sm: '0 1px 2px rgba(0, 0, 0, 0.08)',
      md: '0 2px 4px rgba(0, 0, 0, 0.10)',
      lg: '0 4px 8px rgba(0, 0, 0, 0.12)',
    },
    layout: {
      panelHeaderHeight: '30px',
      panelPadding: '12px',
      panelTitlePadding: '10px 12px',
      panelGap: '4px',
      panelBorderWidth: '1px',
      buttonPadding: '5px 10px',
      buttonPaddingSm: '3px 6px',
      buttonPaddingLg: '8px 16px',
      inputPadding: '6px 10px',
      modalPadding: '20px',
    },
    light: {
      background: '255 255 255',
      backgroundSecondary: '250 250 250',
      foreground: '0 0 0',
      secondary: '82 82 82',
      muted: '163 163 163',
      accent: '0 0 0',
      accentForeground: '255 255 255',
      border: '229 229 229',
      card: '245 245 245',
      destructive: '220 38 38',
      success: '34 197 94',
      warning: '234 179 8',
    },
    dark: {
      background: '0 0 0',
      backgroundSecondary: '23 23 23',
      foreground: '255 255 255',
      secondary: '163 163 163',
      muted: '115 115 115',
      accent: '255 255 255',
      accentForeground: '0 0 0',
      border: '38 38 38',
      card: '23 23 23',
      destructive: '248 113 113',
      success: '74 222 128',
      warning: '250 204 21',
    },
  },
};

// Helper to get a list of available themes for UI
export function getThemeList(): Array<{ id: ThemeId; name: string; description: string }> {
  return Object.values(themes).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
  }));
}

// Get a specific theme definition
export function getTheme(id: ThemeId): ThemeDefinition {
  return themes[id] || themes.ideate;
}

// Generate CSS custom properties for a theme
export function generateThemeCSSVars(theme: ThemeDefinition, mode: 'light' | 'dark'): Record<string, string> {
  const colors = mode === 'dark' ? theme.dark : theme.light;
  
  return {
    // Colors
    '--background': colors.background,
    '--background-secondary': colors.backgroundSecondary,
    '--foreground': colors.foreground,
    '--secondary': colors.secondary,
    '--muted': colors.muted,
    '--accent': colors.accent,
    '--accent-foreground': colors.accentForeground,
    '--border': colors.border,
    '--card': colors.card,
    '--destructive': colors.destructive,
    '--success': colors.success,
    '--warning': colors.warning,
    
    // Typography
    '--font-sans': theme.typography.fontSans,
    '--font-mono': theme.typography.fontMono,
    '--font-size-base': theme.typography.fontSize,
    '--line-height-base': theme.typography.lineHeight,
    
    // Radii
    '--radius-sm': theme.radii.sm,
    '--radius-md': theme.radii.md,
    '--radius-lg': theme.radii.lg,
    '--radius-xl': theme.radii.xl,
    '--radius-2xl': theme.radii['2xl'],
    '--radius-full': theme.radii.full,
    
    // Shadows
    '--shadow-xs': theme.shadows.xs,
    '--shadow-sm': theme.shadows.sm,
    '--shadow-md': theme.shadows.md,
    '--shadow-lg': theme.shadows.lg,
    
    // Layout
    '--panel-header-height': theme.layout.panelHeaderHeight,
    '--panel-padding': theme.layout.panelPadding,
    '--panel-title-padding': theme.layout.panelTitlePadding,
    '--panel-gap': theme.layout.panelGap,
    '--panel-border-width': theme.layout.panelBorderWidth,
    '--button-padding': theme.layout.buttonPadding,
    '--button-padding-sm': theme.layout.buttonPaddingSm,
    '--button-padding-lg': theme.layout.buttonPaddingLg,
    '--input-padding': theme.layout.inputPadding,
    '--modal-padding': theme.layout.modalPadding,
  };
}

// Apply theme to the document
export function applyThemeToDocument(themeId: ThemeId, mode: 'light' | 'dark'): void {
  const theme = getTheme(themeId);
  const vars = generateThemeCSSVars(theme, mode);
  const root = document.documentElement;
  
  // Apply all CSS custom properties
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
  
  // Set data attribute for debugging and potential CSS selectors
  root.setAttribute('data-theme', themeId);
  root.setAttribute('data-mode', mode);
  
  // Update class for light/dark mode
  root.classList.remove('light', 'dark');
  root.classList.add(mode);
}
