/**
 * Touch optimization utilities for mobile performance
 * Prevents double-tap zoom, optimizes scroll, and handles active states
 */

export function enableTouchOptimization() {
  // Disable double-tap zoom on interactive elements
  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (event) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        event.preventDefault();
      }
      lastTouchEnd = now;
    },
    false
  );

  // Optimize scroll performance with passive listeners
  document.addEventListener('touchmove', () => {}, { passive: true });
  document.addEventListener('touchstart', () => {}, { passive: true });

  // Enable manipulation on all interactive elements
  document.documentElement.style.touchAction = 'manipulation';

  // Prevent zoom on input focus (iOS)
  document.addEventListener('touchstart', (e) => {
    const target = e.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
      target.style.fontSize = '16px';
    }
  });
}

export function handleActiveElement() {
  // Remove active state after touch ends to prevent sticky states
  document.addEventListener('touchend', () => {
    (document.activeElement as HTMLElement).blur?.();
  });
}

/**
 * Debounce function for performance-critical handlers
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function for scroll and resize events
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return function (...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}