/**
 * docs-screenshots.mjs — regenerate the tutorial screenshots in docs/tutorials/images/.
 *
 * Drives the local dev server (npm run dev, port 5173) with Playwright.
 * ALL /api requests are mocked (catch-all + specific routes), so nothing
 * touches the production backend and the demo data is fully deterministic.
 *
 * Usage:  npm run dev   (in another terminal)
 *         node scripts/docs-screenshots.mjs [sceneName ...]
 * With no args, every scene runs. Pass scene names to re-run a subset.
 */
import { chromium } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../docs/tutorials/images');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Demo data ────────────────────────────────────────────────────────────────
// A plausible gravity-sewer run: main line falling ~0.5 m per manhole,
// one branch, two home laterals, one drainage node. ITM coordinates are in
// the valid Israel TM Grid range; Z falls along the flow direction.

const BASE_X = 187300; // ITM easting
const BASE_Y = 668400; // ITM northing
const SCALE = 8; // canvas px per meter for seeded x/y (readable at zoomToFit)

function mh(id, dx, dy, z, extra = {}) {
  return {
    id: String(id),
    x: dx * SCALE,
    y: -dy * SCALE,
    note: '',
    material: 'בטון',
    coverDiameter: '50',
    type: 'type1',
    nodeType: 'Manhole',
    access: 1,
    accuracyLevel: 2,
    nodeEngineeringStatus: 1,
    maintenanceStatus: 1,
    surveyX: BASE_X + dx,
    surveyY: BASE_Y + dy,
    surveyZ: z,
    gnssFixQuality: 4,
    createdAt: '2026-07-19T08:30:00.000Z',
    createdBy: 'demo',
    ...extra,
  };
}

const DEMO_NODES = [
  mh(101, 0, 0, 42.8),
  mh(102, 38, -6, 42.31),
  mh(103, 74, -14, 41.76),
  mh(104, 108, -26, 41.2),
  mh(105, 140, -41, 40.63),
  // 106 is deliberately half-surveyed: the field-stepper scene opens on it so
  // the screenshot shows a chip-grid entry screen instead of the Note screen.
  mh(106, 170, -58, 40.05, { material: '', coverDiameter: '', maintenanceStatus: '' }),
  // branch joining at 104
  mh(201, 96, 22, 42.4),
  mh(202, 102, -2, 41.7),
  // home connections
  mh(301, 52, -34, 42.6, { nodeType: 'Home', coverDiameter: '' }),
  mh(302, 124, -64, 41.9, { nodeType: 'Home', coverDiameter: '' }),
  // drainage
  mh(401, 32, 20, 43.1, { nodeType: 'Drainage' }),
];

function edge(tail, head, tm, hm, dia = '200') {
  return {
    id: `e-${tail}-${head}`,
    tail: String(tail),
    head: String(head),
    isDangling: false,
    tail_measurement: tm,
    head_measurement: hm,
    fall_depth: '',
    fall_position: '',
    line_diameter: dia,
    edge_type: 'קו ראשי',
    material: 'PVC',
    maintenanceStatus: 0,
    engineeringStatus: 1,
    direction_source: 'terrain',
    createdAt: '2026-07-19T08:45:00.000Z',
    createdBy: 'demo',
  };
}

const DEMO_EDGES = [
  edge(101, 102, '1.42', '1.51'),
  edge(102, 103, '1.51', '1.63'),
  edge(103, 104, '1.63', '1.74', '250'),
  edge(104, 105, '1.74', '1.86', '250'),
  edge(105, 106, '1.86', '1.95', '250'),
  edge(201, 202, '1.28', '1.36'),
  edge(202, 104, '1.36', '1.74'),
  { ...edge(301, 103, '', ''), edge_type: 'קו משני', direction_source: 'user' },
  { ...edge(302, 105, '', ''), edge_type: 'קו משני', direction_source: 'user' },
];

const DEMO_SKETCH = {
  nodes: DEMO_NODES,
  edges: DEMO_EDGES,
  nextNodeId: 500,
  creationDate: '2026-07-19',
  sketchId: null,
  sketchName: 'Herzl St — demo survey',
  projectId: null,
  inputFlowConfig: null,
  lastEditedBy: 'demo',
  lastEditedAt: '2026-07-19T09:00:00.000Z',
};

const DEMO_LIBRARY = [
  {
    id: 'demo-1',
    name: 'Herzl St — demo survey',
    date: '2026-07-19',
    nodes: DEMO_NODES,
    edges: DEMO_EDGES,
    updatedAt: '2026-07-19T09:00:00.000Z',
  },
  {
    id: 'demo-2',
    name: 'Hana Senesh St',
    date: '2026-07-16',
    nodes: DEMO_NODES.slice(0, 4),
    edges: DEMO_EDGES.slice(0, 3),
    updatedAt: '2026-07-16T13:20:00.000Z',
  },
  {
    id: 'demo-3',
    name: 'Industrial zone — north',
    date: '2026-07-12',
    nodes: DEMO_NODES.slice(0, 2),
    edges: DEMO_EDGES.slice(0, 1),
    updatedAt: '2026-07-12T10:05:00.000Z',
  },
];

// ── Mock backend ─────────────────────────────────────────────────────────────

const DEMO_USER = { id: 'demo-user', name: 'Demo Surveyor', email: 'demo@geopoint.me' };
const DEMO_SESSION = {
  id: 'demo-session',
  userId: DEMO_USER.id,
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
};

async function mockApi(page, { role = 'user' } = {}) {
  const json = (body, status = 200) => ({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });

  // Catch-all FIRST (Playwright tries the most recently registered route first,
  // so specific handlers below win; this only catches the leftovers). Nothing
  // may ever fall through to the dev-server proxy → production.
  await page.route('**/api/**', (route) => {
    const method = route.request().method();
    if (method === 'GET') return route.fulfill(json({}));
    return route.fulfill(json({ success: true }));
  });

  await page.route('**/api/auth/**', (route) => {
    if (route.request().url().includes('get-session')) {
      return route.fulfill(json({ session: DEMO_SESSION, user: DEMO_USER }));
    }
    return route.fulfill(json({}));
  });

  await page.route('**/api/user-role**', (route) =>
    route.fulfill(
      json({
        role,
        isAdmin: role !== 'user',
        isSuperAdmin: role === 'super_admin',
        permissions: role === 'user' ? ['read', 'write'] : ['read', 'write', 'admin'],
        features: {
          export_csv: true,
          export_sketch: true,
          admin_settings: role !== 'user',
          finish_workday: true,
          node_types: true,
          edge_types: true,
        },
      })
    )
  );

  await page.route('**/api/sketches**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill(json({ sketches: [], pagination: { total: 0 } }));
    }
    return route.fulfill(json({ success: true }));
  });

  await page.route('**/api/projects**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill(json({ projects: [], orphanCount: 0 }));
    }
    return route.fulfill(json({ success: true }));
  });

  await page.route('**/api/notifications**', (route) =>
    route.fulfill(json({ notifications: [], count: 0 }))
  );

  if (role !== 'user') {
    await page.route('**/api/users**', (route) =>
      route.fulfill(
        json({
          users: [
            { id: 'demo-user', name: 'Demo Surveyor', email: 'demo@geopoint.me', role: 'user' },
            { id: 'demo-admin', name: 'Site Manager', email: 'manager@geopoint.me', role: 'admin' },
          ],
          pagination: { total: 2 },
        })
      )
    );
    await page.route('**/api/organizations**', (route) =>
      route.fulfill(json({ organizations: [{ id: 'org-1', name: 'Geopoint' }] }))
    );
  }
}

// ── Page setup ───────────────────────────────────────────────────────────────

async function newPage(browser, opts = {}) {
  const {
    viewport = { width: 1280, height: 800 },
    sketch = DEMO_SKETCH,
    // IMPORTANT: when the library is non-empty, init() renders the home panel
    // and never loads the current sketch (main.js init flow) — so canvas
    // scenes must run with an EMPTY library and rely on the seeded sketch.
    library = [],
    role = 'user',
    dark = false,
    lang = 'en',
  } = opts;

  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
    colorScheme: dark ? 'dark' : 'light',
  });
  const page = await context.newPage();
  await mockApi(page, { role });

  await page.addInitScript(
    ({ sketch, library, dark, lang }) => {
      localStorage.setItem('graphSketch.lang', lang);
      localStorage.setItem('graphSketch.autosave', 'false');
      localStorage.setItem('graphSketch.autoSize', 'true');
      localStorage.setItem('dark_mode_preference', dark ? 'dark' : 'light');
      if (sketch) localStorage.setItem('graphSketch', JSON.stringify(sketch));
      else localStorage.removeItem('graphSketch');
      if (library) localStorage.setItem('graphSketch.library', JSON.stringify(library));
    },
    { sketch, library, dark, lang }
  );

  return { context, page };
}

async function waitForCanvas(page) {
  await page.locator('#authLoadingOverlay').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
  await page.waitForFunction(
    () => {
      const c = document.getElementById('graphCanvas');
      return c && c.width > 0 && c.height > 0;
    },
    { timeout: 20000 }
  );
  // init() finishes well after the canvas gets dimensions in Vite dev mode —
  // the window hooks (and the loaded sketch) only exist once it completes.
  await page
    .waitForFunction(() => typeof window.__setViewState === 'function', { timeout: 15000 })
    .catch(() => {});
  // Re-apply the UI language after init: some components render their labels
  // before the language preference is applied.
  await page.evaluate(() => {
    const sel = document.getElementById('langSelect');
    if (sel && sel.value !== 'en') {
      sel.value = 'en';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.waitForTimeout(600);
}

async function dismissPanels(page) {
  await page.evaluate(() => {
    for (const id of ['homePanel', 'startPanel']) {
      const el = document.getElementById(id);
      if (el) {
        el.classList.remove('panel-closing');
        el.style.display = 'none';
      }
    }
  });
  await page.waitForTimeout(300);
}

/**
 * Push the demo network into the live app state.
 *
 * Seeding localStorage alone is not enough: the initial loadFromStorage()
 * result is clobbered once the (mocked, empty) cloud sync settles. The
 * project-canvas switching hook __setActiveSketchData() loads data into the
 * live globals reliably, after which panels must be dismissed again (the
 * sync pass can re-open the home dialog).
 */
async function injectSketch(page, sketch = DEMO_SKETCH) {
  await page.evaluate((s) => {
    window.__setActiveSketchData?.({
      nodes: s.nodes,
      edges: s.edges,
      sketchId: null,
      sketchName: s.sketchName,
      projectId: null,
    });
    window.__scheduleDraw?.();
  }, sketch);
  await page.waitForTimeout(500);
  await dismissPanels(page);
}

async function zoomToFit(page) {
  await page.evaluate(() => {
    window.zoomToFit?.();
    // Back off slightly so edge-of-network node labels aren't clipped.
    const v = window.getViewState?.();
    if (v?.viewScale) window.setZoom?.(v.viewScale * 0.86);
  });
  await page.waitForTimeout(400);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
  console.log(`  ✓ ${name}.png`);
}

// ── Scenes ───────────────────────────────────────────────────────────────────

const scenes = {
  /** Home panel with the sketch library. */
  async home(browser) {
    const { context, page } = await newPage(browser, { sketch: null, library: DEMO_LIBRARY });
    await page.goto(BASE_URL);
    await waitForCanvas(page);
    await page.locator('#homePanel').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(500);
    await shot(page, 'home-screen');

    // New-sketch dialog
    await page.evaluate(() => document.getElementById('createFromHomeBtn')?.click());
    await page.waitForTimeout(600);
    await shot(page, 'new-sketch-dialog');
    await context.close();
  },

  /** Empty canvas with toolbar + empty-state hint. */
  async emptyCanvas(browser) {
    const { context, page } = await newPage(browser, { sketch: null, library: [] });
    await page.goto(BASE_URL);
    await waitForCanvas(page);
    await dismissPanels(page);
    await page.waitForTimeout(500);
    await shot(page, 'empty-canvas');
    await context.close();
  },

  /** The demo network, fitted. */
  async network(browser) {
    const { context, page } = await newPage(browser);
    await page.goto(BASE_URL);
    await waitForCanvas(page);
    await dismissPanels(page);
    await injectSketch(page);
    await zoomToFit(page);
    await shot(page, 'canvas-network');

    // Heat-map completeness mode
    await page.evaluate(() => {
      document.body.classList.add('heatmap-active');
      window.__scheduleDraw?.();
    });
    await page.waitForTimeout(400);
    await shot(page, 'heatmap-mode');
    await page.evaluate(() => {
      document.body.classList.remove('heatmap-active');
      window.__scheduleDraw?.();
    });
    await context.close();
  },

  /** Details drawer for a selected node (click on the node). */
  async details(browser) {
    const { context, page } = await newPage(browser);
    await page.goto(BASE_URL);
    await waitForCanvas(page);
    await dismissPanels(page);
    await injectSketch(page);
    await zoomToFit(page);

    const pos = await page.evaluate(() => {
      const data = window.__getActiveSketchData?.();
      const n = (data?.nodes || []).find((x) => String(x.id) === '104');
      const v = window.getViewState?.();
      if (!n || !v || !v.viewTranslate) return null;
      return {
        sx: n.x * (v.viewStretchX ?? 1) * v.viewScale + v.viewTranslate.x,
        sy: n.y * (v.viewStretchY ?? 1) * v.viewScale + v.viewTranslate.y,
      };
    });
    if (!pos) throw new Error('node 104 position not resolved');
    const box = await page.locator('#graphCanvas').boundingBox();
    await page.mouse.click(box.x + pos.sx, box.y + pos.sy);
    await page.waitForTimeout(800);
    await shot(page, 'details-drawer');
    await context.close();
  },

  /** Field stepper overlay (one-field-per-screen data entry). */
  async fieldStepper(browser) {
    const { context, page } = await newPage(browser);
    await page.goto(BASE_URL);
    await waitForCanvas(page);
    await dismissPanels(page);
    await injectSketch(page);
    await zoomToFit(page);
    const opened = await page.evaluate(() => {
      const data = window.__getActiveSketchData?.();
      const n = (data?.nodes || []).find((x) => String(x.id) === '106');
      if (!n || !window.__openFieldStepper) return false;
      window.__openFieldStepper(n);
      return true;
    });
    if (!opened) throw new Error('field stepper hook unavailable');
    await page.waitForTimeout(800);
    await shot(page, 'field-stepper');
    await context.close();
  },

  /** Edge details drawer (click the 103→104 pipe midpoint). */
  async edgeDetails(browser) {
    const { context, page } = await newPage(browser);
    await page.goto(BASE_URL);
    await waitForCanvas(page);
    await dismissPanels(page);
    await injectSketch(page);
    await zoomToFit(page);
    const pos = await page.evaluate(() => {
      const data = window.__getActiveSketchData?.();
      const a = (data?.nodes || []).find((x) => String(x.id) === '103');
      const b = (data?.nodes || []).find((x) => String(x.id) === '104');
      const v = window.getViewState?.();
      if (!a || !b || !v?.viewTranslate) return null;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      return {
        sx: mx * (v.viewStretchX ?? 1) * v.viewScale + v.viewTranslate.x,
        sy: my * (v.viewStretchY ?? 1) * v.viewScale + v.viewTranslate.y,
      };
    });
    if (!pos) throw new Error('edge midpoint not resolved');
    const box = await page.locator('#graphCanvas').boundingBox();
    await page.mouse.click(box.x + pos.sx, box.y + pos.sy);
    await page.waitForTimeout(800);
    await shot(page, 'edge-details');
    await context.close();
  },

  /** Export dropdown menu. */
  async exportMenu(browser) {
    const { context, page } = await newPage(browser);
    await page.goto(BASE_URL);
    await waitForCanvas(page);
    await dismissPanels(page);
    await injectSketch(page);
    await zoomToFit(page);
    await page.evaluate(() => document.getElementById('exportMenuBtn')?.click());
    await page.waitForTimeout(500);
    await shot(page, 'export-menu');
    await context.close();
  },

  /** 3D underground view. */
  async threeD(browser) {
    const { context, page } = await newPage(browser);
    await page.goto(BASE_URL);
    await waitForCanvas(page);
    await dismissPanels(page);
    await injectSketch(page);
    await zoomToFit(page);
    await page.evaluate(() => document.getElementById('threeDViewBtn')?.click());
    // Three.js is dynamically imported — give it time to build the scene
    await page.waitForTimeout(6000);
    await shot(page, 'three-d-view');
    await context.close();
  },

  /** Mock GNSS live-measure marker + status. */
  async liveMeasure(browser) {
    const { context, page } = await newPage(browser);
    await page.goto(BASE_URL);
    await waitForCanvas(page);
    await dismissPanels(page);
    await injectSketch(page);
    await zoomToFit(page);
    const ok = await page.evaluate(async () => {
      const conn = window.__gnssConnection || window.gnssConnection;
      if (!conn) return false;
      await conn.connectMock();
      window.setLiveMeasureMode?.(true);
      return true;
    });
    if (!ok) throw new Error('gnss connection hook unavailable');
    await page.waitForTimeout(2500);
    await shot(page, 'live-measure-mock');
    await context.close();
  },

  /** TSC5 landscape (640×360) — the real field form factor with cockpit. */
  async tsc5(browser) {
    const { context, page } = await newPage(browser, {
      viewport: { width: 640, height: 360 },
    });
    await page.goto(BASE_URL);
    await waitForCanvas(page);
    await dismissPanels(page);
    await injectSketch(page);
    await zoomToFit(page);
    await page.waitForTimeout(1500);
    await shot(page, 'tsc5-landscape');
    await context.close();
  },

  /** Dark mode network view. */
  async darkMode(browser) {
    const { context, page } = await newPage(browser, { dark: true });
    await page.goto(BASE_URL);
    await waitForCanvas(page);
    await dismissPanels(page);
    await injectSketch(page);
    await zoomToFit(page);
    await shot(page, 'dark-mode');
    await context.close();
  },

  /** Admin panel (super_admin mocks). */
  async admin(browser) {
    const { context, page } = await newPage(browser, { role: 'super_admin' });
    await page.goto(BASE_URL);
    await waitForCanvas(page);
    await dismissPanels(page);
    await page.evaluate(() => {
      window.__markInternalNavigation?.();
      window.location.hash = '#/admin';
    });
    await page.waitForTimeout(2500);
    await shot(page, 'admin-panel');
    await context.close();
  },
};

// ── Runner ───────────────────────────────────────────────────────────────────

const requested = process.argv.slice(2);
const toRun = requested.length ? requested : Object.keys(scenes);

const browser = await chromium.launch();
let failed = 0;
for (const name of toRun) {
  if (!scenes[name]) {
    console.error(`✗ unknown scene: ${name}`);
    failed++;
    continue;
  }
  console.log(`▶ ${name}`);
  try {
    await scenes[name](browser);
  } catch (err) {
    console.error(`  ✗ ${name} failed: ${err.message}`);
    failed++;
  }
}
await browser.close();
console.log(failed ? `\n${failed} scene(s) failed` : '\nAll scenes captured.');
process.exit(failed ? 1 : 0);
