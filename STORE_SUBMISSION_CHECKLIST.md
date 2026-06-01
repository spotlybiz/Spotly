# App Store & Play Store Submission Checklist

## Native Functionality (Beyond WebView)
These features provide genuine native value and meet store review guidelines:

- [x] **Push Notifications** - FCM-based notifications for nearby events (Capacitor PushNotifications plugin)
- [x] **Haptic Feedback** - Native haptics for user interactions (Capacitor Haptics plugin)
- [x] **Offline Mode** - IndexedDB caching for offline event browsing with mutation queue
- [x] **Secure Storage** - JWT tokens stored in iOS Keychain / Android Keystore (Capacitor Preferences)
- [x] **Deep Linking** - spotly:// URL scheme for app navigation
- [x] **Network Monitoring** - Real-time connection status with automatic sync
- [x] **Safe Area Handling** - Proper notch/home indicator support via viewport-fit=cover

## Privacy & Compliance

### GDPR Compliance
- [x] Privacy policy accessible in-app at `/privacy`
- [x] Consent tracking with IP address and user-agent logging
- [x] Data export functionality (Article 15 - Right of Access)
- [x] Account deletion with cascading data removal (Article 17 - Right to Erasure)
- [x] Consent records stored with timestamps

### CCPA Compliance
- [x] "Do Not Sell" capability via privacy settings
- [x] Data export in machine-readable format (JSON)
- [x] Account deletion within required timeframe

### Apple App Store Requirements
- [x] Privacy policy URL provided
- [x] App Tracking Transparency compliance (no third-party tracking)
- [x] Account deletion capability (required since June 2022)
- [x] In-app data export
- [x] Terms of Service accessible at `/terms`

### Google Play Requirements
- [x] Privacy policy URL
- [x] Data safety section information prepared
- [x] Account deletion capability
- [x] Target API level compliance

## App Store Screenshots Needed
- [ ] iPhone 6.7" (1290 x 2796) - iPhone 15 Pro Max
- [ ] iPhone 6.5" (1284 x 2778) - iPhone 14 Plus
- [ ] iPhone 5.5" (1242 x 2208) - iPhone 8 Plus
- [ ] iPad Pro 12.9" (2048 x 2732) - if supporting iPad

## Play Store Screenshots Needed
- [ ] Phone (1080 x 1920 minimum)
- [ ] 7-inch tablet (if targeting)
- [ ] 10-inch tablet (if targeting)

## App Metadata

### App Store Connect
- [ ] App Name: Spotly
- [ ] Subtitle: Discover Local Events
- [ ] Category: Lifestyle or Social Networking
- [ ] Keywords: events, local, nearby, food trucks, popup, market, community
- [ ] Description (up to 4000 chars)
- [ ] Promotional text (up to 170 chars)
- [ ] What's New text
- [ ] Support URL
- [ ] Marketing URL
- [ ] Privacy Policy URL
- [ ] Age Rating: 4+ (no objectionable content)

### Google Play Console
- [ ] App Name: Spotly - Discover Local Events
- [ ] Short description (80 chars)
- [ ] Full description (4000 chars)
- [ ] Category: Social > Events
- [ ] Content rating questionnaire completed
- [ ] Privacy policy URL
- [ ] Data safety form completed
- [ ] Target audience: 13+

## Technical Pre-submission

### iOS
- [ ] Bundle ID: com.spotly.app
- [ ] Version: 1.0.0
- [ ] Build number: 1
- [ ] Signing certificate and provisioning profile configured
- [ ] Push notification entitlement enabled
- [ ] Background modes: Remote notifications enabled
- [ ] APNs key uploaded to Firebase
- [ ] App icons (1024x1024 for App Store, all sizes for app)
- [ ] Launch screen configured
- [ ] NSLocationWhenInUseUsageDescription set
- [ ] NSLocationAlwaysAndWhenInUseUsageDescription set (if needed)
- [ ] Info.plist URL schemes configured (spotly://)

### Android
- [ ] Package name: com.spotly.app
- [ ] Version code: 1
- [ ] Version name: 1.0.0
- [ ] Release keystore created and secured
- [ ] google-services.json placed in android/app/
- [ ] ProGuard/R8 configured for release builds
- [ ] App icons for all densities (mdpi through xxxhdpi)
- [ ] Adaptive icon configured
- [ ] AndroidManifest.xml permissions reviewed
- [ ] Target SDK meets Play Store requirements (API 34+)

## Testing Before Submission
- [ ] All features work on physical iOS device
- [ ] All features work on physical Android device
- [ ] Push notifications received on both platforms
- [ ] Offline mode works (airplane mode test)
- [ ] Deep links open correctly
- [ ] Account creation and deletion flow works
- [ ] Data export produces valid JSON
- [ ] Map loads and shows events
- [ ] Location permission prompt appears correctly
- [ ] App handles permission denial gracefully
- [ ] No crashes during 30-minute usage session
- [ ] Memory usage stays reasonable
- [ ] Battery usage is acceptable
