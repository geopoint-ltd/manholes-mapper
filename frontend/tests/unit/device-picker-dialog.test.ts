/**
 * Unit tests for the Device Picker Dialog.
 *
 * Focus: the dialog must never throw on a missing/empty device list — the
 * cockpit's TSC3 rail button used to call it with no arguments at all, which
 * blew up on `devices.map(...)` and left the button dead on click.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openDevicePickerDialog } from '../../src/survey/device-picker-dialog.js';

const DIALOG_ID = 'devicePickerDialog';

function getDialog(): HTMLElement {
  const el = document.getElementById(DIALOG_ID);
  expect(el).not.toBeNull();
  return el!;
}

describe('openDevicePickerDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  describe('missing / empty device list', () => {
    it('should not throw when called with no arguments', () => {
      expect(() => openDevicePickerDialog()).not.toThrow();
    });

    it('should render the dialog with an empty state and no device buttons', () => {
      openDevicePickerDialog();

      const dialog = getDialog();
      expect(dialog.querySelectorAll('.device-picker-btn')).toHaveLength(0);
      expect(dialog.querySelector('.device-picker-empty')?.textContent).toBe('No devices found');
    });

    it('should use the translator for the empty state when one is given', () => {
      const t = (key: string) => (key === 'survey.noDevicesFound' ? 'לא נמצאו מכשירים' : key);
      openDevicePickerDialog([], t);

      expect(getDialog().querySelector('.device-picker-empty')?.textContent).toBe('לא נמצאו מכשירים');
    });

    it('should stay dismissable via cancel and resolve with null', async () => {
      const promise = openDevicePickerDialog();

      (getDialog().querySelector('.device-picker-cancel') as HTMLElement).click();

      await expect(promise).resolves.toBeNull();
    });

    it('should resolve with null on Escape', async () => {
      const promise = openDevicePickerDialog(undefined, undefined);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      await expect(promise).resolves.toBeNull();
    });

    it('should treat a non-array argument as empty rather than throwing', () => {
      expect(() => openDevicePickerDialog(null as never)).not.toThrow();
      expect(getDialog().querySelectorAll('.device-picker-btn')).toHaveLength(0);
    });
  });

  describe('populated device list', () => {
    const devices = [
      { name: 'Trimble TSC3', address: '00:11:22:33:44:55', isSurvey: true },
      { name: '', address: 'AA:BB:CC:DD:EE:FF' },
    ];

    it('should render one button per device with no empty state', () => {
      openDevicePickerDialog(devices);

      const dialog = getDialog();
      const btns = dialog.querySelectorAll('.device-picker-btn');
      expect(btns).toHaveLength(2);
      expect(dialog.querySelector('.device-picker-empty')).toBeNull();

      expect(btns[0].querySelector('.device-picker-name')?.textContent).toBe('Trimble TSC3');
      expect(btns[0].classList.contains('is-survey')).toBe(true);
      // Falls back to the address when the device reports no name.
      expect(btns[1].querySelector('.device-picker-name')?.textContent).toBe('AA:BB:CC:DD:EE:FF');
    });

    it('should resolve with the chosen device', async () => {
      const promise = openDevicePickerDialog(devices);

      (getDialog().querySelectorAll('.device-picker-btn')[1] as HTMLElement).click();

      await expect(promise).resolves.toEqual(devices[1]);
    });
  });
});
