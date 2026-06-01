# Design Guidelines: Local Discovery Events App

## Design Approach
**Reference-Based Strategy**: Drawing from Airbnb's discovery experience, Google Maps' spatial interface, and Eventbrite's event presentation. The design prioritizes immersive exploration with map-first navigation and quick event discovery.

## Layout Architecture

**Map-Centric Structure**:
- Map occupies 60-70% of viewport on mobile (full-width), with event details sliding up from bottom
- Desktop: Split view with map (60%) and event list sidebar (40%)
- Spacing system: Tailwind units of **2, 4, 6, and 8** (p-2, p-4, p-6, p-8, gap-4, etc.)

**Component Hierarchy**:
1. Fixed map container with floating search/filter bar
2. Bottom sheet/sidebar for event cards (dismissible)
3. Floating action button for "Add Event" (bottom-right, always visible)

## Typography

**Font Stack**: 
- Primary: Inter (Google Fonts) - clean, modern, excellent mobile readability
- Accent: Manrope (Google Fonts) - event titles and headers

**Scale**:
- Hero/Event Title: text-2xl md:text-3xl, font-bold
- Section Headers: text-lg md:text-xl, font-semibold
- Body Text: text-sm md:text-base
- Labels/Meta: text-xs uppercase tracking-wide

## Core Components

**Map Interface**:
- Full-bleed map with custom marker clusters (use Mapbox GL JS)
- Floating search bar at top (rounded-full, shadow-lg, backdrop-blur)
- Category filter chips below search (horizontal scroll on mobile, flex-wrap on desktop)
- User location marker with pulsing ring animation

**Event Cards**:
- Rounded-2xl cards with 4:3 aspect ratio hero image
- Image overlay gradient for text readability
- Card content: Event image → Category badge (top-left) → Title → Date/Time icon + text → Distance badge → Quick "Directions" CTA
- Stacked vertically in bottom sheet with gap-4
- Card hover: subtle lift (translate-y-1) with shadow increase

**Filter Bar**:
- Pill-shaped category buttons (rounded-full, px-4 py-2)
- Active state: filled background vs outline for inactive
- Horizontal scroll container with flex nowrap
- Icons from Heroicons (map-pin, calendar, truck, music-note, shopping-bag)

**Event Detail View** (Modal/Full Sheet):
- Large hero image (16:9 ratio, object-cover)
- Image carousel if multiple photos (swipeable dots indicator)
- Sticky header with back button and share icon
- Content sections: Title → Organizer info → Description → Date/Time/Location grid → Large "Get Directions" button (w-full, rounded-xl, py-4)
- Contact button as secondary action

**Add Event Form**:
- Full-screen modal on mobile, centered modal on desktop (max-w-2xl)
- Single-column form with generous spacing (space-y-6)
- Image upload zone: dashed border, centered upload icon, drag-and-drop
- Address field with autocomplete suggestions dropdown
- Category selector as button grid (3 columns on mobile)
- Date/time pickers with calendar icon prefix
- Submit button: full-width on mobile, auto on desktop

## Navigation & Structure

**Mobile Navigation**:
- Bottom tab bar: Map (home), Search, Add (+), Saved, Profile
- Fixed positioning with safe-area padding
- Active state: icon fill + subtle background

**Desktop Header**:
- Sticky top bar with logo (left), search (center, max-w-xl), Add Event + User menu (right)
- Height: h-16
- Shadow on scroll

## Images

**Hero/Featured Images**:
- Event cards: Required for visual browsing, 4:3 ratio, optimized WebP
- Event detail: Large 16:9 hero image, supports galleries
- Map markers: Custom SVG icons per category (food truck, performer, market icons)
- Empty states: Illustration for "no events found" (centered, max-w-sm)

**Image Specifications**:
- Event thumbnails: 600x450px
- Event detail hero: 1200x675px
- Compress with quality: 85
- Lazy loading for off-screen images

## Responsive Breakpoints

- Mobile: < 768px (single column, bottom sheet)
- Tablet: 768px - 1024px (map 50%, list 50% side-by-side)
- Desktop: > 1024px (map 60%, list sidebar 40%)

## Interaction Patterns

**Map Interactions**:
- Tap marker → show event preview card (small)
- Tap preview → open full event detail
- Pinch zoom, drag to pan (native map controls)
- Re-center button (floating, bottom-left of map)

**Event Discovery Flow**:
- Default: Show all events within 25 miles
- Filter chips update map markers in real-time
- Search autocomplete appears after 2 characters
- Distance updates dynamically as user moves map

**Micro-interactions** (Minimal):
- Marker bounce on select
- Card slide-in from bottom (300ms ease-out)
- Loading skeleton for event cards
- Success checkmark on event submission

## Performance Considerations

- Lazy load event cards as user scrolls
- Implement map marker clustering (zoom threshold: 12)
- Optimize images: WebP format, responsive srcset
- Cache geocoding results
- Debounce search input (300ms)

## Accessibility

- Focus visible states on all interactive elements
- ARIA labels for map markers and icon buttons
- Color contrast ratio 4.5:1 minimum
- Keyboard navigation for filters and forms
- Alt text for all event images