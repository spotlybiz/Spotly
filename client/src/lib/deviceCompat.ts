export const deviceCompat = {
  // iOS 13+ support for backdrop filter
  supportsBackdropFilter: () => CSS.supports('backdrop-filter', 'blur(1px)'),
  
  // Safe area insets for notch/dynamic island devices
  getSafeAreaInsets() {
    const root = document.documentElement;
    return {
      top: parseFloat(getComputedStyle(root).getPropertyValue('--sat')) || 0,
      left: parseFloat(getComputedStyle(root).getPropertyValue('--sal')) || 0,
      bottom: parseFloat(getComputedStyle(root).getPropertyValue('--sab')) || 0,
      right: parseFloat(getComputedStyle(root).getPropertyValue('--sar')) || 0,
    };
  },

  // Vibration API support for haptic feedback
  vibrate(pattern: number | number[]) {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  },

  // Check if device is in dark mode
  isDarkMode: () => window.matchMedia('(prefers-color-scheme: dark)').matches,

  // Check if reduced motion is preferred
  prefersReducedMotion: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,

  // Get device pixel ratio for high-DPI screens
  getPixelRatio: () => window.devicePixelRatio || 1,

  // Check connection status
  isOnline: () => navigator.onLine,

  // Get battery status if available
  async getBatteryStatus() {
    try {
      return await (navigator as any).getBattery?.();
    } catch {
      return null;
    }
  },

  // Check if running in Capacitor (native app)
  isNativeApp: () => !!(window as any).Capacitor,
};

// Add to window for global access
declare global {
  interface Window {
    spotlyDeviceCompat: typeof deviceCompat;
  }
}
window.spotlyDeviceCompat = deviceCompat;