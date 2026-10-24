// Trickle app theme — sampled from the coral, black, salmon, and cream reference.
const colors = {
  // Base
  background: '#f47752',
  surface: '#0d0d0d',
  surfaceMuted: '#ee7451',
  white: '#9f9999',

  // Text
  ink: '#0d0d0d',
  muted: '#6e2f25',
  faint: '#b54835',
  onDark: '#f8e4b5',

  // Primary coral and salmon
  orange: '#c13e3e',
  orangeDeep: '#0d0d0d',
  orangeLight: '#f8e4b5',
  orangeSurface: '#ee7451',
  orangeBorder: '#c6523c',

  // Accents
  coral: '#f47752',
  coralDark: '#b54835',
  coralSurface: '#ee7451',
  gold: '#f8e4b5',
  goldSurface: '#f8e4b5',

  // Lines & inputs
  border: '#34302d',
  borderStrong: '#ee7451',
  inputBorder: '#ee7451',
  inputFocus: '#f8e4b5',
  inputBg: '#0d0d0d',

  // Status
  success: '#f8e4b5',
  successSurface: '#b54835',
  warning: '#f8e4b5',
  warningSurface: '#b54835',
  danger: '#f8e4b5',
  dangerSurface: '#b54835',
  errorSurface: '#b54835',

  // Back-compat alias
  primary: '#0d0d0d',
};

export default colors;

// ---------------------------------------------------------------------------
// Palette split (deliberate — mirrors how the consumer app actually behaves):
//
//   • `colors` (default export, above) — the BRANDED CHROME palette, copied
//     verbatim from the consumer app. Use it only for brand surfaces: Splash,
//     Login, and other full-bleed brand moments.
//   • `workhorse` (named export, below) — the light neutral palette for dense
//     data screens (reports list/detail, user/request views). The consumer app
//     uses these same hex values ad hoc per screen (e.g. Requests/index.js);
//     here they are a single named source of truth.
// ---------------------------------------------------------------------------
export const workhorse = {
  // Surfaces
  background: '#FFF7F0',
  surface: '#FFFFFF',
  surfaceMuted: '#FFF0E6',

  // Text
  ink: '#173B4D',
  inkSoft: '#3D6170',
  secondary: '#6C5360',
  muted: '#52606D',

  // Lines
  border: '#F1D8C8',
  divider: '#F7E5D9',

  // Accents / status
  success: '#168A73',
  successSurface: '#DDF7EE',
  successInk: '#09624F',
  warning: '#D98216',
  warningSurface: '#FFF0C7',
  warningInk: '#7A4A00',
  danger: '#D9574D',
  dangerDeep: '#A83B35',
  dangerSurface: '#FCE4DF',
  info: '#2878A6',
  infoSurface: '#DDF2FC',
  neutralSurface: '#F3E8E4',
  neutralInk: '#735F6B',
};
