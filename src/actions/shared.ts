/** Shared helpers for editor commands. */
import { useStore } from '../store';

export const S = () => useStore.getState();

export function notifyMsg(message: string) {
  S().set({ toast: message });
  setTimeout(() => S().toast === message && S().set({ toast: null }), 3500);
}
