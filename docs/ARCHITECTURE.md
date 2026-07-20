# Manholes Mapper Architecture

High-level architecture of the Manholes Mapper platform.

---

## Overview

Manholes Mapper is a Progressive Web Application (PWA) for underground infrastructure mapping. Built with a modern JavaScript stack, it combines:

- **Vanilla JS + React 19** for frontend (progressive migration)
- **Vite 7** for build and dev server
- **Neon Postgres** for database and Better Auth
- **Capacitor** for Android native app
- **Three.js** for 3D visualization
- **Leaflet** for map tiles

**Key Design Principles:**
- Offline-first with hybrid IndexedDB + localStorage
- Survey-grade accuracy with RTK-GNSS integration
- Canvas-first network editor (no graph libraries)
- Multi-tenant SaaS with role-based access

---

## Frontend Architecture

```
frontend/
├── src/
│   ├── admin/              # Admin panel, settings, projects, input flow
│   │   ├── admin-settings.js       # Admin configuration UI
│   │   ├── admin-users.js          # User management
│   │   ├── admin-organizations.js  # Organization management
│   │   ├── admin-features.js       # Feature flags UI
│   │   ├── admin-statistics.js     # Stats dashboard
│   │   ├── admin-fixes.js          # Fix audit tools
│   │   ├── projects-settings.js    # Project CRUD UI
│   │   └── input-flow-settings.js  # Intelligent form logic settings
│   ├── auth/               # Better Auth client integration
│   │   ├── auth-client.js  # Better Auth client + sign-out
│   │   ├── auth-guard.js   # Route guards and session management
│   │   ├── auth-provider.jsx  # React auth provider
│   │   ├── csrf.js         # CSRF double-submit cookie
│   │   ├── permissions.js  # RBAC permissions service
│   │   └── sync-service.js # Background sync after auth
│   ├── canvas-fab-toolbar.js  # FAB speed dial (canvas navigation shortcuts)
│   ├── capacitor-api-proxy.js # fetch() proxy for Capacitor native (/api → production)
│   ├── cockpit/            # Gamification UI (NEW)
│   │   ├── cockpit.js      # Main cockpit controller
│   │   ├── action-rail.js  # Bottom action bar
│   │   ├── completion-engine.js  # Smart suggestions
│   │   ├── intel-strip.js  # Project health metrics
│   │   ├── quick-wins.js   # Context actions
│   │   └── session-tracker.js  # Session progress
│   ├── db.js               # IndexedDB database wrapper
│   ├── dom/                # DOM manipulation utilities
│   ├── features/           # Canvas rendering engine
│   │   ├── connection-suggest.js  # Z-aware auto-connect decision engine (wizard Phase 1)
│   │   ├── drawing-primitives.js  # Base shapes (house, badges)
│   │   ├── gradient-engine.js     # Live pipe-slope intelligence (invert/terrain gradients)
│   │   ├── measurement-rail.js    # Inline depth inputs
│   │   ├── node-icons.js          # Custom node icon system
│   │   └── rendering.js           # Main render loop
│   ├── field-commander/    # Mobile UI shell, gestures, territory, XP (NEW)
│   │   ├── fc-shell.js           # Field commander shell/frame
│   │   ├── fc-gestures.js        # Touch gesture handling
│   │   ├── fc-territory.js       # Zone-based assignment
│   │   ├── fc-xp.js              # XP accumulation
│   │   ├── fc-achievements.js    # Badge/achievement system
│   │   └── fc-panels.js          # Panel management
│   ├── field-stepper/      # Full-screen one-field-per-screen data-entry overlay
│   │   └── field-stepper.js      # Stepper flow + CONNECT screen (wizard Phase 1)
│   ├── gnss/               # GNSS/Live Measure module
│   │   ├── bluetooth-adapter.js          # Bluetooth SPP (Android)
│   │   ├── tmm-adapter.js                # Third-party NMEA adapter
│   │   ├── browser-location-adapter.js   # Browser geolocation fallback
│   │   ├── mock-adapter.js               # Mock for testing
│   │   ├── nmea-parser.js                # NMEA sentence parser
│   │   ├── gnss-state.js                 # State management
│   │   ├── gnss-marker.js                # Canvas marker rendering
│   │   ├── point-capture-dialog.js       # Point capture UI
│   │   ├── precision-measure.js          # Accuracy-gated measurement
│   │   ├── precision-measure-overlay.js  # Overlay UI
│   │   ├── index.js                      # Public module exports
│   │   └── connection-manager.js         # Unified connection interface
│   ├── graph/              # Graph ID helpers
│   │   └── id-utils.js     # Numeric ID detection, home internal ID generation
│   ├── i18n.js             # Internationalization (Hebrew/English)
│   ├── legacy/             # Core monolith (being modularized)
│   │   ├── main.js                 # Main legacy bootstrap
│   │   ├── canvas-draw.js          # Core canvas drawing logic
│   │   ├── graph-crud.js           # Node/edge CRUD operations
│   │   ├── pointer-handlers.js     # Canvas pointer event handlers
│   │   ├── details-panel.js        # Node/edge details sidebar
│   │   ├── toolbar-events.js       # Toolbar event wiring
│   │   ├── storage-manager.js      # Local data persistence
│   │   ├── coordinate-handlers.js  # ITM coordinate management
│   │   ├── shared-state.js         # Shared legacy state
│   │   └── legacy-import-loader.js # Pre-loads import dependencies
│   ├── layout/             # Responsive layout system
│   │   ├── layout-manager.js    # Central layout controller
│   │   ├── unified-sidebar.js   # Collapsible side panel
│   │   ├── unified-toolbar.js   # Top navigation bar
│   │   └── micro-status-bar.js  # GPS accuracy HUD badge + offline chip
│   ├── main-entry.js       # App bootstrap
│   ├── map/                # Map layer system
│   │   ├── annotation-layer.js    # Leaflet Geoman draw overlay (zones, polygons)
│   │   ├── govmap-layer.js        # GovMap (Israel government orthophoto) tile layer
│   │   ├── layers-config.js       # Layer configuration registry
│   │   ├── projections.js         # EPSG:2039 ITM ↔ WGS-84 via proj4
│   │   ├── reference-layers.js    # GIS overlay layers (sections, addresses, pipes)
│   │   ├── street-view.js         # Google Street View pegman widget
│   │   ├── tile-manager.js        # Tile layer lifecycle and switching
│   │   └── user-location.js       # Browser geolocation with ITM conversion
│   ├── menu/               # Responsive UI components
│   │   ├── menu-config.js  # Declarative menu/action configuration
│   │   ├── menu-events.js  # Event delegation and action routing
│   │   ├── command-menu.js # Cmd+K command palette
│   │   ├── header.js       # Top navigation header
│   │   └── action-bar.js   # Bottom toolbar
│   ├── notifications/      # Notification system
│   │   └── notification-bell.js # Notification bell UI
│   ├── pages/              # Page components
│   │   ├── leaderboard-page.js
│   │   ├── metadata-dashboard.js
│   │   ├── profile-page.js
│   │   └── project-stats-page.js
│   ├── project/            # Project canvas & issues (NEW)
│   │   ├── project-canvas-renderer.js  # City view
│   │   ├── project-canvas-state.js     # Canvas state
│   │   ├── sketch-side-panel.js        # Detail view
│   │   ├── sketch-issues.js            # Issue management
│   │   ├── fix-suggestions.js          # Smart fixes
│   │   ├── issue-highlight.js          # Navigation
│   │   ├── issue-nav-state.js          # State
│   │   ├── last-edit-tracker.js        # Edit history
│   │   ├── merge-mode.js               # Duplicate node merging
│   │   └── project-loading-overlay.js  # Loading overlay UI
│   ├── serviceWorker/      # Service Worker lifecycle
│   ├── state/              # Global state management
│   │   ├── app-state.js    # Core reactive state (get/set/subscribe)
│   │   ├── app-store.js    # Sketch store (nodes, edges, selections)
│   │   ├── constants.js    # Color palettes, enums
│   │   ├── persistence.js  # Auto-save logic
│   │   ├── event-bus.js    # Global event bus
│   │   └── skill-level.js  # Feature visibility by skill level
│   ├── survey/             # Survey mode (NEW)
│   │   ├── device-picker-dialog.js    # TSC3 selection
│   │   ├── survey-node-type-dialog.js  # Survey forms
│   │   ├── tsc3-bluetooth-adapter.js  # TSC3 Bluetooth
│   │   ├── tsc3-connection-manager.js  # TSC3 manager
│   │   ├── tsc3-parser.js            # TSC3 data parsing
│   │   └── tsc3-websocket-adapter.js  # TSC3 WebSocket
│   ├── three-d/            # 3D underground visualization
│   │   ├── three-d-scene.js            # Scene setup
│   │   ├── three-d-view.js            # Camera control
│   │   ├── three-d-camera-framing.js  # Frame manager
│   │   ├── three-d-fps-controls.js    # Input handling
│   │   ├── three-d-miniature.js      # Miniature mode
│   │   ├── three-d-joystick.js        # Virtual joystick
│   │   ├── three-d-materials.js      # Materials
│   │   └── three-d-issues.js          # Issue rendering
│   ├── types/              # TypeScript declarations
│   │   └── index.d.ts      # Shared ambient type declarations
│   ├── ui/                 # Small UI primitives
│   │   └── snackbar.js     # Stacking, actionable snackbar (claims window.showToast)
│   ├── utils/              # Shared utilities
│   │   ├── coordinates.js          # ITM/WGS84 transforms, BFS positioning, scale calc
│   │   ├── csv.js                  # CSV export/import for ArcGIS
│   │   ├── custom-select.js        # Custom dropdown select component
│   │   ├── encoding.js             # Text encoding helpers
│   │   ├── geometry.js             # Geometry helpers
│   │   ├── input-flow-engine.js    # Context-aware form rules (hide/disable/reset fields)
│   │   ├── label-collision.js      # Label overlap detection for canvas rendering
│   │   ├── legacy-import.js        # Legacy sketch + ITM CSV conversion
│   │   ├── measurement-history.js  # Append-only node.measurements history (unioned on sync conflicts)
│   │   ├── progressive-renderer.js # Progressive canvas rendering (lazy tiles)
│   │   ├── render-cache.js         # Canvas render cache for expensive draw calls
│   │   ├── render-perf.js          # Render performance instrumentation
│   │   ├── sketch-io.js            # Sketch serialization/deserialization
│   │   ├── spatial-grid.js         # Spatial lookup grid for fast hit-testing
│   │   ├── backup-manager.js       # Backup and restore
│   │   ├── floating-keyboard.js    # Custom numeric keyboard
│   │   ├── resizable-drawer.js     # Swipeable drawer
│   │   ├── toast.js                # Toast notification helper
│   │   └── device-perf.js          # Device performance detection
│   └── workers/            # Web Workers
│       ├── data-processor.worker.js  # Heavy data processing off the main thread
│       └── worker-manager.js         # Worker lifecycle + main-thread fallback
├── test-results/           # Playwright test reports
└── playwright-report/      # Test output
```

---

## Backend Architecture

Every resource is a **single `index.js` handler** — there are no per-resource `_lib/` folders and no dynamic `[id].js` files. `vercel.json` rewrites path params to query params (e.g. `/api/sketches/:id` → `/api/sketches?id=:id`), so handlers branch on `req.query.id` / method / `action`.

```
api/
├── auth/index.js           # Better Auth handler (sign-in/up/out, session)
├── features/index.js       # Feature flags per user/org
├── issue-comments/index.js # Issue comments, close/reopen, notifications
├── layers/index.js         # Project GeoJSON reference layers
├── organizations/index.js  # Organization CRUD
├── projects/index.js       # Project CRUD + duplicate
├── sketches/index.js       # Sketch CRUD + lock/unlock/refresh (30-min expiry)
├── stats/index.js          # Statistics (leaderboard, workload, metadata)
├── user-role/index.js      # Current user's role, permissions, features
├── users/index.js          # User management (role/org assignment)
├── health.js               # Health check (public, Edge runtime)
└── _lib/                   # Shared API library (flat)
    ├── auth.js             # verifyAuth(), parseBody(), header/cookie helpers
    ├── cors.js             # Origin resolution (Capacitor https://localhost allowed)
    ├── csrf.js             # CSRF double-submit protection helpers
    ├── db.js               # Neon Postgres client + all DB operations
    ├── error-handler.js    # Shared error responses
    ├── rate-limit.js       # Sliding-window per-IP rate limiting
    ├── schema.sql          # STALE reference schema (db.js initializeDatabase() is authoritative)
    └── validators.js       # Common validators (MAX_NODES, MAX_EDGES, UUIDs)
```

---

## Data Models

### Node
```typescript
{
  id: string;           // Unique node identifier
  x: number;            // Canvas X coordinate (ITM)
  y: number;            // Canvas Y coordinate (ITM)
  z: number;            // Depth (meters)
  nodeType: string;     // 'Manhole', 'Home', 'Drainage', 'Issue', 'ForLater'
  type: 'type1' | 'type2';  // Node type classification
  gnssFixQuality: number; // 0-6 (No Fix to RTK Fixed)
  surveyX: number;      // Survey coordinates (ITM)
  surveyY: number;
  surveyZ: number;
  tail_measurement: number | null;  // Depth at tail
  head_measurement: number | null;  // Depth at head
  customAttributes: object;  // User-defined properties
}
```

### Edge
```typescript
{
  id: string;           // Unique edge identifier
  tail: string;         // Tail node ID
  head: string;         // Head node ID
  length: number;       // Length (meters)
  direction: number;    // Azimuth (degrees)
  tail_measurement: number | null;  // Depth at tail
  head_measurement: number | null;  // Depth at head
  status: 'ok' | 'damaged' | 'planned';  // Maintenance status
}
```

### Project
```typescript
{
  id: string;
  name: string;
  description: string;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Organization
```typescript
{
  id: string;
  name: string;
  settings: {
    csvExport: boolean;
    featureFlags: string[];
  };
}
```

---

## Key Systems

### 1. GNSS/Live Measure

**Purpose:** Survey-grade coordinate capture from Trimble R780.

**Components:**
- **Connection Adapters:**
  - `bluetooth-adapter.js` — Bluetooth SPP (Android)
  - `tmm-adapter.js` — Third-party NMEA over Wi-Fi/Bluetooth
  - `browser-location-adapter.js` — Browser geolocation fallback
  - `mock-adapter.js` — Browser testing
  - *(TSC3 device integration is separate, in `survey/`)*
- **NMEA Parser:** Parses GGA/RMC sentences, extracts lat/lon/fix quality
- **State Manager (`gnss-state.js`):** Centralized state for position, captured points, live measure mode
- **Canvas Marker:** Real-time GNSS position rendering on sketch

### 2. Cockpit & Gamification

**Purpose:** Visual progress tracking and intelligent suggestions.

**Components:**
- `cockpit.js` — Main controller for gamification UI
- `action-rail.js` — Bottom action bar for common tasks
- `completion-engine.js` — Analyzes progress and suggests next actions
- `intel-strip.js` — Displays project health metrics (nodes, edges, issues)
- `quick-wins.js` — Context-aware quick actions
- `session-tracker.js` — Monitors survey session progress

**Features:**
- Skill levels based on XP accumulation
- Health card with visual progress indicators
- Smart suggestions for completing nodes and edges
- Session time and completion tracking

### 3. Field Commander

**Purpose:** Mobile-optimized UI shell with gamification and territory management.

**Components:**
- `fc-shell.js` — Field commander shell/frame
- `fc-gestures.js` — Touch gesture handling (one-handed edge mode)
- `fc-territory.js` — Zone-based work assignment
- `fc-xp.js` — XP accumulation
- `fc-achievements.js` — Badge/achievement system
- `fc-panels.js` — Panel management

**Note:** The `Cmd+K` command palette is in `menu/command-menu.js`, not in field-commander.

**Features:**
- One-handed edge mode (long-press drag)
- Territory zone management
- XP and achievements gamification
- Touch-optimized gesture handling

### 4. Project Canvas

**Purpose:** Multi-sketch city view with unified network visualization.

**Components:**
- `project-canvas-renderer.js` — Canvas rendering for merged network
- `project-canvas-state.js` — State management for city view
- `sketch-side-panel.js` — Detail view for nodes/edges/issues
- `sketch-issues.js` — Issue management and navigation
- `fix-suggestions.js` — AI-assisted fix recommendations
- `issue-highlight.js` — Navigation to issues
- `issue-nav-state.js` — Navigation state

**Features:**
- See all sketches as one network
- Click issues to jump to location
- Merge duplicate nodes
- Detailed sidebar with comments

### 5. Survey Mode

**Purpose:** Specialized workflow for survey equipment.

**Components:**
- `device-picker-dialog.js` — Select TSC3 survey device
- `survey-node-type-dialog.js` — Optimized survey forms
- `tsc3-bluetooth-adapter.js` — Bluetooth connection
- `tsc3-connection-manager.js` — Device manager
- `tsc3-parser.js` — TSC3 data parsing
- `tsc3-websocket-adapter.js` — WebSocket communication

**Features:**
- Easy device connection
- Survey-specific forms
- Device data parsing and display

**Connection Types:**
- `BLUETOOTH` — Serial port profile over Bluetooth
- `WIFI` — TCP socket to R780 WiFi hotspot (192.168.1.10:5017)
- `BROWSER` — Web-only mock adapter
- `TMM` — Third-party NMEA over Wi-Fi/Bluetooth (specialized)

**Fix Quality Mapping:**
| Value | Name | Description |
|------|------|-------------|
| 0 | No Fix | No GNSS signal |
| 1-3 | GPS/DGPS | Standalone or differential |
| 4 | RTK Fixed | Highest accuracy (survey-grade) |
| 5 | Device Float | R780 internal float solution |
| 6 | Manual Float | Manual input |

### 2. Canvas Graph Editor

**Purpose:** High-performance network visualization without third-party graph libraries.

**Components:**
- **Rendering Engine:** HTML5 Canvas API with progressive rendering
- **Spatial Index:** Uniform lookup grid (`utils/spatial-grid.js`) for fast node/edge hit-testing
- **View Transform:** Custom pan/zoom with view stretch support
- **LOD (Level of Detail):** Simplified rendering at extreme zoom levels

**Performance Features:**
- RequestAnimationFrame draw loop
- Batch drawing operations (stroke, fill, clip in single paths)
- View scale-based complexity reduction
- 15,000+ nodes tested

### 3. Measurement Rail

**Purpose:** Floating inline depth inputs on selected edges.

**Features:**
- Inputs positioned at 25% (tail) and 75% (head) along edge
- Real-time update during pan/zoom
- Auto-save on input change
- Perpendicular offset for visibility

### 4. Map Layer System

**Purpose:** GIS-accurate map background with coordinate alignment.

**Components:**
- **Tile Manager (`tile-manager.js`):** Esri World Imagery / World Street Map / GovMap tile layers
- **GovMap Layer (`govmap-layer.js`):** Israel government orthophoto; includes ITM ↔ WGS-84 helpers used by the rest of the app
- **Projection (`projections.js`):** Israel TM Grid (ITM, EPSG:2039) via proj4
- **Reference Layers:** Sections, survey manholes, pipes, streets, addresses
- **Street View (`street-view.js`):** Google Maps drag-and-drop pegman widget
- **User Location (`user-location.js`):** Browser Geolocation API; watches device position, converts to ITM, notifies subscribers via callbacks

**Coordinate System:**
- Primary: ITM (EPSG:2039)
- Valid range: X: 100,000-300,000m, Y: 350,000-800,000m (350k lower bound for Eilat/Negev)
- Accuracy: <1 meter with proj4 transformations

### 4a. Annotation Layer (Geoman)

**Purpose:** Non-destructive freehand map annotations (zones, polygons, notes) on top of the canvas.

**Components:**
- `annotation-layer.js` — Leaflet map injected over `#graphCanvas`; uses `@geoman-io/leaflet-geoman-free` toolbar

**Architecture:**
- Transparent overlay (pointer-events: none when Geoman inactive → canvas interactions pass through)
- Geoman draw mode activates pointer capture on the overlay; deactivation returns control to canvas
- WGS-84 ↔ ITM conversion via shared `govmap-layer.js` helpers
- Annotations persisted to IndexedDB `annotationsStore`; loaded on `initAnnotationLayer()`

**Events emitted (EventBus):**
| Event | Payload |
|-------|---------|
| `annotation:created` | GeoJSON feature + ITM bounds |
| `annotation:edited` | Updated GeoJSON layer |
| `annotation:deleted` | Deleted layer ID |

**API:**
```js
import { initAnnotationLayer, destroyAnnotationLayer } from '../map/annotation-layer.js';
initAnnotationLayer(); // call once after canvas is initialized
destroyAnnotationLayer(); // cleanup on unmount
```

### 5. Offline-First PWA

**Purpose:** Full functionality without internet.

**Storage Strategy:**
- **IndexedDB:** Durable storage for large datasets (nodes, edges, sketches)
- **localStorage:** Synchronous access for UI state, preferences
- **Service Worker:** Asset caching, offline fallback, background sync

**Sync Mechanism:**
- Auto-save on canvas change (debounced PUT via `auth/sync-service.js`)
- Background sync when network reconnected (IndexedDB `syncQueue` drained)
- Optimistic locking: each sketch carries an integer `version` counter; a stale PUT returns 409
- Conflict resolution: nodes/edges unioned by id (server preferred on same-id clashes), and per-node append-only measurement histories unioned — field shots are never dropped

### 6. Issue System

**Purpose:** Audit feedback and quality control.

**Components:**
- **Issue Detection:** Real-time canvas audit for common issues
  - Missing coordinates
  - Negative gradients
  - Long edges
  - Merge candidates
- **Issue Node Type:** Dedicated node type for feedback
- **Issue Comments:** Threaded comments per issue
- **Navigation:** Jump to issues from canvas or sidebar

**Components:**
- `sketch-issues.js` — Issue management and storage
- `issue-highlight.js` — Navigation to issues
- `fix-suggestions.js` — AI-assisted fix recommendations
- `issue-nav-state.js` — Navigation state

### 7. Multi-Tenant SaaS

**Purpose:** Organizational data isolation and RBAC.

**Components:**
- **Organizations:** Tenant isolation
- **Projects:** Grouping of sketches
- **Roles:** user, admin, super_admin
- **Feature Flags:** Per-user/per-org toggles
- **Sketch Locking:** 30-minute collaborative editing lock

**Permissions:**
- `user`: Read/write own data only
- `admin`: Read/write org-wide data, manage members
- `super_admin`: Full access, manage org, feature flags

### 8. Notifications System

**Purpose:** Contextual alerts and reminders.

**Components:**
- `notification-bell.js` — Notification bell UI component

**Features:**
- Contextual alerts based on user actions
- Session reminders
- System notifications

### 9. Layout System

**Purpose:** Responsive layout management for different screen sizes and orientations.

**Components:**
- `layout-manager.js` — Central layout controller
- `unified-sidebar.js` — Collapsible side panel
- `unified-toolbar.js` — Top navigation bar with 60px touch-target map controls
- `micro-status-bar.js` — Compact status indicators

**Status Bar Features (micro-status-bar.js):**
- **GPS Accuracy HUD Badge:** Color-coded GNSS fix quality indicator embedded in the status bar
  - 🔴 No Fix / 🟡 GPS / 🟡 DGPS / 🔵 RTK Float / 🟢 RTK Fixed
  - Updates in real time from GNSS state; hidden when GNSS is disconnected
- **Persistent Offline Chip:** Network connectivity indicator in the header
  - Appears amber/red when the device is offline
  - Auto-dismisses when connectivity is restored
  - Does not disappear on page interactions so the user always knows network state

**Other Features:**
- Landscape/portrait orientation detection
- Collapsible panels for maximized canvas space
- Responsive breakpoints for mobile/tablet/desktop

---

## Testing

### Unit Tests (Vitest)
- **Location:** `frontend/tests/**/*.test.ts` (unit tests in `tests/unit/`, integration in `tests/`)
- **Coverage:** 1,853 tests (75 test files, vitest run 2026-07-20)
- **Command:** `npm run test:run`
- **Framework:** Vitest with jsdom

### E2E Tests (Playwright)
- **Location:** `frontend/tests/e2e/*.spec.ts`
- **Coverage:** 18 spec files (auth, canvas drawing, cockpit, full-network audit, project canvas, RTL layout, TSC5 field workflows, …)
- **Command:** `npm run test:e2e` (or `playwright test`)
- **Platforms:** Chromium, Firefox, WebKit, mobile

### Test Results
- Live reports: `frontend/test-results/`
- Playwright HTML: `frontend/playwright-report/`

### Test Coverage Gaps
- Cockpit components: Limited coverage (7 files)
- Survey mode modules: Limited coverage (6 files)
- Project canvas features: Basic tests only (9 files)
- Admin panel modules: Limited coverage
- Field commander modules: Limited coverage (7 files)
- Layout system: Limited coverage (6 files)

---

## Deployment

### Vercel (Production)
- **Framework:** Vite
- **Build Command:** `vite build`
- **Output Directory:** `dist/`
- **Environment:**
  - `BETTER_AUTH_SECRET`: Session signing
  - `POSTGRES_URL`: Neon Postgres connection
  - `BETTER_AUTH_URL`: Auth base URL

### Auto-Deployments
- `dev` branch → **Production** (`https://manholes-mapper-three.vercel.app`) — since 2026-07-15, `dev` IS the Vercel production branch (team `gis-6579s-projects`)
- `master` branch → mirrors `dev`; builds Preview deployments only

### GitHub Pages (Field Deployment)
`.github/workflows/deploy.yml` publishes `master` to GitHub Pages: `hussam0is.github.io/manholes-mapper` — the live field deployment, still serving the old offline build. HTTPS (required for the Service Worker) is provided by both hosts.

---

## Technology Stack

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| **Frontend** | Vanilla JS (ES Modules) | - | Core engine |
| | React 19 | ^19.2.3 | UI components (gradual migration) |
| | Tailwind CSS 4.x | ^4.1.18 | Styling |
| | Vite 7 | ^7.1.3 | Build tool |
| **Graphics** | HTML5 Canvas API | - | Graph rendering |
| | Three.js | ^0.183.2 | 3D underground visualization |
| | Leaflet | - | Map tiles |
| **Storage** | IndexedDB | - | Durable storage |
| | localStorage | - | Synchronous access |
| **Auth** | Better Auth | ^1.4.17 | Authentication |
| | Neon Postgres | ^0.10.0 | Database |
| **Mobile** | Capacitor | ^8.0.2 | Android native |
| | Capacitor Bluetooth | ^6.0.3 | Bluetooth SPP |
| **Utils** | proj4 | ^2.20.2 | Coordinate transformations |
| | Tailwind CSS | ^4.1.18 | In package.json but NOT wired up (no directive/plugin) |

---

## Performance Optimizations

1. **Canvas Rendering:**
   - RequestAnimationFrame draw loop
   - Batch drawing operations
   - View scale-based LOD (1-7x zoom levels)
   - Spatial indexing for lookups

2. **Data Management:**
   - Auto-save with debounce (1s)
   - IndexedDB for large datasets
   - localStorage for UI state
   - Captured points capped at 1,000

3. **GNSS:**
   - Position staleness check (3s threshold)
   - Lightweight synchronous NMEA parsing (`gnss/nmea-parser.js`)
   - Connection state caching

4. **Testing:**
   - 1,853 unit tests (all passing)
   - E2E tests with Playwright
   - Test coverage reports

---

## Security

- **Authentication:** Better Auth with JWT sessions
- **Authorization:** RBAC (user/admin/super_admin)
- **Rate Limiting:** 100 req/min per user, 5 sign-ins/15min
- **Input Validation:** Schema validation on all API routes
- **HTTPS Required:** For Service Worker functionality
- **SQL Injection:** Neon Postgres parameterized queries
- **XSS:** Input sanitization, CSP headers

---

## Future Architecture

- **React Migration:** Gradual replacement of legacy code with React components
- **TypeScript Adoption:** Full TypeScript for new features
- **GraphQL API:** Next-gen API layer (planned)
- **Real-time Sync:** WebSocket for collaborative editing
- **AI-Assisted Surveying:** Auto-detect merge candidates, missing measurements

---

*Last updated: 2026-07-20 (frontend/api trees, spatial index, sync conflict resolution, deployment, and test counts synced with the codebase)*