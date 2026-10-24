// Small display formatters shared by the report / notification screens.

/** "suspected_illegal_contents" → "Suspected illegal contents" */
export const humanize = value => {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  return String(value)
    .replace(/[_.]/g, ' ')
    .replace(/([a-z])([A-Z])/g, (_, a, b) => `${a} ${b.toLowerCase()}`)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, c => c.toUpperCase());
};

/** Parse an API timestamp; null for empty / Go zero time / garbage. */
export const parseDate = value => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() <= 1) {
    return null;
  }
  return date;
};

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const pad = n => String(n).padStart(2, '0');

/** "23 Oct 2026, 14:05" (device local time), or '' when empty. */
export const formatDateTime = value => {
  const date = parseDate(value);
  if (!date) {
    return '';
  }
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

/** "23 Oct 2026" */
export const formatDate = value => {
  const date = parseDate(value);
  if (!date) {
    return '';
  }
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
};

/** "just now", "5m ago", "3h ago", "2d ago", else a date. Future → "in 3h". */
export const formatRelative = (value, now = Date.now()) => {
  const date = parseDate(value);
  if (!date) {
    return '';
  }
  const diff = now - date.getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;
  const wrap = text => (future ? `in ${text}` : `${text} ago`);
  if (abs < 60 * 1000) {
    return future ? 'in <1m' : 'just now';
  }
  if (abs < 60 * 60 * 1000) {
    return wrap(`${Math.floor(abs / 60000)}m`);
  }
  if (abs < 24 * 60 * 60 * 1000) {
    return wrap(`${Math.floor(abs / 3600000)}h`);
  }
  if (abs < 7 * 24 * 60 * 60 * 1000) {
    return wrap(`${Math.floor(abs / 86400000)}d`);
  }
  return formatDate(value);
};

/** ₹1,234.5 — '' for null/undefined/non-numeric. */
export const formatCurrency = value => {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) {
    return '';
  }
  return `₹${n.toLocaleString('en-IN', {maximumFractionDigits: 2})}`;
};

/** Location {address, lat, lng} → a readable line. */
export const formatLocation = location => {
  if (!location) {
    return '';
  }
  if (location.address) {
    return location.address;
  }
  if (Number.isFinite(location.lat) && Number.isFinite(location.lng)) {
    return `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;
  }
  return '';
};

/** Yes / No for booleans; '' for null/undefined. */
export const formatYesNo = value =>
  value === null || value === undefined ? '' : value ? 'Yes' : 'No';
