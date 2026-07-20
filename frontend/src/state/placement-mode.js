/**
 * Rapid placement mode.
 *
 * Dropping a manhole normally costs two taps on the TSC5: one to place the
 * node, one to dismiss the full-screen field stepper that opens on it (the
 * "close the create-edit gap" behaviour in pointer-handlers.js). That is the
 * right trade when the worker fills the node in there and then, and the wrong
 * one when laying out a run of ten and filling them in afterwards.
 *
 * With rapid placement on, creation skips the stepper — one tap, one manhole.
 * The node is still selected, so the details panel follows along and a later
 * tap opens the stepper as usual. The choice persists across reloads because a
 * surveyor who picked it at the start of a run should not lose it to a refresh.
 */
import { STORAGE_KEYS } from './persistence.js';

/** null until first read, then a boolean mirror of localStorage. */
let rapid = null;

export function isRapidPlacement() {
  if (rapid === null) {
    try {
      rapid = localStorage.getItem(STORAGE_KEYS.rapidPlacement) === '1';
    } catch (_) {
      rapid = false; // private mode / storage disabled
    }
  }
  return rapid;
}

/**
 * @param {boolean} on
 * @returns {boolean} the new state
 */
export function setRapidPlacement(on) {
  rapid = !!on;
  try {
    localStorage.setItem(STORAGE_KEYS.rapidPlacement, rapid ? '1' : '0');
  } catch (_) {
    /* keep the in-memory value — the toggle still works for this session */
  }
  document.dispatchEvent(new CustomEvent('rapidPlacementChanged', { detail: { rapid } }));
  return rapid;
}

export function toggleRapidPlacement() {
  return setRapidPlacement(!isRapidPlacement());
}
