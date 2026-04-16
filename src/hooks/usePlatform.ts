import { useMemo } from 'react';
export function usePlatform() {
  const platform = useMemo(() => {
    if (typeof window === 'undefined') return { isLinux: false, isMac: false, isWindows: false };
    const ua = window.navigator.userAgent.toLowerCase();
    const plat = window.navigator.platform.toLowerCase();
    const isLinux = plat.includes('linux') || ua.includes('linux');
    const isMac = plat.includes('mac') || ua.includes('mac');
    const isWindows = plat.includes('win') || ua.includes('win');
    return { isLinux, isMac, isWindows };
  }, []);

  return platform;
}
