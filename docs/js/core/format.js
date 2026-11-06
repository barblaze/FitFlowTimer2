export function formatMinSec(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
}

export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  }
  return formatMinSec(s);
}

export function splitSeconds(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  return { minutes: Math.floor(s / 60), seconds: s % 60 };
}

export function toSeconds(minutes, seconds) {
  return Math.max(0, (Math.floor(Number(minutes) || 0) * 60) + Math.floor(Number(seconds) || 0));
}

export function parseMinSec(value) {
  if (value == null) return null;
  const v = String(value).trim();
  if (!v) return null;
  if (/^\d+$/.test(v)) return parseInt(v, 10);
  const m = v.match(/^(\d+):([0-5]?\d)$/);
  if (!m) return null;
  return (parseInt(m[1], 10) * 60) + parseInt(m[2], 10);
}

export function formatDurationLabel(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m > 0 && sec > 0) return `${m} min ${sec} s`;
  if (m > 0) return `${m} min`;
  return `${sec} s`;
}
