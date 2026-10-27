import type { Extension } from './types';

/**
 * Auto-discovers every extension in src/extensions/<folder>/index.ts (default export).
 * Folders starting with "_" (like _template) are skipped. Add a folder, rebuild, done.
 */
const modules = import.meta.glob<{ default: Extension }>('./*/index.ts', { eager: true });

export const extensions: Extension[] = Object.entries(modules)
  .filter(([path]) => !/\/_/.test(path))
  .map(([, m]) => m.default)
  .filter((e): e is Extension => !!e && typeof e.run === 'function' && !!e.id)
  .sort((a, b) => a.name.localeCompare(b.name));
