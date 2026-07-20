/**
 * Unit tests for language retranslation of the unified toolbar and sidebar.
 *
 * These components render their labels at init and must re-translate when the
 * language switches. Two triggers are covered:
 *   1. the `appLanguageChanged` document event (primary path), and
 *   2. a MutationObserver on `<html lang>` (fallback for switch paths that
 *      never dispatch the event, e.g. the auth-screen toggle).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { i18n, createTranslator } from '../../src/i18n.js';
import { initUnifiedToolbar, destroyUnifiedToolbar } from '../../src/layout/unified-toolbar.js';
import { initUnifiedSidebar, destroyUnifiedSidebar } from '../../src/layout/unified-sidebar.js';

declare global {
  interface Window {
    currentLang?: string;
    t?: (key: string, ...args: unknown[]) => any;
  }
}

/** Flush MutationObserver microtasks (+ a macrotask for safety). */
async function flushObservers() {
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

function setLanguage(lang: 'he' | 'en') {
  window.currentLang = lang;
  document.documentElement.lang = lang;
}

beforeEach(() => {
  // Same translator wiring as main-entry.js
  window.currentLang = 'he';
  window.t = createTranslator(i18n, () => (window.currentLang === 'en' ? 'en' : 'he'));
  document.documentElement.lang = 'he';
  document.body.innerHTML = `
    <div id="main">
      <div id="canvasContainer"></div>
      <div id="sidebar"></div>
    </div>
  `;
});

afterEach(() => {
  destroyUnifiedToolbar();
  destroyUnifiedSidebar();
  document.body.innerHTML = '';
});

describe('unified toolbar retranslation', () => {
  const nodeLabel = () => document.querySelector('#utNodeBtn .ut-btn__label')?.textContent;
  const edgeLabel = () => document.querySelector('#utEdgeBtn .ut-btn__label')?.textContent;
  const gpsLabel = () => document.querySelector('#utLocationBtn .ut-btn__label')?.textContent;

  it('renders Hebrew labels at init', () => {
    initUnifiedToolbar();
    expect(nodeLabel()).toBe(i18n.he.modeNode);
    expect(edgeLabel()).toBe(i18n.he.modeEdge);
    expect(gpsLabel()).toBe(i18n.he.location.myLocation);
  });

  it('re-translates labels on appLanguageChanged (he→en)', () => {
    initUnifiedToolbar();
    setLanguage('en');
    document.dispatchEvent(new Event('appLanguageChanged'));
    expect(nodeLabel()).toBe(i18n.en.modeNode);
    expect(edgeLabel()).toBe(i18n.en.modeEdge);
    expect(gpsLabel()).toBe(i18n.en.location.myLocation);
  });

  it('re-translates labels on appLanguageChanged (en→he)', () => {
    setLanguage('en');
    initUnifiedToolbar();
    expect(nodeLabel()).toBe(i18n.en.modeNode);
    setLanguage('he');
    document.dispatchEvent(new Event('appLanguageChanged'));
    expect(nodeLabel()).toBe(i18n.he.modeNode);
    expect(edgeLabel()).toBe(i18n.he.modeEdge);
  });

  it('re-translates via the <html lang> observer when no event is dispatched', async () => {
    initUnifiedToolbar();
    setLanguage('en'); // attribute mutation only — no appLanguageChanged
    await flushObservers();
    expect(nodeLabel()).toBe(i18n.en.modeNode);
    expect(gpsLabel()).toBe(i18n.en.location.myLocation);
  });

  it('re-translates flyout node-type labels too', () => {
    initUnifiedToolbar();
    setLanguage('en');
    document.dispatchEvent(new Event('appLanguageChanged'));
    const flyoutLabels = [...document.querySelectorAll('#utNodeFlyout .ut-btn__label')].map(
      (el) => el.textContent
    );
    expect(flyoutLabels).toContain(i18n.en.modeNode);
    expect(flyoutLabels).toContain(i18n.en.modeHome);
    expect(flyoutLabels).toContain(i18n.en.modeDrainage);
  });

  it('cleans up listeners on destroy and can re-init in the new language', async () => {
    initUnifiedToolbar();
    destroyUnifiedToolbar();
    expect(document.getElementById('unifiedToolbar')).toBeNull();
    // No stray observer/listener throws after destroy
    setLanguage('en');
    document.dispatchEvent(new Event('appLanguageChanged'));
    await flushObservers();
    initUnifiedToolbar();
    expect(nodeLabel()).toBe(i18n.en.modeNode);
  });
});

describe('unified sidebar retranslation', () => {
  const tabLabels = () =>
    [...document.querySelectorAll('.unified-sidebar__tab-label')].map((el) => el.textContent);

  it('renders Hebrew tab labels at init', () => {
    initUnifiedSidebar();
    expect(tabLabels()).toEqual([
      i18n.he.sidebar.details,
      i18n.he.sidebar.status,
      i18n.he.sidebar.layers,
      i18n.he.sidebar.sketches,
    ]);
  });

  it('re-translates tab labels on appLanguageChanged (he→en)', () => {
    initUnifiedSidebar();
    setLanguage('en');
    document.dispatchEvent(new Event('appLanguageChanged'));
    expect(tabLabels()).toEqual([
      i18n.en.sidebar.details,
      i18n.en.sidebar.status,
      i18n.en.sidebar.layers,
      i18n.en.sidebar.sketches,
    ]);
  });

  it('re-translates tab labels on appLanguageChanged (en→he)', () => {
    setLanguage('en');
    initUnifiedSidebar();
    setLanguage('he');
    document.dispatchEvent(new Event('appLanguageChanged'));
    expect(tabLabels()).toEqual([
      i18n.he.sidebar.details,
      i18n.he.sidebar.status,
      i18n.he.sidebar.layers,
      i18n.he.sidebar.sketches,
    ]);
  });

  it('re-translates via the <html lang> observer when no event is dispatched', async () => {
    initUnifiedSidebar();
    setLanguage('en'); // attribute mutation only
    await flushObservers();
    expect(tabLabels()).toEqual([
      i18n.en.sidebar.details,
      i18n.en.sidebar.status,
      i18n.en.sidebar.layers,
      i18n.en.sidebar.sketches,
    ]);
  });

  it('rebuilds the Status tab content in the new language', () => {
    initUnifiedSidebar();
    setLanguage('en');
    document.dispatchEvent(new Event('appLanguageChanged'));
    const statusPanel = document.getElementById('us-panel-status');
    expect(statusPanel?.textContent).toContain(i18n.en.cockpit.health);
    expect(statusPanel?.textContent).toContain(i18n.en.cockpit.session);
  });

  it('skips redundant rebuilds when the language did not change', () => {
    initUnifiedSidebar();
    setLanguage('en');
    document.dispatchEvent(new Event('appLanguageChanged'));
    const statusPanel = document.getElementById('us-panel-status');
    const marker = document.createElement('span');
    marker.id = 'rebuildMarker';
    statusPanel?.appendChild(marker);
    // Same language again → dedupe must skip the innerHTML rebuild
    document.dispatchEvent(new Event('appLanguageChanged'));
    expect(document.getElementById('rebuildMarker')).not.toBeNull();
  });

  it('cleans up listeners on destroy and can re-init in the new language', async () => {
    initUnifiedSidebar();
    destroyUnifiedSidebar();
    expect(document.getElementById('unifiedSidebar')).toBeNull();
    setLanguage('en');
    document.dispatchEvent(new Event('appLanguageChanged'));
    await flushObservers();
    initUnifiedSidebar();
    expect(tabLabels()).toEqual([
      i18n.en.sidebar.details,
      i18n.en.sidebar.status,
      i18n.en.sidebar.layers,
      i18n.en.sidebar.sketches,
    ]);
  });
});
