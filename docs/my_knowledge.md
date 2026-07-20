# Manholes Mapper — Complete Object Knowledge Base

> Auto-generated full-app scan. Format: `object_id` (exact code name) — Type — How/When to use — Where (file:line) — Related objects
>
> **Updated 2026-07-20** — Section 1 re-verified against the modularized `src/legacy/` (main.js is now ~2,133 lines; most functions live in ~24 sibling modules). New sections 20–24 added (field-stepper, gradient-engine, connection-suggest, measurement-history, snackbar).

---

## 1. LEGACY CORE — `src/legacy/` (modularized)

The former ~13k-line monolith is now `main.js` (~2,133 lines: DOM refs, state declarations, `init()`, keyboard shortcuts, window-global bridge) plus ~24 extracted sibling modules. Cross-module state flows through `shared-state.js`: the `S` state proxy (`shared-state.js:33`, getters/setters defined by main.js, mirrored into AppStore via `bridgedProperty()` at `shared-state.js:46`) and the `F` function registry (`shared-state.js:36`, populated by main.js inside `init()` — modules call `F.scheduleDraw()`, `F.renderDetails()`, `F.reverseEdge()`, etc.).

All `Where` values below are `file:line` within `src/legacy/` unless another directory is shown.

### 1.1 DOM Element References

| object_id | Type | How/When | Where | Related |
|---|---|---|---|---|
| `graphCanvas` (as `canvas`) | layout/canvas | Main drawing surface | main.js:181 | `ctx`, `draw()`, all pointer handlers |
| `newSketchBtn` | button | Creates new sketch | main.js:183 | `newSketch()`, `startPanel` |
| `homeBtn` | button | Opens home/sketch list panel | main.js:184 | `renderHome()` |
| `nodeModeBtn` | button | Switch to node creation mode | main.js:185 | `currentMode`, `edgeModeBtn` |
| `homeNodeModeBtn` | button | Switch to home node mode | main.js:186 | `currentMode='home'` |
| `drainageNodeModeBtn` | button | Switch to drainage node mode | main.js:187 | `currentMode='drainage'` |
| `issueNodeModeBtn` | button | Switch to issue node mode | main.js:188 | `currentMode='issue'` |
| `edgeModeBtn` | button | Switch to edge creation mode | main.js:189 | `currentMode='edge'` |
| `nodeTypeFlyoutBtn` | button | Toggle node type flyout menu | main.js:190 | `nodeTypeFlyout`, `syncFlyoutIcon()` (project-ui.js:90) |
| `nodeTypeFlyout` | layout | Node type selection popup | main.js:191 | `closeFlyout()` (project-ui.js:103) |
| `undoBtn` | button | Trigger undo | main.js:192 | `performUndo()` |
| `redoBtn` | button | Trigger redo | main.js:193 | `performRedo()` |
| `threeDViewBtn` | button | Open 3D visualization | main.js:194 | `open3DView()` |
| `exportNodesBtn` | button | Export nodes CSV | main.js:196 | `csv.js` |
| `exportEdgesBtn` | button | Export edges CSV | main.js:197 | `csv.js` |
| `exportSketchBtn` | button | Export sketch JSON | main.js:199 | `sketch-io.js` |
| `importSketchBtn` | button | Import sketch JSON | main.js:200 | `importSketchFile` |
| `importSketchFile` | input(file) | File picker for sketch import | main.js:201 | `importSketchFromJson()` |
| `exportMenuBtn` | button | Toggle export dropdown | main.js:203 | `exportDropdown` |
| `exportDropdown` | layout | Export options dropdown | main.js:204 | dropdown menu |
| `detailsContainer` | layout | Node/edge details sidebar content | main.js:205 | `renderDetails()` (details-panel.js) |
| `startPanel` | layout/panel | New sketch form panel | main.js:206 | `newSketchBtn`, `startBtn` |
| `homePanel` | layout/panel | Sketch list home panel | main.js:207 | `renderHome()`, `hideHome()` (home-renderer.js) |
| `sketchList` (as `sketchListEl`) | layout | Sketch card list container | main.js:208 | `renderHome()` |
| `createFromHomeBtn` | button | Create sketch from home panel | main.js:209 | shows `startPanel` |
| `dateInput` | input | New sketch date picker | main.js:210 | `newSketch()` |
| `startBtn` | button | Confirm new sketch creation | main.js:211 | `newSketch()` |
| `cancelBtn` | button | Cancel new sketch creation | main.js:212 | hides `startPanel` |
| `helpBtn` | button | Opens help modal | main.js:213 | `helpModal` |
| `autosaveToggle` | input(checkbox) | Toggle autosave | main.js:214 | `autosaveEnabled` |
| `saveBtn` | button | Manual save | main.js:215 | `saveToLibrary()` (library-manager.js) |
| `helpModal` | layout/modal | Help overlay | main.js:217 | `closeHelpBtn` |
| `closeHelpBtn` | button | Close help modal | main.js:218 | `helpModal` |
| `toast` (as `toastEl`) | layout | Toast notification element | main.js:219 | `showToast()` (now snackbar-backed, see §24) |
| `zoomInBtn` / `zoomOutBtn` | button | Desktop zoom controls | main.js:220-221 | `setZoom()` (view-utils.js) |
| `recenterBtn` | button | Recenter on sketch | main.js:222 | `recenterView()` (view-utils.js) |
| `recenterDensityBtn` | button | Center on densest area | main.js:223 | `recenterDensityView()` (view-utils.js:347) |
| `sizeIncreaseBtn` / `sizeDecreaseBtn` | button | Node/font size scale | main.js:224-225 | `increaseSizeScale()` / `decreaseSizeScale()` (toolbar-events.js:42/56) |
| `autoSizeBtn` | button | Toggle constant screen size | main.js:226 | `toggleAutoSize()` (toolbar-events.js:85) |
| `appTitle` (as `appTitleEl`) | layout | App title h1 | main.js:227 | i18n (`applyLangToStaticUI()`, i18n-ui.js:26) |
| `sketchNameDisplay` / `sketchNameDisplayMobile` | layout | Sketch name in header | main.js:228-229 | `updateSketchNameDisplay()` (app-utils.js:91) |
| `sidebar` (as `sidebarEl`) | layout/panel | Details drawer panel | main.js:232 | `closeSidebarPanel()` (details-panel.js:1799) |
| `sidebarCloseBtn` | button | Close details drawer | main.js:233 | `closeSidebarPanel()` |
| `langSelect` | select | Language dropdown (he/en) | main.js:240 | language switching (toolbar-events.js) |
| `adminBtn` / `mobileAdminBtn` | button | Navigate to admin | main.js:242/244 | `navigateToAdmin()` (admin-handlers.js:361) |
| `projectsBtn` / `mobileProjectsBtn` | button | Navigate to projects | main.js:243/245 | `navigateToProjects()` (admin-handlers.js:351) |
| `adminModal` | layout/modal | Admin settings modal | main.js:246 | `openAdminModal()` / `closeAdminModal()` (admin-handlers.js:44/73) |
| `adminScreen` | layout/panel | Full-screen admin panel | main.js:255 | `openAdminScreen()` (admin-handlers.js:83) |
| `projectsScreen` | layout/panel | Projects settings screen | main.js:266 | `openProjectsScreen()` (admin-handlers.js:311) |
| `main` (as `mainEl`) | layout | Main canvas container | main.js:263 | hidden when admin/projects open |
| `mobileMenuBtn` | button | Open mobile hamburger menu | main.js:274 | `mobileMenu` |
| `mobileMenu` | layout/panel | Mobile slide-out menu | main.js:275 | `closeMobileMenu()` (mobile-menu.js:49) |
| `mobileMenuCloseBtn` | button | Close mobile menu | main.js:276 | `mobileMenu` |
| `mobileMenuBackdrop` | layout | Backdrop overlay | main.js:277 | `mobileMenu` |
| `finishWorkdayBtn` / `mobileFinishWorkdayBtn` | button | Open finish workday flow | finish-workday.js:20-21 | `showFinishWorkdayModal()` (finish-workday.js:44) |
| `finishWorkdayModal` | layout/modal | Finish workday dialog | finish-workday.js:22 | `closeFinishWorkdayModal()` (finish-workday.js:113) |
| `importCoordinatesBtn` | button | Trigger coord CSV import | coordinate-handlers.js:974 | `handleCoordinatesImport()` |
| `coordinatesToggle` | input(checkbox) | Toggle coordinate display | coordinate-handlers.js:406 | `toggleCoordinates()` |
| `liveMeasureToggle` / `mobileLiveMeasureToggle` | input(checkbox) | Toggle GNSS live measure | gnss-handlers.js:99-100 | `setLiveMeasureMode()` |
| `mapLayerToggle` / `mobileMapLayerToggle` | input(checkbox) | Toggle map tiles | coordinate-handlers.js:440-441 | `toggleMapLayer()` |
| `loginPanel` | layout/panel | Login/auth panel | auth-ui.js:24 | `showLoginPanel()` / `hideLoginPanel()` (auth-ui.js:69/84) |
| `authContainer` | layout | React auth mount point | auth-ui.js:26 | `mountAuthSignIn()` / `mountAuthSignUp()` (auth-ui.js:108/115) |
| `syncStatusBar` | layout | Sync status indicator | library-manager.js:425 | `updateSyncStatusUI()` (library-manager.js:432) |
| `gpsQuickCaptureBtn` | button | Quick GPS capture FAB | gnss-handlers.js:108 | `gpsQuickCapture()` |
| `searchNodeInput` / `mobileSearchNodeInput` | input | Node ID search | view-utils.js:483 | `searchAndCenterNode()` |
| `searchAddressInput` / `mobileSearchAddressInput` | input | Address search | view-utils.js:529 | `searchAddressAndCenter()` (view-utils.js:417) |
| `zoomToFitBtn` | button | Fit all nodes in view | view-utils.js:475 | `zoomToFit()` |
| `edgeLegend` / `edgeLegendToggle` | layout | Edge type color legend | canvas-draw.js:734-735 | `renderEdgeLegend()` (canvas-draw.js:733) |
| `canvasEmptyState` | layout | Empty sketch overlay | canvas-draw.js:1510 | `updateCanvasEmptyState()` (canvas-draw.js:1509) |
| `surveyConnectionBadge` | layout | TSC3 connection badge | tsc3-handlers.js:292 | TSC3 status |

### 1.2 State Variables

Declared in `main.js`, bridged to extracted modules through the `S` proxy (`shared-state.js`) — modules read/write `S.nodes`, `S.viewScale`, etc.

| object_id | Type | How/When | Where | Related |
|---|---|---|---|---|
| `S` | proxy object | Shared state proxy for all extracted modules | shared-state.js:33 | `bridgedProperty()`, AppStore |
| `F` | registry object | Cross-module function registry (`F.scheduleDraw()`, `F.reverseEdge()`, …) | shared-state.js:36 | populated in main.js `init()` |
| `nodes` | array | All nodes in current sketch | main.js:378 | `createNode`, `deleteNodeShared` |
| `edges` | array | All edges in current sketch | main.js:379 | `createEdge`, `deleteEdgeShared` |
| `nextNodeId` | number | Auto-incrementing node ID | main.js:380 | `createNode` |
| `selectedNode` | object/null | Currently selected node | main.js:381 | `renderDetails()` |
| `selectedEdge` | object/null | Currently selected edge | main.js:382 | `renderDetails()` |
| `isDragging` | boolean | Node drag in progress | main.js:383 | pointer handlers |
| `currentMode` | string | `'node'`/`'home'`/`'drainage'`/`'issue'`/`'edge'` | main.js:404 | mode buttons |
| `pendingEdgeTail` | object/null | First node of edge being created | main.js:405 | edge creation |
| `currentSketchId` | string/null | Library ID of current sketch | main.js:409 | sync, save |
| `currentSketchName` | string/null | Human-friendly sketch name | main.js:410 | header display |
| `currentProjectId` | string/null | Project ID for current sketch | main.js:411 | project canvas |
| `autosaveEnabled` | boolean | Autosave toggle state | main.js:414 | save flow |
| `currentLang` | string | `'he'` or `'en'` | main.js:420 | i18n |
| `viewScale` | number | Zoom level (0.001-5.0) | main.js:426 | rendering |
| `viewTranslate` | {x,y} | Pan offset | main.js:428 | rendering |
| `viewStretchX` / `viewStretchY` | number | Canvas stretch factors | main.js:433-434 | rendering |
| `sizeScale` | number | Node/font size multiplier | main.js:440 | rendering |
| `autoSizeEnabled` | boolean | Constant-screen-size mode | main.js:441 | rendering |
| `nodeMap` | Map | Fast node lookup Map<id, node> | main.js:492 | all node lookups |
| `coordinatesMap` | Map | Map<nodeId, {x,y,z}> ITM coords | main.js:526 | coordinate display |
| `coordinatesEnabled` | boolean | Coordinate display toggle | main.js:527 | `toggleCoordinates` |
| `coordinateScale` | number | Pixels per meter (default 50) | main.js:530 | coordinate transforms |
| `liveMeasureEnabled` | boolean | GNSS tracking active | main.js:534 | GPS features |
| `mapLayerEnabled` | boolean | Map tile layer toggle | main.js:538 | map tiles |
| `adminConfig` | object | Admin configuration | main.js:550 | `loadAdminConfig()` (app-utils.js:311) |
| `undoStack` / `redoStack` | array | Undo/redo history (max 50) | main.js:394-395 | `performUndo`, `performRedo` |
| `homeMode` | string | `'projects'` or `'sketches'` | home-renderer.js:54 | home panel tabs, `getHomeMode()` |

### 1.3 Core Functions

| object_id | Type | Parameters | When | Where | Related |
|---|---|---|---|---|---|
| `newSketch(date, projectId, inputFlowConfig)` | function | date + optional project | New sketch creation | graph-crud.js:35 | `startBtn` |
| `createNode(x, y)` | function | canvas coords | Node/home/drainage/issue mode click | graph-crud.js:68 | `pushUndo`, `saveToStorage` |
| `createEdge(tailId, headId, options)` | function | node IDs | Edge mode click on two nodes | graph-crud.js:145 | `pushUndo`, `saveToStorage` |
| `reverseEdge(edgeId, options)` | function | edge ID + `{directionSource}` | Flip tail/head (CONNECT screen flip-offer, wizard, undo) — stamps `direction_source`, pushes self-inverse `'edgeReverse'` undo action, triggers gradient recheck | graph-crud.js:221 | `F.reverseEdge` (main.js:1807), undo-redo.js:417/582, gradient-engine |
| `createDanglingEdge(tailId, endX, endY)` | function | tail + endpoint | Edge mode click empty space | graph-crud.js:250 | dangling edges |
| `createInboundDanglingEdge(startX, startY, headId)` | function | endpoint + head | Inbound dangling edge | graph-crud.js:257 | dangling edges |
| `deleteNodeShared(node, pushToUndo, skipConfirm)` | function | node object | Delete/Backspace, context menu | undo-redo.js:93 | connected edges cleanup |
| `deleteEdgeShared(edge, pushToUndo, skipConfirm)` | function | edge object | Delete button | undo-redo.js:203 | undo stack |
| `connectDanglingEdge(edge, nodeId, type)` | function | dangling edge + target | Auto-connect on node creation | undo-redo.js:807 | dangling endpoint logic |
| `normalizeLegacySketch(nodes, edges)` | function | arrays | On every sketch load | storage-manager.js:85 | data migration |
| `computeNodeTypes()` | function | none | After node/edge changes | canvas-draw.js:828 | node type inference |
| `loadFromStorage()` | function | none | App init | storage-manager.js:245 | localStorage |
| `saveToStorage()` | function | none | After every data change | storage-manager.js:296 | localStorage + IDB |
| `saveToLibrary()` | function | none | On save/autosave | library-manager.js:161 | cloud sync |
| `loadFromLibrary(sketchId)` | function | sketch ID | Opening a sketch | library-manager.js:214 | data loading |
| `deleteFromLibrary(sketchId)` | function | sketch ID | Delete action | library-manager.js:379 | cleanup |
| `draw()` | function | none | Main render loop (rAF) | canvas-draw.js:117 | all rendering |
| `scheduleDraw()` | function | none | Debounced redraw | canvas-draw.js:1530 | rAF scheduling |
| `drawEdge(edge)` | function | edge object | Per-edge in `draw()` | canvas-draw.js:850 | edge rendering |
| `drawEdgeLabels(edge)` | function | edge object | Measurement/length labels | canvas-draw.js:1206 | label rendering |
| `drawNode(node)` | function | node object | Per-node in `draw()` | canvas-draw.js:1340 | node rendering |
| `drawInfiniteGrid(w, h, isSchematicView)` | function | canvas dimensions | Background grid | canvas-draw.js:748 | grid rendering |
| `renderDetails()` | function | none | When selection changes | details-panel.js:285 | sidebar form builder |
| `renderHome()` | function | none | Shows sketch list | home-renderer.js:195 | home panel |
| `renderProjectsHome()` | function | none | Shows project cards | home-renderer.js:511 | project list |
| `hideHome(immediate)` | function | boolean | Close home panel | home-renderer.js:440 | panel animation |
| `handleRoute()` | function | none | Hash routing | auth-ui.js:143 | `#/admin`, `#/projects`, etc. |
| `setZoom(newScale)` | function | scale number | Zoom buttons, keyboard | view-utils.js:202 | viewScale |
| `recenterView()` | function | none | Center on sketch | view-utils.js:244 | viewTranslate |
| `zoomToFit()` | function | none | Fit all nodes | view-utils.js:257 | bounding box |
| `centerOnNode(node)` | function | node object | Navigate to node | graph-crud.js:389 | viewTranslate |
| `centerOnGpsLocation(lat, lon)` | function | WGS84 | Center on GPS | gnss-handlers.js:433 | map reference |
| `searchAndCenterNode(searchId)` | function | string/number | Node search | view-utils.js:360 | `centerOnNode` |
| `screenToWorld(x, y)` | function | screen coords | Convert screen to world | view-utils.js:147 | coordinate transform |
| `pointerDown(x, y)` | function | screen coords | Mouse/touch down | pointer-handlers.js:269 | input handling |
| `pointerMove(x, y)` | function | screen coords | Mouse/touch move | pointer-handlers.js:558 | input handling |
| `pointerUp()` | function | none | Mouse/touch up | pointer-handlers.js:653 | input handling |
| `findNodeAt(x, y)` | function | world coords | Hit-test nodes | pointer-handlers.js:116 | click detection |
| `findEdgeAt(x, y, threshold)` | function | world coords | Hit-test edges | pointer-handlers.js:159 | click detection |
| `pushUndo(action)` | function | action object | After create/move/delete | undo-redo.js:21 | undo stack |
| `performUndo()` | function | none | Ctrl+Z, undo button — handles `'edgeReverse'` (self-inverse) among action types | undo-redo.js:235 | undo/redo |
| `performRedo()` | function | none | Ctrl+Shift+Z — `'edgeReverse'` branch at undo-redo.js:582 | undo-redo.js:445 | undo/redo |
| `handleCoordinatesImport(file)` | function | File | CSV coordinate import | coordinate-handlers.js:132 | coordinate system |
| `toggleCoordinates(enabled)` | function | boolean | Coordinate toggle | coordinate-handlers.js:366 | coordinate display |
| `toggleMapLayer(enabled)` | function | boolean | Map layer toggle | coordinate-handlers.js:419 | map tiles |
| `setLiveMeasureMode(enabled)` | function | boolean | Live Measure toggle | gnss-handlers.js:54 | GNSS |
| `gpsQuickCapture()` | function | none | Quick capture FAB | gnss-handlers.js:287 | GPS node creation |
| `showFinishWorkdayModal()` | function | none | Workday finish flow | finish-workday.js:44 | dangling edge resolution |
| `loadProjectCanvas(projectId)` | function | UUID | `#/project/:id` route | home-renderer.js:832 | project canvas |
| `showNodeContextMenu(node, x, y)` | function | node + screen coords | Long-press/double-tap | pointer-handlers.js:195 | context menu |
| `handleTSC3PointReceived(pointName, coords, isNew, nodeType)` | function | survey point | TSC3 point arrival — updates/creates node, notifies field-stepper | tsc3-handlers.js:37 | `notifyStepperOfExternalNodeUpdate` (§20) |
| `init()` | function | none | App entry point | main.js:1719 | everything |

### 1.4 Window Globals (exposed by legacy modules)

Note: `__getSketchStats`, `__saveToStorage`, `__getViewState`, `__selectNodeById`, `__selectEdgeById`, `__onSketchIdChanged`, `__nodeMap`, `window.renderHome`, and `window.invalidateLibraryCache` are no longer defined — remaining call sites use optional chaining and silently no-op.

| object_id | Purpose | Where |
|---|---|---|
| `window.__getActiveSketchData()` | Snapshot sketch state for switching | main.js:1948 |
| `window.__setActiveSketchData(data)` | Load sketch into globals (resets gradient engine, undo stack) | main.js:1925 |
| `window.__scheduleDraw()` | Trigger canvas redraw | main.js:1976 |
| `window.__setViewState(scale, tx, ty)` | Set zoom/pan programmatically | main.js:1966 |
| `window.getViewState()` | Read zoom/pan/stretch (no `__` prefix) | main.js:1918 |
| `window.__getStretch()` | Read stretch factors | main.js:1975 |
| `window.__projectCanvas` | Project canvas API object | main.js:1955 |
| `window.__markInternalNavigation()` | Mark in-app hash change (required before programmatic navigation — exit guard) | main.js:1924 |
| `window.__createNodeFromMeasurement` | GPS node creation | main.js:1923 |
| `window.__sketchReadOnly` | Read-only mode flag (locked sketches) | library-manager.js:232 |
| `window.handleRoute` | Hash router | auth-ui.js:341 |
| `window.scheduleDraw` / `window.setZoom` / `window.zoomToFit` / `window.recenterView` | View control aliases | main.js:1914-1917 |
| `window.setLiveMeasureMode` / `window.openGnssPointCaptureDialog` / `window.centerOnGpsLocation` / `window.toggleUserLocationTracking` | GNSS aliases | main.js:1919-1922 |
| `window.loadProjectReferenceLayers` / `window.getReferenceLayers` / `window.setLayerVisibility` / `window.setRefLayersEnabled` / `window.isRefLayersEnabled` / `window.saveRefLayerSettings` | Reference-layer bridge | main.js:956-961 |

### 1.5 Keyboard Shortcuts (main.js:1471, global `keydown` handler)

| Key | Action |
|---|---|
| `N` | Node mode |
| `E` | Edge mode |
| `S` | Manual save |
| `Space` (hold) | Pan canvas |
| `Tab` / `Shift+Tab` | Cycle node/edge selection |
| `Enter` | Open details drawer for selection |
| `Escape` | Close modals/cancel/deselect |
| `Delete`/`Backspace` | Delete selected |
| `+`/`=` | Zoom in |
| `-` | Zoom out |
| `0` | Reset zoom 100% |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z`/`Ctrl+Y` | Redo |

### 1.6 Constants

| object_id | Value | Where |
|---|---|---|
| `UNDO_STACK_MAX` | 50 | undo-redo.js:17 (also main.js:393) |
| `LONG_PRESS_MS` | 600 | pointer-handlers.js:20 |
| `DOUBLE_TAP_MS` | 300 | pointer-handlers.js:21 |
| `MIN_SCALE` / `MAX_SCALE` | 0.001 / 5.0 | main.js:429-430 (duplicated in pointer-handlers.js:22-23, view-utils.js:23-24, home-renderer.js:46-47) |
| `SCALE_STEP` | 1.1 | main.js:431 (also mobile-menu.js:17) |
| `MIN_STRETCH` / `MAX_STRETCH` | 0.2 / 3.0 | main.js:435-436 (also coordinate-handlers.js:61-62) |
| `TOUCH_TAP_MOVE_THRESHOLD` | 5px | pointer-handlers.js:24 |
| `TOUCH_SELECT_EXPANSION` | 14px | pointer-handlers.js:25 |
| `SCALE_PRESETS` | [5,10,25,50,75,100,150,200,300] | main.js:531 (also coordinate-handlers.js:65) |

---

## 2. AUTH — `src/auth/`

### 2.1 auth-client.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `authClient` | object | Better Auth client instance — foundation for all auth | 14 | `getApiBaseUrl`, `createAuthClient` |
| `signInWithEmail(email, password)` | function | Login form submit | 33 | `authClient.signIn.email` |
| `signUpWithEmail(email, password, name)` | function | Signup form submit | 47 | `authClient.signUp.email` |
| `signOutUser()` | function | Log out current user | 59 | `authClient.signOut` |
| `getCurrentSession()` | function | Session polling (5 min) | 67 | `authClient.getSession` |
| `onSessionChange(callback)` | function | Subscribe to session changes; returns unsub | 76 | 5-min polling |

### 2.2 auth-guard.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `authState` | object | Canonical state: `{isLoaded, isSignedIn, userId, sessionId, user}` | 11 | listeners |
| `onAuthStateChange(callback)` | function | Subscribe to auth changes; returns unsub | 30 | `authStateListeners` |
| `updateAuthState({session, user})` | function | After fetching session from server | 52 | `notifyAuthStateChange` |
| `getAuthState()` | function | Read current auth state | 67 | `authState` |
| `isAuthenticated()` | function | Quick signed-in check | 75 | `authState` |
| `getUserId()` / `getUsername()` / `getUserEmail()` | function | User info getters | 83/91/104 | `authState` |
| `guardRoute(currentHash)` | function | Redirect unauthenticated to `#/login` | 136 | routing |
| `redirectIfAuthenticated(currentHash)` | function | Redirect signed-in from login pages | 162 | routing |
| `refreshSession()` | function | Fetch session + update state | 178 | `getCurrentSession` |
| `initAuthMonitor()` | function | Initialize 15-min refresh | 198 | `refreshSession` |

### 2.3 auth-provider.jsx

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `SignInForm` | React component | `<SignInForm onSuccess={fn}>` — login form | 184 | `signInWithEmail`, `PasswordField`, `LanguageToggle` |
| `SignUpForm` | React component | `<SignUpForm onSuccess={fn}>` — signup form | 287 | `signUpWithEmail`, `PasswordField`, `LanguageToggle` |
| `PasswordField` | React component | Reusable password input with show/hide | 63 | `SignInForm`, `SignUpForm` |
| `LanguageToggle` | React component | Language switch button (he/en) | 128 | auth forms |
| `mountSignIn(container, props)` | function | Mount login React form | 447 | `SignInForm` |
| `mountSignUp(container, props)` | function | Mount signup React form | 470 | `SignUpForm` |
| `unmountAuth(container)` | function | Unmount auth form | 500 | cleanup |

### 2.4 csrf.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `window.fetch` (patched) | function | Auto-attaches `x-csrf-token` on mutating `/api/` requests | 29 | `getCsrfToken`, `MUTATING_METHODS` |

### 2.5 permissions.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `fetchUserRole(forceRefresh?)` | function | Fetches `GET /api/user-role`; called on auth state change | 44 | `userRoleCache` |
| `getUserRole()` | function | Sync read of cached role data | 102 | `userRoleCache` |
| `isSuperAdmin()` / `isAdmin()` | function | Role checks | 110/118 | `userRoleCache` |
| `canAccessFeature(featureName)` | function | Feature flag check | 127 | `userRoleCache` |
| `initPermissionsService()` | function | Auth listener setup | 155 | `onAuthStateChange` |
| `window.permissionsService` | object | Legacy access to all permission fns | 176 | all exports |

### 2.6 sync-service.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `syncFromCloud()` | function | Full cloud-to-local sync | 714 | `fetchSketchesFromCloud` |
| `syncSketchToCloud(sketch)` | function | Sync single sketch (create/update); all four 409 branches union measurement histories | 1053 | optimistic locking, 409 conflict, `mergeMeasurementHistories` (§23) |
| `debouncedSyncToCloud(sketch)` | function | 2s debounced wrapper | 1343 | `syncSketchToCloud` |
| `deleteSketchEverywhere(sketchId)` | function | Delete from IDB + cloud | 1370 | offline queue |
| `acquireSketchLock(sketchId)` | function | POST lock action | 880 | `currentLock` |
| `releaseSketchLock(sketchId)` | function | POST unlock action | 931 | `currentLock` |
| `processSyncQueue()` | function | Drain offline queue | 1427 | `drainSyncQueue` |
| `onSyncStateChange(callback)` | function | Subscribe to sync state | 481 | `syncStateListeners` |
| `getSyncState()` | function | Read sync state | 1868 | `syncState` |
| `deduplicateSketches(arr)` | function | Remove local dups of cloud sketches | 1635 | fingerprint |
| `initSyncService()` | function | Setup online/offline + auth listeners | 1775 | `AbortController` |
| `clearLocalSketchData()` | function | Clears all local data on logout | 1841 | IDB + localStorage |
| `window.syncService` | object | Legacy access to all sync fns | 1874 | all exports |

---

## 3. GNSS — `src/gnss/`

### 3.1 gnss-state.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `ConnectionState` | constant | `.CONNECTED`, `.DISCONNECTED`, `.CONNECTING`, `.ERROR` | 7 | all adapters |
| `ConnectionType` | constant | `.BLUETOOTH`, `.WIFI`, `.MOCK`, `.BROWSER`, `.TMM` | 15 | all adapters |
| `GNSSStateManager` | class | Central GNSS state — use singleton `gnssState` | 27 | all GNSS modules |
| `gnssState` | singleton | `gnssState.on('position', cb)`, `gnssState.updatePosition(data)`, `gnssState.capturePoint(nodeId)` | 303 | all GNSS modules |
| `gnssState.position` | object | `{lat, lon, alt, fixQuality, fixLabel, satellites, hdop, accuracy, isValid, ...}` | 48 | position data |
| `gnssState.setConnectionState(state, opts)` | method | Called by adapters on connect/disconnect | 84 | `notifyListeners('connection')` |
| `gnssState.updatePosition(nmeaState)` | method | Called by adapters on new position | 114 | `notifyListeners('position')` |
| `gnssState.capturePoint(nodeId, opts)` | method | Captures current position for node (max 1000) | 136 | `notifyListeners('capture')` |
| `gnssState.on(event, callback)` | method | Events: `'connection'`, `'position'`, `'capture'` | 262 | event system |

### 3.2 connection-manager.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `gnssConnection` | singleton | Unified GNSS connection interface | 326 | all adapters, `gnssState` |
| `gnssConnection.connectBluetooth(mac)` | method | Connect Bluetooth SPP to GNSS receiver | 97 | `BluetoothAdapter` |
| `gnssConnection.connectWifi(host, port)` | method | Connect TCP to GNSS receiver (port 5017) | 122 | `WifiAdapter` |
| `gnssConnection.connectTMM(httpPort?)` | method | Connect Trimble Mobile Manager | 146 | `TMMAdapter` |
| `gnssConnection.connectMock()` | method | Connect mock for testing | 191 | `MockGNSSAdapter` |
| `gnssConnection.disconnect()` | method | Disconnect active adapter | 206 | all adapters |

### 3.3 Adapters

| object_id | Type | File | Purpose |
|---|---|---|---|
| `BluetoothAdapter` | class | `bluetooth-adapter.js` | Bluetooth SPP GNSS (Capacitor native) |
| `WifiAdapter` | class | `wifi-adapter.js` | TCP GNSS (Capacitor native, port 5017) |
| `MockGNSSAdapter` | class | `mock-adapter.js` | Simulated GNSS (Tel Aviv default) |
| `TMMAdapter` | class | `tmm-adapter.js` | Trimble Mobile Manager WebSocket |
| `NMEAParser` | class | `nmea-parser.js` | GGA/RMC NMEA sentence parser |
| `startBrowserLocationAdapter()` | function | `browser-location-adapter.js:60` | Bridges `navigator.geolocation` to gnssState |
| `stopBrowserLocationAdapter()` | function | `browser-location-adapter.js:90` | Stops browser geolocation |
| `isBrowserLocationActive()` | function | `browser-location-adapter.js:103` | Check if browser adapter active |
| `inferFixQuality(accuracy)` | function | `browser-location-adapter.js:19` | <0.05m=RTK, <0.5m=Float, <5m=DGPS, <15m=GPS |

### 3.4 Marker & Dialogs

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `FIX_COLORS` | constant | Maps fix quality 0-8 to hex colors | `gnss-marker.js:9` | marker rendering |
| `drawGnssMarker(ctx, position, ...)` | function | Draw full GNSS marker on canvas | `gnss-marker.js:62` | accuracy circle, info card |
| `drawGnssStatusBadge(ctx, status, x, y)` | function | Fixed-position status badge | `gnss-marker.js:388` | connection info |
| `gnssToCanvas(position, refPoint, scale)` | function | WGS84 to canvas world coords | `gnss-marker.js:474` | coordinate transform |
| `PrecisionMeasurement` | class | Epoch collection until criteria met | `precision-measure.js:31` | Trimble Access-like |
| `showPrecisionOverlay({onCancel, onAcceptEarly})` | function | Progress overlay with bars | `precision-measure-overlay.js:167` | UI overlay |
| `openPointCaptureDialog(nodes, onCapture, onCancel)` | function | GPS point capture dialog | `point-capture-dialog.js:226` | node dropdown, edge option |

---

## 4. MENU SYSTEM — `src/menu/`

### 4.1 menu-events.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `menuEvents` | singleton | Global pub/sub event bus; `window.menuEvents` | 70 | all menu actions |
| `menuEvents.on(event, cb)` | method | Subscribe; returns unsub fn | 17 | event system |
| `menuEvents.emit(event, data)` | method | Fire event to listeners | 43 | delegation |
| `setupEventDelegation(container)` | function | Wires `data-action` attrs to menuEvents | 76 | header init |
| `bridgeAllToLegacy(mappings)` | function | Bridge action IDs to legacy DOM IDs | 133 | migration |
| `legacyMappings` | constant | `{save: 'saveBtn', exportSketch: 'exportSketchBtn', ...}` | 140 | bridging |

### 4.2 menu-config.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `menuConfig` | constant | Declarative menu structure | 6 | all renderers |
| `menuConfig.primary` | array | Save button + autosave | 8 | `createPrimaryActions` |
| `menuConfig.secondaryGroups` | array | Grouped dropdown items (sketch, csv, workday, location, gnss, survey) | 31 | `createCommandMenu` |
| `menuConfig.mobileGroups` | array | Mobile menu groups | 206 | `createMobileMenu` |
| `breakpoints` | constant | `{mobile: 600, tablet: 900, desktop: 1100}` | 250 | responsive |
| `getAllActionIds()` | function | Flat array of all action IDs | 257 | enumeration |

### 4.3 Header & Components

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `HeaderComponent` | class | Main header UI manager | `header.js:237` | `initHeader` |
| `initHeader(selector, t, getLang)` | function | Create + render header | `header.js:465` | app init |
| `createActionBar(t, lang)` | function | Full `<nav>` with all groups | `action-bar.js:184` | header |
| `createCommandMenu(t)` | function | Dropdown menu HTML | `command-menu.js:70` | secondary actions |
| `initCommandMenu(container)` | function | Wire dropdown behavior | `command-menu.js:127` | keyboard nav |

---

## 5. ADMIN — `src/admin/`

### 5.1 admin-panel.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `AdminPanel` | class | `new AdminPanel({container, adminConfig, t, showToast, onSaveSettings, onClose})` | 36 | all admin tabs |
| `TABS` | constant | 7 tabs: settings, projects, users, orgs, features, fixes, statistics | 26 | role-filtered |
| `AdminPanel.render()` | method | Async — fetches role, builds tabs, loads active | 59 | `_fetchCurrentUser` |
| `AdminPanel._switchTab(tabId)` | method | Toggle active tab, lazy-load | 120 | tab UI |

### 5.2 Tab Classes

| object_id | Type | Purpose | File |
|---|---|---|---|
| `AdminSettings` | class | Node/edge field config (include, defaults, options) | `admin-settings.js` |
| `ProjectsSettings` | class | Project CRUD + layers + input flow | `projects-settings.js` |
| `AdminUsers` | class | User list with role/org management | `admin-users.js` |
| `AdminOrganizations` | class | Organization CRUD (super_admin) | `admin-organizations.js` |
| `AdminFeatures` | class | Feature flags per org/user | `admin-features.js` |
| `AdminFixes` | class | Issues aggregation with fix suggestions | `admin-fixes.js` |
| `AdminStatistics` | class | KPI dashboard, charts, heatmaps | `admin-statistics.js` |
| `InputFlowSettings` | class | Visual rule builder for conditional fields | `input-flow-settings.js` |

---

## 6. MAP & FEATURES — `src/map/`, `src/features/`

### 6.1 Projections & Tiles

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `wgs84ToItm(lat, lon)` | function | WGS84 to ITM conversion | `projections.js:22` | proj4 |
| `itmToWgs84(x, y)` | function | ITM to WGS84 conversion | `projections.js:39` | proj4 |
| `MAP_TYPES` | constant | `.ORTHOPHOTO`, `.STREET` | `govmap-layer.js:25` | map type |
| `setMapReferencePoint({itm, canvas})` | function | Link ITM to canvas coords | `govmap-layer.js:202` | tile positioning |
| `drawMapTiles(ctx, ...)` | function | Render map tiles on canvas | `govmap-layer.js:266` | main draw loop |
| `TILE_SIZE` | constant | 256px | `tile-manager.js:14` | tile system |
| `calculateZoomLevel(pixelsPerMeter)` | function | Scale to zoom level (5-21) | `tile-manager.js:250` | tile loading |
| `getTileFromCache(x,y,z,type)` | function | LRU cache lookup | `tile-manager.js:94` | performance |
| `findParentTile(x,y,z,type)` | function | Blurry placeholder from parent | `tile-manager.js:429` | progressive loading |

### 6.2 Reference Layers

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `setReferenceLayers(arr)` | function | Load GIS layers from API | `reference-layers.js:116` | layer data |
| `drawReferenceLayers(ctx, ...)` | function | Draw all visible GIS layers | `reference-layers.js:457` | main draw loop |
| `isRefLayersEnabled()` / `setRefLayersEnabled(bool)` | function | Global layer toggle | `reference-layers.js:180/172` | layer state |
| `saveRefLayerSettings()` / `loadRefLayerSettings()` | function | Persist layer prefs | `reference-layers.js:288/304` | localStorage |

### 6.3 Drawing Primitives & Icons

| object_id | Type | How/When | File:Line |
|---|---|---|---|
| `drawNodeIcon(ctx, node, radius, colors, selectedNode, opts)` | function | Master dispatcher — LOD, type dispatch | `node-icons.js:381` |
| `drawManholeIcon(ctx, x, y, r, ...)` | function | Circle + crosshatch | `node-icons.js:16` |
| `drawDrainageIcon(ctx, x, y, r, ...)` | function | Rectangle + water droplet | `node-icons.js:60` |
| `drawCoveredIcon(ctx, x, y, r, ...)` | function | Circle + diagonal stripes | `node-icons.js:110` |
| `drawHomeIcon(ctx, x, y, r, ...)` | function | Circle + house icon | `node-icons.js:155` |
| `drawForLaterIcon(ctx, x, y, r, ...)` | function | Dashed circle + "?" | `node-icons.js:221` |
| `drawIssueIcon(ctx, x, y, r, ...)` | function | Circle + "!" exclamation | `node-icons.js:256` |
| `drawCoordinateStatusIndicator(ctx, ...)` | function | Green/yellow badge top-left | `node-icons.js:302` |
| `drawEdge(ctx, edge, tail, head, opts)` | function | Directed edge + arrowhead + glow | `rendering.js:138` |
| `drawDanglingEdge(ctx, edge, tail, opts)` | function | Dashed purple dangling edge | `rendering.js:85` |
| `drawInfiniteGrid(ctx, ...)` | function | Background grid | `rendering.js:52` |
| `showMeasurementRail(edge)` / `hideMeasurementRail()` | function | Inline depth inputs | `measurement-rail.js:118/131` |

---

## 7. PROJECT CANVAS — `src/project/`

### 7.1 State Management

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `loadProjectSketches(projectId)` | function | Load all project sketches from API | `project-canvas-state.js:44` | enters project mode |
| `switchActiveSketch(sketchId)` | function | Switch active sketch (snapshots current) | `project-canvas-state.js:140` | toast notification |
| `getBackgroundSketches()` | function | All visible sketches except active | `project-canvas-state.js:96` | rendering |
| `isProjectCanvasMode()` | function | Check if in project mode | `project-canvas-state.js:186` | state check |
| `clearProjectCanvas()` | function | Leave project mode | `project-canvas-state.js:200` | cleanup |
| `findNodeInBackground(x, y)` | function | Hit-test background sketch nodes | `project-canvas-state.js:224` | click handling |
| `selectAllSketches()` | function | View All — select everything | `project-canvas-state.js:334` | multi-select |
| `onProjectCanvasChange(fn)` | function | Subscribe to state changes | `project-canvas-state.js:360` | listeners |

### 7.2 Rendering & Issues

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `drawBackgroundSketches(ctx, sketches, opts)` | function | Cached offscreen buffer rendering | `project-canvas-renderer.js:301` | performance |
| `invalidateBackgroundCache()` | function | Force re-render on next draw | `project-canvas-renderer.js:50` | state changes |
| `computeSketchIssues(nodes, edges)` | function | Detect 6 issue types + compute totalKm | `sketch-issues.js:99` | issue detection |
| `getFixSuggestions(issue, nodes, edges)` | function | Fix suggestions with `apply()` fns | `fix-suggestions.js:13` | issue fixing |
| `startIssueHighlight(worldX, worldY, ms)` | function | Pulsing red ring animation | `issue-highlight.js:21` | navigation |
| `window.__issueHighlight` | global | `{start, draw}` — cross-module access | `issue-highlight.js:102` | main.js |
| `window.__issueNav` | global | Issue navigation API | `issue-nav-state.js:170` | main.js |

### 7.3 Side Panel & Merge

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `initSketchSidePanel()` | function | One-time DOM setup | `sketch-side-panel.js:83` | project mode |
| `showSketchSidePanel()` | function | Show panel, enable View All | `sketch-side-panel.js:142` | enter project |
| `hideSketchSidePanel()` | function | Hide panel, disable merge | `sketch-side-panel.js:162` | leave project |
| `setMergeMode(enabled, context)` | function | Toggle merge mode | `merge-mode.js:92` | cross-sketch merge |
| `getNearbyNodes()` | function | Nearby nodes from other sketches | `merge-mode.js:113` | overlay rendering |
| `getCrossMergeIssues()` | function | Detected duplicate pairs | `merge-mode.js:118` | merge panel |

---

## 8. UTILS & STATE — `src/utils/`, `src/state/`, `src/dom/`, `src/graph/`

### 8.1 Coordinates & CSV

| object_id | Type | How/When | File:Line |
|---|---|---|---|
| `parseCoordinatesCsv(csvContent)` | function | Parse coords CSV → Map | `coordinates.js:10` |
| `applyCoordinatesToNodes(nodes, map, ...)` | function | Apply survey coords to nodes | `coordinates.js:445` |
| `repositionNodesFromEmbeddedCoordinates(...)` | function | Reposition from embedded coords | `coordinates.js:684` |
| `exportNodesCsv(nodes, adminConfig, t)` | function | Generate nodes CSV string | `csv.js:99` |
| `exportEdgesCsv(edges, adminConfig, t)` | function | Generate edges CSV string | `csv.js:152` |
| `csvQuote(value)` | function | Quote with formula injection prevention | `csv.js:84` |
| `encodeUtf16LeWithBom(text)` | function | UTF-16LE encoding for Excel | `encoding.js:6` |

### 8.2 Sketch I/O & Backup

| object_id | Type | How/When | File:Line |
|---|---|---|---|
| `exportSketchToJson(sketch, filename?)` | function | Download sketch JSON (v1.1) | `sketch-io.js:9` |
| `importSketchFromJson(file)` | function | Import + validate sketch JSON | `sketch-io.js:60` |
| `initBackupManager(getSketchData)` | function | Start 3-hour auto-backup | `backup-manager.js:212` |
| `createBackup(type?)` | function | Create hourly/daily backup in IDB | `backup-manager.js:36` |
| `window.backupManager` | global | Backup API for legacy code | `backup-manager.js:239` |

### 8.3 Input Flow Engine

| object_id | Type | How/When | File:Line |
|---|---|---|---|
| `evaluateRules(config, entityType, entity)` | function | Evaluate all rules → actions | `input-flow-engine.js:56` |
| `applyActions(entity, ruleResults, defaults?)` | function | Apply rules to entity copy | `input-flow-engine.js:133` |
| `isFieldVisible(ruleResults, key)` | function | Check field visibility | `input-flow-engine.js:207` |
| `validateInputFlowConfig(config)` | function | Validate config structure | `input-flow-engine.js:338` |

### 8.4 Canvas Performance

| object_id | Type | How/When | File:Line |
|---|---|---|---|
| `SpatialGrid` | class | Viewport culling grid (default 200 units) | `spatial-grid.js:14` |
| `buildNodeGrid(nodes, radius, ...)` | function | Build spatial grid for nodes | `spatial-grid.js:136` |
| `buildEdgeGrid(edges, nodeMap, ...)` | function | Build spatial grid for edges | `spatial-grid.js:158` |
| `progressiveRenderer` | singleton | Time-budgeted rendering (10ms) | `progressive-renderer.js:105` |
| `renderCache` | singleton | Off-screen canvas layer cache | `render-cache.js:120` |
| `renderPerf` | singleton | Frame time + FPS tracker | `render-perf.js:172` |
| `processLabels(ctx, labels, nodes, edges)` | function | Batch label collision avoidance | `label-collision.js:230` |
| `distanceToSegment(x0,y0,x1,y1,x2,y2)` | function | Point-to-segment distance | `geometry.js:11` |

### 8.5 UI Utilities

| object_id | Type | How/When | File:Line |
|---|---|---|---|
| `showToast(msg, variant?, duration?)` | function | Toast notification; `window.showToast` | `toast.js:13` |
| `FloatingKeyboard` | class | Mobile draggable numeric keyboard | `floating-keyboard.js:6` |
| `attachFloatingKeyboard(selector?)` | function | Wire keyboard to numeric inputs | `floating-keyboard.js:380` |
| `initResizableDrawer()` | function | Resizable details panel | `resizable-drawer.js:6` |
| `syncAppHeightVar()` | function | CSS `--app-height` sync | `dom-utils.js:23` |
| `syncHeaderHeightVar()` | function | CSS `--header-h` sync | `dom-utils.js:59` |

### 8.6 State Constants

| object_id | Type | Value | File:Line |
|---|---|---|---|
| `NODE_RADIUS` | constant | 20 | `constants.js:4` |
| `COLORS` | Proxy | Dynamic light/dark color accessor | `constants.js:152` |
| `isDarkMode()` | function | Detects dark mode (system/light/dark/auto) | `constants.js:33` |
| `NODE_MATERIAL_OPTIONS` | constant | 14 material options | `constants.js:164` |
| `EDGE_TYPES` | constant | `['קו ראשי', 'קו סניקה', 'קו משני']` | `constants.js:245` |
| `DEFAULT_INPUT_FLOW_CONFIG` | constant | 5 default rules | `constants.js:328` |
| `STORAGE_KEYS` | constant | All localStorage keys | `persistence.js:7` |
| `SKILL_LEVELS` | constant | APPRENTICE(1), SURVEYOR(2), EXPERT(3), ADMIN(4) | `skill-level.js:8` |
| `isFeatureVisible(feature)` | function | Progressive disclosure check | `skill-level.js:80` |

### 8.7 Graph & Service Worker

| object_id | Type | How/When | File:Line |
|---|---|---|---|
| `isNumericId(id)` | function | Distinguish numeric IDs from UUIDs | `id-utils.js:6` |
| `generateHomeInternalId()` | function | `'home_' + base36 + random` | `id-utils.js:17` |
| `registerServiceWorker` | IIFE | Register SW, 15-min updates, skip-waiting | `register-sw.js:4` |
| `setupOfflineRefreshGuards` | IIFE | Block F5/pull-to-refresh when offline | `register-sw.js:55` |

---

## 9. SURVEY — `src/survey/`

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `tsc3Connection` | singleton | TSC3 connection manager | `tsc3-connection-manager.js:210` | all TSC3 ops |
| `tsc3Connection.connectBluetooth(addr)` | method | Connect BT to TSC3 controller | 156 | `TSC3BluetoothAdapter` |
| `tsc3Connection.connectWebSocket(host, port)` | method | Connect WS to TSC3 (port 8765) | 175 | `TSC3WebSocketAdapter` |
| `TSC3BluetoothAdapter` | class | Bluetooth SPP for TSC3 (Capacitor) | `tsc3-bluetooth-adapter.js:36` | parser |
| `TSC3WebSocketAdapter` | class | WebSocket bridge for TSC3 | `tsc3-websocket-adapter.js:13` | reconnect |
| `parseSurveyLine(line)` | function | Parse survey CSV line (auto-detect format) | `tsc3-parser.js:46` | ITM heuristics |
| `processDataChunk(chunk, state)` | function | Streaming parser with buffer | `tsc3-parser.js:113` | both adapters |
| `openDevicePickerDialog(devices, t)` | function | Modal device picker → Promise | `device-picker-dialog.js:140` | BT connect |
| `openSurveyNodeTypeDialog(name, coords, onChoose, ...)` | function | Node type selection for survey points | `survey-node-type-dialog.js:90` | Manhole/Home/Drainage |
| `getSurveyAutoConnect()` | function | Auto-connect checkbox state | `survey-node-type-dialog.js:130` | edge creation |

---

## 10. 3D VIEW — `src/three-d/`

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `open3DView({selection?})` | function | Main orchestrator for 3D overlay | `three-d-view.js:43` | everything 3D |
| `buildScene(THREE, data, CSS2DObject, issues)` | function | Build 3D scene from sketch data | `three-d-scene.js:142` | manholes, pipes, houses |
| `computeInitialCamera({selection, ...})` | function | Camera placement based on selection | `three-d-camera-framing.js:13` | overview/node/edge |
| `FPSControls` | class | WASD + mouse FPS navigation | `three-d-fps-controls.js:34` | FPS mode |
| `VirtualJoystick` | class | Mobile touch joystick | `three-d-joystick.js:18` | FPS mobile |
| `createMaterials(THREE)` | function | All PBR materials | `three-d-materials.js:23` | scene |
| `EDGE_TYPE_COLORS` | constant | Edge type → hex color | `three-d-materials.js:14` | pipe colors |
| `setMiniatureMode(THREE, meshRefs, mini)` | function | Toggle real ↔ icon geometry | `three-d-miniature.js:26` | miniature button |
| `setup3DIssueInteraction(THREE, opts)` | function | Raycasting + fix popups | `three-d-issues.js:24` | issue fixing |

---

## 11. COCKPIT — `src/cockpit/`

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `initCockpit()` | function | Setup: DOM, orientation listener, events | `cockpit.js:754` | landscape mode |
| `updateCockpit()` | function | Refresh all cockpit displays (5s interval) | `cockpit.js:689` | completion, GPS, sync |
| `isCockpitActive()` | function | Check if landscape cockpit is active | `cockpit.js:814` | state check |
| `computeSketchCompletion()` | function | 40% coords + 30% measures + 20% issues + 10% fields | `completion-engine.js:46` | health ring |
| `initIntelStrip()` | function | Wire GNSS + sync listeners | `intel-strip.js:13` | Zone A |
| `updateIntelStrip(completion)` | function | Update ring, stats, GPS, condensed | `intel-strip.js:60` | `updateCockpit` |
| `initActionRail()` | function | Wire action rail buttons + more menu | `action-rail.js:15` | Zone C |
| `initQuickWins()` | function | Achievement notifications | `quick-wins.js:18` | milestones |
| `initSessionTracker()` | function | Session timer + streak tracking | `session-tracker.js:21` | duration, nodes, edges |
| `getSessionStats()` | function | `{durationSeconds, nodesPlaced, edgesDrawn, streak}` | `session-tracker.js:268` | profile page |

### Key Cockpit DOM Elements

| ID | Purpose |
|---|---|
| `#intelStrip` | Zone A container |
| `#gpsDot` / `#gpsLabel` / `#gpsAccuracy` | GPS status |
| `#completionRing` / `#completionFill` / `#completionText` | Health ring |
| `#syncIcon` / `#syncLabel` / `#syncPending` | Sync status |
| `#sessionDuration` / `#sessionNodes` / `#sessionEdges` | Session stats |
| `#streakCount` | Day streak |
| `#actionRail` | Zone C toolbar |
| `#railGpsBtn` / `#railTsc3Btn` / `#railUndoBtn` / `#railRedoBtn` | Action buttons |
| `#railMoreBtn` / `#railMoreMenu` | More menu |
| `#cockpitProgressFill` | Bottom progress bar |
| `#microCockpit` | Portrait mini strip |

---

## 12. PAGES — `src/pages/`

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `renderProfilePage()` | function | `#/profile` route — user stats | `profile-page.js:12` | localStorage data |
| `hideProfilePage()` | function | Back button or navigate away | `profile-page.js:121` | cleanup |
| `renderLeaderboardPage(projectId?)` | function | `#/leaderboard` route — org leaderboard | `leaderboard-page.js:13` | `/api/stats/leaderboard` |
| `hideLeaderboardPage()` | function | Back button | `leaderboard-page.js:102` | cleanup |
| `renderProjectStatsPage(projectId)` | function | `#/project/:id/stats` route | `project-stats-page.js:13` | `/api/projects/:id` |
| `hideProjectStatsPage()` | function | Back button | `project-stats-page.js:146` | cleanup |

---

## 13. ENTRY POINTS — `src/main-entry.js`, `src/canvas-fab-toolbar.js`, `src/capacitor-api-proxy.js`, `src/db.js`, `src/i18n.js`

### 13.1 main-entry.js Window Globals

| object_id | Purpose | Line |
|---|---|---|
| `window.escapeHtml(str)` | XSS prevention | 62 |
| `window.__authClient` | Better Auth client | 82 |
| `window.__gnssState` / `window.__gnssConnection` | GNSS access | 85-86 |
| `window.authGuard` | Auth guard API | 226 |
| `window.t(key, ...args)` | i18n translator | 246 |
| `window.isRTL()` | RTL check | 249 |
| `window.CONSTS` | State constants | 253 |
| `window.__getFixSuggestions` / `window.__computeSketchIssues` | Issue engine | 256-257 |
| `window.__showMeasurementRail` / `window.__hideMeasurementRail` | Measurement UI | 258-259 |
| `window.__isFeatureVisible` | Progressive disclosure | 260 |
| `window.menuEvents` | Event bus | 563 |
| `window.__startPrecisionMeasure` | Precision measure flow | 456 |

### 13.2 Other Entry Files

| object_id | Type | How/When | File:Line |
|---|---|---|---|
| `initCanvasFabToolbar()` | function | Speed dial FAB setup | `canvas-fab-toolbar.js:2` |
| `isCapacitorNative()` | function | Check Capacitor runtime | `capacitor-api-proxy.js:15` |
| `getApiBaseUrl()` | function | Production URL or empty | `capacitor-api-proxy.js:23` |
| `openDb()` | function | Open IndexedDB (cached) | `db.js:32` |
| `saveCurrentSketch(sketch)` / `loadCurrentSketch()` | function | IDB current sketch CRUD | `db.js:91/111` |
| `i18n` | constant | Full translation dict (he/en) | `i18n.js:2` |
| `createTranslator(dictRef, getLang)` | function | Create `t()` function | `i18n.js:2351` |

---

## 14. API ROUTES — `api/`

### 14.1 Route Handlers

| Route | Methods | Handler | File |
|---|---|---|---|
| `/api/auth/*` | ALL | Better Auth (sign-in/up/out/session) | `api/auth/index.js` |
| `/api/sketches` | GET, POST | List (role-filtered), create, assign orphans | `api/sketches/index.js` |
| `/api/sketches/[id]` | GET, PUT, DELETE, POST | CRUD + lock ops (lock/unlock/refresh/forceUnlock) | `api/sketches/index.js` |
| `/api/projects` | GET, POST | List projects, create | `api/projects/index.js` |
| `/api/projects/[id]` | GET, PUT, DELETE, POST | CRUD + duplicate | `api/projects/index.js` |
| `/api/organizations` | GET, POST | List/create orgs | `api/organizations/index.js` |
| `/api/organizations/[id]` | GET, PUT, DELETE | Org CRUD (super_admin) | `api/organizations/index.js` |
| `/api/users` | GET | List users (paginated) | `api/users/index.js` |
| `/api/users/[id]` | GET, PUT | User details, update role/org | `api/users/index.js` |
| `/api/user-role` | GET | Current user role + features | `api/user-role/index.js` |
| `/api/features/:type/:id` | GET, PUT | Feature flags per org/user | `api/features/index.js` |
| `/api/layers` / `[id]` | GET, POST, PUT, DELETE | GeoJSON layers CRUD | `api/layers/index.js` |
| `/api/issue-comments` | GET, POST | Issue comments + @mentions | `api/issue-comments/index.js` |
| `/api/notifications` | GET, POST | Unread notifications, mark read | `api/notifications/index.js` |
| `/api/org-members` | GET | Org members for @mentions | `api/org-members/index.js` |
| `/api/stats/leaderboard` | GET | Accuracy leaderboard | `api/stats/index.js` |
| `/api/stats/workload` | GET | Full analytics payload | `api/stats/index.js` |

### 14.2 API Library (`api/_lib/`)

| object_id | Type | How/When | File:Line |
|---|---|---|---|
| `verifyAuth(request)` | function | Session check → `{userId, error, user}` | `auth.js:166` |
| `parseBody(request, maxSize?)` | function | JSON body with 15MB limit, content-type check | `auth.js:79` |
| `handleCors(req, res)` | function | CORS + OPTIONS preflight; returns true if preflight | `cors.js:60` |
| `verifyCsrf(req, res)` | function | Double-submit cookie CSRF; returns true if blocked | `csrf.js:58` |
| `applyRateLimit(req, res, max?)` | function | 100/min sliding window; returns true if limited | `rate-limit.js:130` |
| `handleApiError(error, res, label)` | function | Centralized error handler (503/400/500) | `error-handler.js:19` |
| `ensureDb()` | function | Init all tables (idempotent) | `db.js:278` |
| `validateSketchInput(body)` | function | Validate sketch payload | `validators.js:91` |
| `validateUUID(id)` | function | UUID v4 regex check | `validators.js:81` |

### 14.3 Database Operations (`api/_lib/db.js`)

| object_id | Type | Purpose | Line |
|---|---|---|---|
| `getSketchesByUser(userId, opts)` | function | User's sketches (paginated) | 304 |
| `getSketchById(id, userId)` | function | Single sketch (owner filtered) | 336 |
| `getSketchByIdAdmin(id)` | function | Sketch with owner info (no filter) | 350 |
| `createSketch(userId, data)` | function | INSERT sketch | 529 |
| `updateSketch(id, userId, data)` | function | UPDATE with optimistic locking | 575 |
| `acquireSketchLock(id, userId, username)` | function | Atomic lock acquire (30-min expiry) | 377 |
| `releaseSketchLock(id, userId)` | function | Release lock if held | 427 |
| `getOrCreateUser(userId, data)` | function | Upsert user record | 667 |
| `getAllOrganizations()` | function | Orgs with user_count | 783 |
| `createProject(orgId, data)` | function | INSERT project | 908 |
| `getFeatures(targetType, targetId)` | function | Feature flags with defaults | 1125 |
| `getEffectiveFeatures(userId, orgId)` | function | Cascaded org → user features | 1150 |
| `getIssueComments(sketchId, nodeId, opts)` | function | Comments ordered by date | 1327 |
| `addIssueComment(sketchId, nodeId, userId, ...)` | function | INSERT comment | 1342 |
| `createIssueNotifications(...)` | function | Notify participants | 1370 |
| `getUnreadNotifications(userId)` | function | Unread with comment content | 1409 |

### 14.4 Database Tables

| Table | Key Columns | Purpose |
|---|---|---|
| `organizations` | id, name | Organization entities |
| `projects` | id, organization_id, name, input_flow_config, target_km | Project entities |
| `sketches` | id, user_id, nodes (JSONB), edges (JSONB), project_id, version, locked_by | Sketch data |
| `users` | id, username, email, role, organization_id | User records |
| `user_features` | target_type, target_id, feature_key, enabled | Feature flags |
| `project_layers` | project_id, name, layer_type, geojson (JSONB), style | GIS layers |
| `issue_comments` | sketch_id, node_id, user_id, content | Issue comments |
| `issue_notifications` | user_id, sketch_id, comment_id, type, read | Notifications |
| `rate_limit_log` | ip, endpoint, created_at | Rate limiting |

---

## 15. MIDDLEWARE CHAIN (all routes except `/api/auth/*`)

```
1. handleCors(req, res)        → CORS + OPTIONS preflight
2. verifyCsrf(req, res)        → CSRF double-submit cookie
3. applyRateLimit(req, res)    → 100 req/min per IP
4. ensureDb()                  → Initialize tables
5. verifyAuth(request)         → Session check
6. Role-based access control   → Per-route RBAC
```

---

## 16. FIELD COMMANDER — `src/field-commander/`

Gamified field survey experience overlay — XP system, achievements, gestures, territory, panels.

### 16.1 fc-shell.js (Entry Point)

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `initFieldCommander()` | function | Initializes FC mode: builds shell DOM, wires orientation listener, starts sub-modules | exported | `buildShellDOM`, `activate`, `deactivate` |
| `isFieldCommanderActive()` | function | Check if FC mode is active | exported | `_active` |
| `activateFieldCommander()` | function | Enable FC shell, add `fc-mode` class to body | exported | `initXPTracker`, `initAchievements`, `initGestures`, `initTerritory` |
| `deactivateFieldCommander()` | function | Disable FC shell, cleanup | exported | all sub-modules |
| `#fcShell` | layout | Main FC overlay container | DOM | sub-panels |
| `#fcXpBar` | layout | XP progress bar | DOM | `xpTracker` |
| `#fcXpBadge` | layout | XP amount badge | DOM | `xpTracker.showFloatingXP` |
| `#fcLevelBadge` | layout | Current level badge | DOM | `xpTracker` |
| `#fcToolbar` | layout | FC action toolbar | DOM | action buttons |

### 16.2 fc-xp.js (XP System)

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `XPTracker` | class | XP tracking with combo multiplier system | 14 | `xpTracker` singleton |
| `xpTracker` | singleton | `xpTracker.award('node_placed')` — awards XP with combo | 103 | `XP_VALUES`, `initXPTracker` |
| `XP_VALUES` | constant | `{node_placed: 10, edge_drawn: 5, gps_captured: 25, issue_resolved: 50, ...}` | 18 | `award` |
| `COMBO_WINDOW_MS` | constant | 30000 (30s combo window) | 16 | combo multiplier |
| `initXPTracker()` | function | Wires menuEvents: `node:added`, `edge:added`, `gnss:captured`, etc. | 110 | `menuEvents` |
| `xpTracker.award(action)` | method | Award XP with combo (1 + comboCount * 0.2, max 2x) | 47 | `showFloatingXP` |
| `xpTracker.showFloatingXP(xp)` | method | Animate floating "+XP" badge | 82 | `#fcXpBadge` |
| `xpTracker.getLevel()` | method | Level from total XP (every 500 XP) | 94 | level calculation |

### 16.3 fc-achievements.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `initAchievements()` | function | Wires `node:added`, `sketch:complete`, `issues:allResolved`, gnss position | exported | `menuEvents`, `gnssState` |
| `showAchievement(type, icon, message)` | function | Toast with cooldown (5 min), daily dedup | internal | `COOLDOWN_MS`, `SHOWN_KEY` |
| Milestones | triggers | 10, 25, 50, 100 nodes → achievement toast | internal | `checkNodeMilestone` |

### 16.4 fc-gestures.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `initGestures()` | function | Swipe recognition on canvas for mode switching | exported | touch events |
| `handleSwipe(direction)` | function | Left=edge mode, right=node mode, up=undo, down=redo | internal | canvas touch |

### 16.5 fc-panels.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `initPanels()` | function | Setup FC info panels (XP stats, achievements list, territory map) | exported | `#fcInfoPanel` |
| `toggleFCPanel(panelId)` | function | Open/close FC sub-panels | exported | panel state |
| `renderXPStats()` | function | Render XP level, progress bar, recent awards | internal | `xpTracker` |

### 16.6 fc-territory.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `initTerritory()` | function | Territory claiming based on surveyed area | exported | GPS data |
| `updateTerritory(position)` | function | Expand claimed territory polygon | internal | `gnssState` |
| `renderTerritoryOverlay(ctx)` | function | Draw territory fill on canvas | internal | draw loop |

---

## 17. NOTIFICATIONS — `src/notifications/`

### notification-bell.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `initNotificationBell()` | function | Creates bell icon + dropdown, starts 60s polling | 18 | `#notifBell`, `#notifBadge`, `#notifDropdown` |
| `destroyNotificationBell()` | function | Clears interval, removes DOM | 49 | cleanup |
| `POLL_INTERVAL_MS` | constant | 60000 (60s polling) | 6 | `fetchCount` |
| `fetchCount()` | function | `GET /api/notifications?count=true` | 57 | badge update |
| `updateBadge(count)` | function | Show/hide count badge | 68 | `#notifBadge` |
| `toggleDropdown()` | function | Open/close notification dropdown | 78 | `openDropdown`, `closeDropdown` |
| `openDropdown()` | function | `GET /api/notifications`, render list, mark read | 91 | `renderNotifications` |
| `renderNotifications(notifications)` | function | Build HTML: header + item rows + "mark all read" btn | 109 | `#notifDropdown` |
| `#notifBell` | button | Bell icon with badge | DOM | header area |
| `#notifBadge` | layout | Unread count badge | DOM | `updateBadge` |
| `#notifDropdown` | layout | Notification list dropdown | DOM | `renderNotifications` |
| `#markAllReadBtn` | button | Mark all notifications as read | DOM | `POST /api/notifications {all: true}` |

---

## 18. WORKERS — `src/workers/`

### 18.1 worker-manager.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `postTask(type, payload)` | function | Send task to Web Worker; returns Promise with result | 68 | `getWorker`, `_pending` |
| `isWorkerAvailable()` | function | Check if Web Workers are supported | 86 | `typeof Worker` |
| `terminateWorker()` | function | Kill worker, clear pending tasks | 93 | `_worker`, `_pending` |
| `getWorker()` | function | Lazy-create singleton Worker from `data-processor.worker.js` | 19 | `_worker` |
| `_pending` | Map | `Map<requestId, {resolve, reject}>` — tracks in-flight tasks | 12 | message handler |

### 18.2 data-processor.worker.js

| object_id | Type | How/When | Line | Related |
|---|---|---|---|---|
| `computeEdgeLabels(data)` | function | Offload edge label position computation to worker | 48 | `edges`, `nodeMap`, measurement text |
| `buildSpatialIndex(data)` | function | Build spatial grid in worker thread | 113 | `nodes`, `cellSize`, `radius` |
| `computeDataBounds(data)` | function | Compute min/max bounds of all nodes | 140 | `nodes`, `stretchX/Y` |
| `validateSketchData(data)` | function | Validate node/edge integrity in worker | 161 | `nodes`, `edges` |
| `onmessage` handler | event | Dispatches `{type, payload}` to appropriate function | 1 | `postMessage` result back |

---

## 19. ADDITIONAL MAP ENTRIES — `src/map/`

### layers-config.js

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `initLayersConfig({canvasContainer, scheduleDraw, t, ...})` | function | Setup layers config button + floating panel | `layers-config.js:41` | `#layersConfigBtn` |
| `updateLayersPanel()` | function | Refresh panel after layers load | `layers-config.js:280` | `populatePanel` |
| `#layersConfigBtn` | button | Layers toggle in canvas toolbar | DOM | `togglePanel` |
| `#layersConfigPanel` | layout | Floating panel with layer toggles + map type | DOM | `populatePanel` |
| `#lc-map-toggle` | checkbox | Map tile toggle inside panel | DOM | `toggleMapLayer` |
| `#lc-map-type` | select | Orthophoto/street switcher | DOM | `setMapType` |
| `#lc-ref-toggle` | checkbox | Global ref layers toggle | DOM | `setRefLayersEnabled` |

### street-view.js

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `initStreetView({canvasContainer, canvas, ...})` | function | Setup pegman drag-and-drop | `street-view.js:247` | `createPegmanElements` |
| `setStreetViewVisible(bool)` | function | Show/hide pegman when ref point available | `street-view.js:108` | `pegmanEl` |
| `#streetViewPegman` | layout | Draggable pegman widget | DOM | drag-and-drop to open Google Street View |

### user-location.js

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `requestLocationPermission()` | function | Request permission + single GPS fix | `user-location.js:72` | `currentPosition` |
| `startWatchingLocation(callback)` | function | Begin continuous GPS tracking | `user-location.js:120` | `watchPosition` |
| `stopWatchingLocation()` | function | Stop GPS tracking | `user-location.js:179` | `watchId` |
| `getCurrentPosition()` | function | Last known GPS position | `user-location.js:210` | `currentPosition` |
| `getCurrentPositionItm()` | function | Last position in ITM coords | `user-location.js:218` | `wgs84ToItm` |
| `calculateCenterOnUser(position, ...)` | function | ViewTranslate to center on user | `user-location.js:341` | `wgs84ToItm` |
| `drawUserLocationMarker(ctx, ...)` | function | Blue dot + accuracy circle + heading | `user-location.js:251` | canvas rendering |
| `toggleLocation(callback)` | function | Toggle location on/off | `user-location.js:394` | `isLocationEnabled` |

### project-loading-overlay.js

| object_id | Type | How/When | File:Line | Related |
|---|---|---|---|---|
| `showProjectLoadingOverlay()` | function | Full-screen loading overlay with steps | `project-loading-overlay.js:117` | project load |
| `updateLoadingStep(stepId, state, detail?)` | function | Update step: pending/loading/done/error | `project-loading-overlay.js:164` | progress bar |
| `hideProjectLoadingOverlay()` | function | Fade-out (300ms) and hide | `project-loading-overlay.js:176` | cleanup |
| `STEPS` | constant | sketches(40%), layers(20%), canvas(30%), tiles(10%) | `project-loading-overlay.js:18` | weighted progress |
| `#projectLoadingOverlay` | layout | Overlay container | DOM | loading UI |
| `#projectLoadingBarFill` | layout | Progress bar fill | DOM | weighted % |

---

## 20. FIELD STEPPER — `src/field-stepper/field-stepper.js`

Full-screen one-field-per-screen data entry overlay for a node + its edge depths (~10-12 taps vs ~24-26 in the legacy drawer). Additive — the legacy details drawer is untouched. Screen sequence: `[CONNECT?] → field screens → DEPTHS → COMPLETION` (`getScreenSequence()`, field-stepper.js:301).

| object_id | Type | How/When | Where | Related |
|---|---|---|---|---|
| `initFieldStepper()` | function | Build overlay DOM once at app init (main-entry.js) | field-stepper.js:917 | `ensureOverlay` |
| `openFieldStepper(node, {startField?})` | function | Open stepper for a node; blocked when `window.__sketchReadOnly`; opens on CONNECT screen if a live suggestion is pending | field-stepper.js:926 | `computeFieldOrder`, `validatePendingConnect` |
| `closeFieldStepper()` | function | Close overlay (also Escape key) | field-stepper.js:945 | overlay state |
| `isFieldStepperOpen()` | function | Check overlay open state | field-stepper.js:950 | — |
| `getOpenStepperNodeId()` | function | ID of the node currently being edited (or null) | field-stepper.js:954 | TSC3 handlers |
| `notifyStepperOfExternalNodeUpdate(node, pointName)` | function | TSC3 arrival hook (tsc3-handlers.js): closed → open fresh; same node → targeted header refresh only (no focus hijack); other node → actionable switch-to snackbar | field-stepper.js:968 | `handleTSC3PointReceived`, `showSnackbar` (§24) |
| `setPendingConnectSuggestion(nodeId, suggestion)` | function | Queue a CONNECT screen for the node (falsy clears); re-renders live CONNECT screen on re-measure | field-stepper.js:280 | connection-suggest (§22) |
| `getPendingConnectSuggestion(nodeId)` | function | Read pending suggestion | field-stepper.js:296 | — |
| `CONNECT` screen | screen type | Prepended to the sequence when an ambiguous connection decision is pending (wizard Phase 1, spec §B3/B3a/B3b/B4b); direction cards via `connectDirCard()`, flip applies `F.reverseEdge(edgeId, {directionSource: 'terrain'})` | field-stepper.js:713 (`renderConnectScreen`), 668 (`resolveConnect`) | `reverseEdge` (graph-crud.js:221) |
| `window.__openFieldStepper` | global | Non-module access to `openFieldStepper` | field-stepper.js:989 | legacy callers |

---

## 21. GRADIENT ENGINE — `src/features/gradient-engine.js`

Live pipe-slope intelligence: computes the hydraulic gradient of every edge (flow = tail→head) the moment data arrives and alerts on uphill segments. Basis `'invert'` (elevations + both depths, authoritative) or `'terrain'` (elevations only, early warning). Statuses: `'negative'` / `'low'` / `'ok'` / `'unknown'` / `'exempt'`. Alerts fire only on status transitions per edge.

| object_id | Type | How/When | Where | Related |
|---|---|---|---|---|
| `MIN_SLOPE_PCT` | constant (0.3) | Minimum acceptable slope % before a `'low'` warning (invert basis) | gradient-engine.js:30 | `computeEdgeGradient` |
| `GRADIENT_EXEMPT_TYPES` | constant (Set: Home, ForLater, Issue) | Edges touching these node types return `'exempt'` (laterals legitimately rise) | gradient-engine.js:36 | — |
| `elevationOf(node)` | function | Node elevation (surveyZ) or null | gradient-engine.js:39 | — |
| `edgeLengthM(tailNode, headNode, coordinateScale)` | function | Edge length in meters (canvas dist / coordinateScale) | gradient-engine.js:53 | — |
| `computeEdgeGradient(edge, nodeById, coordinateScale)` | function | Pure gradient computation → `{status, basis, drop, slopePct, lengthM}` | gradient-engine.js:81 | connection-suggest (§22) |
| `evaluateEdge(edgeOrId, {notify})` | function | Compute + transition-gated alert (uphill snackbar with pan-to-edge action) | gradient-engine.js:242 | `notifyFor`, snackbar (§24) |
| `onMeasurementApplied(nodeId)` / `onEdgeCreated(edgeOrId)` / `onDepthChanged(edgeOrId, delayMs)` / `onEdgeDeleted(edgeOrId)` | functions | Event hooks called by graph-crud / TSC3 / GNSS / details paths | gradient-engine.js:287/296/301/319 | legacy modules |
| `recheckAll({notify})` / `getAlerts()` / `resetGradientState()` | functions | Bulk recheck, current alerts, clear per-sketch transition memory (called on sketch switch) | gradient-engine.js:331/336/348 | `window.__setActiveSketchData` |
| `window.__gradientEngine` | global | Bridge for legacy modules and e2e tests (`compute`, `evaluateEdge`, `reset`, …) | gradient-engine.js:356 | all exports |

---

## 22. CONNECTION SUGGEST — `src/features/connection-suggest.js`

Z-aware auto-connect decision engine (pure logic, no DOM) for GNSS/TSC3 measurement chains — decides how a newly measured node should connect to the previous one (docs/SMART_MEASUREMENT_WIZARD.md §B).

| object_id | Type | How/When | Where | Related |
|---|---|---|---|---|
| `FLAT_TOL_M` | constant (0.05) | Elevation delta below which terrain is "flat" (no direction evidence) | connection-suggest.js:33 | `terrainEvidence` |
| `LONG_EDGE_THRESHOLD_M` | constant (70) | Edges longer than this get `'ask'` instead of auto-connect | connection-suggest.js:35 | `suggestChainConnection` |
| `findEdgeBetween(edges, aId, bId)` | function | Existing edge between two nodes (either direction) | connection-suggest.js:38 | — |
| `suggestChainConnection(newNode, prevNode, {edges, coordinateScale})` | function | Returns a suggestion object; kinds: `'none'` (no action), `'exists'` (edge already there, correct direction), `'flip-offer'` (existing edge runs uphill — offer reverse), `'auto'` (confident downhill connect), `'auto-home'` (Home↔Manhole lateral, fixed direction), `'ask'` (ambiguous — CONNECT screen) | connection-suggest.js:72 | `computeEdgeGradient` (§21), CONNECT screen (§20) |

---

## 23. MEASUREMENT HISTORY — `src/utils/measurement-history.js`

Append-only per-node field measurement history: every TSC3 shot / GNSS capture / coordinate import appends to `node.measurements` (persisted verbatim inside the sketches.nodes JSONB — no schema change). Entries keep full float precision; `elevation` is `null` when not measured (never 0). Active measurement stays surveyX/surveyY/surveyZ.

| object_id | Type | How/When | Where | Related |
|---|---|---|---|---|
| `MEASUREMENT_HISTORY_CAP` | constant (20) | Cap policy: history trimmed to 20 entries keeping the original (first) + most recent | measurement-history.js:35 | `appendMeasurement` |
| `buildMeasurementEntry(data)` | function | Normalize raw capture into an entry (`source`: 'tsc3'/'gnss'/'import'/'legacy'/'unknown') | measurement-history.js:48 | — |
| `appendMeasurement(node, data, {cap})` | function | Append entry to `node.measurements` (dedup by key, cap-20) — call on every field capture | measurement-history.js:84 | TSC3/GNSS/import paths |
| `backfillMeasurementFromNode(node)` | function | Seed history from a node's existing active measurement (legacy data) | measurement-history.js:110 | migration |
| `sanitizeMeasurements(node)` | function | Validate/repair a node's history array | measurement-history.js:132 | load paths |
| `mergeMeasurementHistories(localNodes, serverNodes, {cap})` | function | Union per-node histories — used by ALL four sync 409-conflict branches so conflict resolution never drops field shots | measurement-history.js:151 | sync-service (§2.6) |

---

## 24. SNACKBAR — `src/ui/snackbar.js`

Action-capable snackbar/toast system; claims `window.showToast` before `utils/toast.js` loads, so every legacy `showToast` call site is upgraded transparently.

| object_id | Type | How/When | Where | Related |
|---|---|---|---|---|
| `showSnackbar(opts)` | function | `{message, variant, channel, duration, actions: [{label, primary, onClick}]}` — queued, channel-deduped | snackbar.js:74 | field-stepper, gradient-engine |
| `showStatus(message, channel)` | function | Lightweight status line (default channel 'status') | snackbar.js:290 | — |
| `showToast(message, variantOrDuration, durationMs)` | function | Drop-in replacement for the legacy toast API | snackbar.js:306 | legacy call sites |
| `window.showToast` / `window.showSnackbar` / `window.showStatus` | globals | Claimed at import time if not already defined | snackbar.js:320-323 | main-entry load order |

---

*Total objects cataloged: ~2250+ across 95+ files. Section 1 file:line references verified against the modularized `src/legacy/` on 2026-07-20; other sections' line numbers may drift — trust file attribution over exact lines.*
