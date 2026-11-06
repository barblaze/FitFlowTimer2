let sentinel = null;

export function isWakeLockSupported() {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

export async function requestWakeLock(enabled) {
  if (!enabled || !isWakeLockSupported()) return false;
  try {
    if (sentinel) return true;
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; });
    return true;
  } catch {
    sentinel = null;
    return false;
  }
}

export async function releaseWakeLock() {
  try {
    if (sentinel) await sentinel.release();
  } catch {}
  sentinel = null;
}

export function setupWakeLockAutoReacquire(getEnabled) {
  const onVis = async () => {
    if (document.visibilityState === 'visible' && getEnabled && getEnabled()) {
      await requestWakeLock(true);
    }
  };
  document.addEventListener('visibilitychange', onVis);
  return () => document.removeEventListener('visibilitychange', onVis);
}
