/*
 * Stamps a unique APP_VERSION into dist/service-worker.js after every build.
 *
 * The service worker's cache names are keyed by APP_VERSION. Historically the
 * version was a hand-bumped literal ('v147') and forgetting the bump left
 * phones on stale-while-revalidate-cached JS indefinitely. Now every build
 * gets a version derived from the git commit, so every deploy invalidates the
 * shell cache automatically. The literal in public/service-worker.js remains
 * as the dev-server fallback only.
 *
 * Runs from frontend/ (chained after `vite build` in the root build script).
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const SW_PATH = new URL('../dist/service-worker.js', import.meta.url);

function resolveVersion() {
  // Vercel builds may not have a .git dir, but always set this env var.
  const vercelSha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (vercelSha) return vercelSha.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return Date.now().toString(36);
  }
}

const version = `v-${resolveVersion()}`;
const source = readFileSync(SW_PATH, 'utf8');
const stamped = source.replace(
  /const APP_VERSION = '[^']+';/,
  `const APP_VERSION = '${version}';`
);

if (stamped === source) {
  console.error('stamp-sw-version: APP_VERSION literal not found in dist/service-worker.js');
  process.exit(1);
}

writeFileSync(SW_PATH, stamped);
console.log(`stamp-sw-version: service worker stamped as ${version}`);
