import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.spotly.app',
  appName: 'Spotly',
  webDir: 'dist/public',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#0d9488',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#0d9488',
    },
    App: {
      // Prevent app from being killed
      allowMultipleWindows: false,
    },
  },
  ios: {
    contentInset: 'automatic',
    scheme: 'spotly',
  },
  android: {
    allowMixedContent: false,
    minSdkVersion: 24,
    targetSdkVersion: 34,
  },
};

export default config;