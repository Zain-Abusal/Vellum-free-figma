/** Color picking. */
import { S, notifyMsg } from './shared';
import { setProps } from './selection';

export async function eyedropper() {
  const s = S();
  const ED = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
  if (!ED) return notifyMsg('Your browser does not support the eyedropper (try Chrome or Edge).');
  try {
    const { sRGBHex } = await new ED().open();
    const hex = sRGBHex.startsWith('#') ? sRGBHex.toLowerCase() : '#' + (sRGBHex.match(/\d+/g) ?? []).slice(0, 3).map((v) => (+v).toString(16).padStart(2, '0')).join('');
    if (s.selection.length) setProps(s.selection, { fill: hex, gradient: null, fillStyleId: undefined });
    else {
      navigator.clipboard?.writeText(hex).catch(() => undefined);
      notifyMsg(`Picked ${hex.toUpperCase()} (copied)`);
    }
  } catch {
    /* cancelled */
  }
}
