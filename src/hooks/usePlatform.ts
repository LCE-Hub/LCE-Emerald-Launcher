import { useMemo } from 'react';
export function usePlatform() {
  const platform = useMemo(() => {
    if (typeof window === 'undefined') return { isLinux: false, isMac: false, isWindows: false, isAndroid: false };
    const ua = window.navigator.userAgent.toLowerCase();
    const plat = window.navigator.platform.toLowerCase();
    const isLinux = plat.includes('linux') || ua.includes('linux');
    const isMac = plat.includes('mac') || ua.includes('mac');
    const isWindows = plat.includes('win') || ua.includes('win');
    const isAndroid = ua.includes('android');
    return { isLinux, isMac, isWindows, isAndroid };
  }, []);

  return platform;
}
