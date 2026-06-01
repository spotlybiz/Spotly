# Spotly - Local Discovery App

## Overview
Spotly is a map-based local discovery application connecting users with nearby events like popup markets, food trucks, and local happenings. Built with React/Vite for the web client with a Node.js/Express backend, the app uses Mapbox GL JS exclusively for all mapping, geocoding, routing, and search — with GPS tracking, heading-up navigation, and community engagement features.

## User Preferences
My preferences are as follows:

*   I prefer detailed explanations of proposed changes.
*   Please ask for confirmation before implementing major changes to the codebase or architecture.
*   I value iterative development, so propose small, manageable steps.
*   I expect code to be clean, well-commented, and follow best practices for React, TypeScript, and Node.js.
*   Do not make changes to files in the `shared/` directory unless explicitly instructed, as these are shared schemas.
*   Focus on delivering high-quality, performant solutions, especially for map interactions and data loading.
*   Ensure all new features are fully responsive and work seamlessly across web and mobile platforms where applicable.
*   Prioritize security best practices, particularly concerning user authentication and data handling.

## System Architecture

### UI/UX Design
The app uses a 5-tab bottom navigation: Discover (compass), Community (people), Add (+, floating gradient button), Settings (gear), Profile (person). The application employs a modern design language with a vibrant green gradient accent color (#16a34a to #059669). Key visual elements:
- **User Dot**: Green dot with heading direction cone, pulsing accuracy ring, white border with green glow shadow
- **Route Polylines**: Green gradient (#16a34a to #15803d) with dark outline, white chevron arrows, and gray traveled-portion distinction
- **Event Markers**: Category-colored pin markers with letter icons (F=Food, P=Performer, M=Market, etc.), white borders, stems and ground shadows
- **Destination Pin**: Green pin with white inner circle, stem and shadow
- **Navigation Bar**: Dark (#1B1B1B) maneuver card with green icon box, green ETA, speed badge, overview/end buttons
- **Route Preview Sheet**: Clean white sheet with green destination icon, stats row, step list, green "Start" button
- **Recenter Button**: White circle with green navigate icon

### Technical Implementation
Spotly is a web app with a REST API backend.

- **Web Client**: React + Vite with Mapbox GL JS (mapbox-gl) for maps
- **Backend**: Node.js + Express API server with CORS enabled
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: JWT-based authentication with `bcrypt` for password hashing
- **Mapping**: Mapbox GL JS, Mapbox Geocoding API v5, Mapbox Directions API v5
- **Sensor Fusion Engine** (`client/src/hooks/useSensorFusion.ts`):
    - **Extended Kalman Filter** (`client/src/lib/ekf.ts`): 5-state EKF (lat, lng, vN, vE, heading) fusing GPS + accelerometer + gyroscope + magnetometer
    - **Pedestrian Dead Reckoning** (`client/src/lib/pdr.ts`): Step detection from accelerometer peaks, stride estimation from cadence/magnitude, heading-based position propagation between GPS gaps
    - **Activity Classification** (`client/src/lib/activityClassifier.ts`): Accelerometer variance + frequency analysis → stationary/walking/running/cycling/driving with hysteresis transitions
    - **Heading Fusion** (`client/src/lib/headingFusion.ts`): Tilt-compensated compass, gyroscope integration with drift correction, GPS heading at speed, magnetic anomaly detection, complementary filter
    - **Motion-Triggered GPS**: Accelerometer detects phone movement → wakes GPS; stationary → GPS sleeps to save battery
    - **Stationary Anchor Lock**: Anchor-based position lock with hysteresis (4m lock / 7m unlock) prevents jitter when standing still
    - **Data Flow**: Raw GPS + DeviceMotion + DeviceOrientation → useSensorFusion → fusedLocation (used by ALL components, including non-navigation map)
- **Navigation**: In-app navigation using browser Geolocation API and Mapbox Directions API (driving-traffic profile):
    - **Location Engine**: High-accuracy GPS, 1-second updates, fused with sensor data
    - **Heading Engine**: Multi-source heading fusion (compass + gyro + GPS bearing)
    - **Route Snapping**: Smooth interpolation when locking to route path
    - **Progress Tracking**: Real-time polyline trimming as route is traveled
    - **Instant Rerouting**: Google Maps-style automatic rerouting when user goes off-route (30m threshold, 3s cooldown)
    - **Camera System**: Device-heading-first bearing priority (compass/gyro → GPS heading → route bearing fallback), unified mode via useCameraState (NAVIGATION_FOLLOW/BROWSE_FOLLOW/ASSISTED_FREE/PREVIEW), LERP interpolation with wraparound
    - **60fps RAF Loop**: Navigation dot + camera updated at 60fps via requestAnimationFrame reading from useSmoothedDot's renderedPositionRef (bypasses React state bottleneck). Browse mode uses React state-driven updates.
    - **Smoothing**: Speed-adaptive location smoothing (0.5m min update distance, 500ms force interval, 150-450ms adaptive interpolation capped at 300ms for walking), stationary jitter lock with hysteresis. Camera LERP factor 0.5 (pre-smoothed input, no double-smoothing lag)

### Feature Specifications
- **Interactive Map**: Displays event markers, traffic, and road features; supports user location tracking and dynamic zoom.
- **Event Management**: Users can create, view, update, and delete categorized events.
- **Universal Search**: Google Maps-style full-screen search with debounced input, progressive loading, distance-based filtering, and result caching.
- **User Accounts**: Registration, login, email verification, and profile management for different user types.
- **Anti-Spam System**: Trust scores, event reporting, auto-hiding reported events, and rate limiting.
- **Settings Tab**: Dark mode, notification/sound/location toggles, support links, app info section.
- **Community Tab**: Activity feed with engagement (likes/comments/shares), trending events with ranking, nearby community highlights.
- **Profile Tab**: Teal gradient header, 4-stat grid (Created/Likes/Comments/Trust), sub-tabs (Overview/My Events/Settings), achievements, saved events, event management with delete.
- **Event Detail**: Hero image/placeholder area, engagement bar (like/comment), organizer profile card, mini map preview, Get Directions and Google Maps buttons.
- **Public Profiles**: Organizers have public profiles displaying trust scores, created events, and likes.
- **Real-time Profile Stats**: Immediate updates for user interaction statistics via cache invalidation.

## External Dependencies

- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Mapping Library**: Mapbox GL JS (`mapbox-gl`)
- **Geocoding API**: Mapbox Geocoding API v5 (forward + reverse)
- **Routing Engine**: Mapbox Directions API v5 (driving-traffic profile)
- **Mapbox Tokens**: `MAPBOX_ACCESS_TOKEN` (runtime API calls)
- **Email Service**: Nodemailer
- **State Management**: Zustand
- **Authentication**: JWT, bcrypt
- **Shared Schema**: TypeScript schema in `shared/schema.ts`

## Project Structure

- `client/` - React/Vite web client (main application)
- `client/src/lib/` - Core libraries (geoMath, routeUtils, sensor fusion engines)
- `client/src/lib/ekf.ts` - Extended Kalman Filter for sensor fusion
- `client/src/lib/pdr.ts` - Pedestrian Dead Reckoning (step detection + position propagation)
- `client/src/lib/activityClassifier.ts` - Activity type classification from accelerometer data
- `client/src/lib/headingFusion.ts` - Multi-sensor heading fusion with tilt compensation
- `client/src/hooks/useSensorFusion.ts` - Unified sensor fusion hook (EKF + PDR + activity + heading)
- `server/` - Express API backend
- `shared/` - Shared TypeScript schemas
