import { useMemo } from 'react';
export function usePlatform() {
  const platform = useMemo(() => {
    if (typeof window === 'undefined') return { isLinux: false, isMac: false, isWindows: false, isAndroid: false };
    const ua = window.navigator.userAgent.toLowerCase();
    const plat = window.navigator.platform.toLowerCase();
    const isAndroid = ua.includes('android');
    const isLinux = !isAndroid && (plat.includes('linux') || ua.includes('linux'));
    const isMac = !isAndroid && (plat.includes('mac') || ua.includes('mac'));
    const isWindows = !isAndroid && (plat.includes('win') || ua.includes('win'));
    return { isLinux, isMac, isWindows, isAndroid };
  }, []);

  return platform;
}
