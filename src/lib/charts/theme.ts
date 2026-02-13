/**
 * Chart color palette aligned with the Nordic Ledger dark theme.
 */

// Semantic colors — muted palette for a minimal dark-theme look
export const CHART_COLORS = {
  // Primary gold accent
  gold: '#bfa458',
  goldMuted: '#988844',

  // Semantic: positive / negative (desaturated)
  green: '#4a9968',
  greenLight: '#5aaa78',
  red: '#bd5c55',
  redLight: '#cc6e68',

  // Amber for warnings / neutral
  amber: '#b09040',

  // Subtotal / highlight
  blue: '#5a8dba',
  blueMuted: '#4a78a0',

  // Category palette for multi-segment charts
  category: [
    '#bfa458', // gold
    '#5a8dba', // blue
    '#4a9968', // green
    '#bd5c55', // red
    '#9085b8', // violet
    '#c89830', // amber
    '#3aa0b0', // cyan
    '#b06888', // pink
  ],

  // Balance composition specific
  assets: {
    fixedAssets: '#5a8dba',
    inventory: '#9085b8',
    receivables: '#bfa458',
    cash: '#4a9968',
    otherCurrent: '#7d8896',
  },
  financing: {
    equity: '#4a9968',
    longTermLiabilities: '#bfa458',
    currentLiabilities: '#bd5c55',
  },

  // Capital donut
  capital: {
    equity: '#4a9968',
    interestBearingDebt: '#bd5c55',
    otherLiabilities: '#7d8896',
  },

  // Grid and axes
  grid: '#1e293b',
  axis: '#7d8896',

  // Tooltip
  tooltipBg: '#141c2b',
  tooltipBorder: '#1e293b',
  tooltipText: '#eee9df',
  tooltipMuted: '#7d8896',
} as const;
