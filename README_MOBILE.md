# Spotly Mobile App - Capacitor Build Guide

## Overview
Spotly is a hybrid mobile app built with Capacitor, wrapping the existing Vite + React web app into native iOS and Android containers. It provides real native functionality including push notifications, offline mode, haptic feedback, secure storage, and deep linking.

## Prerequisites
- Node.js 18+
- Xcode 15+ (for iOS)
- Android Studio (for Android)
- CocoaPods (for iOS: `sudo gem install cocoapods`)
- A Firebase project with Cloud Messaging enabled (for push notifications)

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Build the Web App
```bash
npm run build
```

### 3. Add Native Platforms
```bash
npx cap add ios
npx cap add android
```

### 4. Sync Web Assets to Native Projects
```bash
npx cap sync
```

### 5. Configure Push Notifications

#### iOS (APNs)
1. In Xcode, enable "Push Notifications" capability for the Spotly target
2. Enable "Background Modes" > "Remote notifications"
3. Generate an APNs key in Apple Developer portal
4. Upload the APNs key to your Firebase project (Project Settings > Cloud Messaging)

#### Android (FCM)
1. Create a Firebase project at https://console.firebase.google.com
2. Add an Android app with package name `com.spotly.app`
3. Download `google-services.json` and place it in `android/app/`
4. The Capacitor Push Notifications plugin handles the rest

### 6. Open Native Projects
```bash
npx cap open ios      # Opens Xcode
npx cap open android  # Opens Android Studio
```

## Development Workflow

### Live Reload (Development)
For live reload during development, update `capacitor.config.ts`:
```typescript
server: {
  url: 'http://YOUR_LOCAL_IP:5000',
  cleartext: true, // Android only
}
```
Then run:
```bash
npm run dev          # Start the web server
npx cap run ios      # Run on iOS simulator
npx cap run android  # Run on Android emulator
```

### Production Build
```bash
npm run build        # Build web assets
npx cap sync         # Sync to native projects
npx cap open ios     # Archive in Xcode
npx cap open android # Build AAB in Android Studio
```

## Architecture

### Native Services (`client/src/lib/native/`)
| Module | Description |
|--------|-------------|
| `capacitor.ts` | Platform detection (isNative, isIOS, isAndroid) |
| `haptics.ts` | Haptic feedback (impact, notification, selection) |
| `network.ts` | Network status monitoring with listeners |
| `secure-storage.ts` | Secure token storage (Keychain on iOS, Keystore on Android) |
| `push-notifications.ts` | FCM push notification registration and handling |
| `deep-links.ts` | Universal/deep link handling (spotly:// scheme) |
| `offline-cache.ts` | IndexedDB offline cache with mutation queue |
| `index.ts` | Barrel export for all native modules |

### Offline Mode
- Events are cached in IndexedDB for offline viewing
- User actions while offline are queued and replayed when connection restores
- An OfflineBanner component shows connection status

### Privacy & Compliance
- `/privacy` - Privacy policy and data management
- `/terms` - Terms of service
- Data export (GDPR Article 15)
- Account deletion (GDPR Article 17)
- Consent tracking with IP and user-agent logging

## iOS Build for App Store

### 1. Configure Signing
1. Open `ios/App/App.xcworkspace` in Xcode
2. Select the "App" target
3. Under "Signing & Capabilities", select your team
4. Set Bundle Identifier to `com.spotly.app`

### 2. Set Version and Build Number
Update in Xcode under General > Identity:
- Version: 1.0.0
- Build: 1

### 3. Create Archive
1. Select "Any iOS Device" as build destination
2. Product > Archive
3. In Organizer, click "Distribute App"
4. Choose "App Store Connect"
5. Upload

### 4. App Store Connect
1. Create a new app in App Store Connect
2. Fill in metadata, screenshots, and description
3. Submit for review

## Android Build for Play Store

### 1. Configure Signing
Create a keystore:
```bash
keytool -genkey -v -keystore spotly-release.keystore -alias spotly -keyalg RSA -keysize 2048 -validity 10000
```

Add to `android/app/build.gradle`:
```groovy
signingConfigs {
    release {
        storeFile file('spotly-release.keystore')
        storePassword 'your-store-password'
        keyAlias 'spotly'
        keyPassword 'your-key-password'
    }
}
```

### 2. Build AAB
```bash
cd android
./gradlew bundleRelease
```
The AAB will be at `android/app/build/outputs/bundle/release/app-release.aab`

### 3. Play Console
1. Create a new app in Google Play Console
2. Upload the AAB to Internal Testing first
3. Complete store listing, content rating, and privacy policy
4. Submit for review

## Troubleshooting

### iOS: Push notifications not working
- Verify APNs key is uploaded to Firebase
- Ensure Push Notifications capability is enabled in Xcode
- Check that the provisioning profile includes push notifications

### Android: Build failures
- Ensure `google-services.json` is in `android/app/`
- Run `npx cap sync` after any web changes
- Check Android SDK version matches `build.gradle`

### Offline mode issues
- Clear IndexedDB in browser dev tools to reset cache
- Check Network tab for mutation queue status
