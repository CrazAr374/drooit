import type { DeviceInfo } from '@shared/types.js';

const DEVICE_NAME_KEY = 'drooit-device-name';

export function getPlatform(): string {
  if (typeof navigator === 'undefined') return 'Web';
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Desktop';
}

export function getBrowser(): string {
  if (typeof navigator === 'undefined') return 'Browser';
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/OPR\//.test(ua) || /Opera/.test(ua)) return 'Opera';
  return 'Browser';
}

export function getDefaultDeviceName(): string {
  const platform = getPlatform();
  const browser = getBrowser();
  if (platform === 'macOS') return `Mac (${browser})`;
  if (platform === 'Windows') return `Windows PC (${browser})`;
  if (platform === 'iOS') return 'iPhone / iPad';
  if (platform === 'Android') return 'Android Device';
  if (platform === 'Linux') return `Linux (${browser})`;
  return `${platform} (${browser})`;
}

export function getStoredDeviceName(): string {
  if (typeof localStorage === 'undefined') return getDefaultDeviceName();
  try {
    const saved = localStorage.getItem(DEVICE_NAME_KEY);
    if (saved && saved.trim()) return saved.trim().slice(0, 80);
  } catch {
    // Ignore localStorage access failures
  }
  return getDefaultDeviceName();
}

export function saveDeviceName(name: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DEVICE_NAME_KEY, name.trim().slice(0, 80));
  } catch {
    // Ignore localStorage access failures
  }
}

export function getLocalDeviceInfo(): DeviceInfo {
  return {
    name: getStoredDeviceName(),
    platform: getPlatform(),
    browser: getBrowser(),
  };
}
