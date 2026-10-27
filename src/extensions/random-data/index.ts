import { defineExtension } from '../types';

const FIRST = ['Ava', 'Liam', 'Noah', 'Mia', 'Omar', 'Layla', 'Yusuf', 'Sofia', 'Ethan', 'Aisha', 'Lucas', 'Zara', 'Mateo', 'Hana', 'Leo', 'Nora'];
const LAST = ['Khan', 'Garcia', 'Smith', 'Haddad', 'Chen', 'Silva', 'Novak', 'Okafor', 'Rossi', 'Tanaka', 'Müller', 'Ali', 'Martin', 'Kim'];
const CITIES = ['Dubai', 'London', 'Tokyo', 'São Paulo', 'Lagos', 'Berlin', 'Toronto', 'Mumbai', 'Sydney', 'Cairo', 'Seoul', 'Madrid'];
const COMPANIES = ['Northwind', 'Lumen Labs', 'Bluepeak', 'Orbit & Co', 'Fable Studio', 'Kite Systems', 'Atlas Foods', 'Verde Energy'];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

const GEN: Record<string, () => string> = {
  name: () => `${pick(FIRST)} ${pick(LAST)}`,
  first: () => pick(FIRST),
  email: () => `${pick(FIRST).toLowerCase()}.${pick(LAST).toLowerCase().replace(/[^a-z]/g, '')}@example.com`,
  phone: () => `+1 (${100 + Math.floor(Math.random() * 900)}) ${100 + Math.floor(Math.random() * 900)}-${1000 + Math.floor(Math.random() * 9000)}`,
  city: () => pick(CITIES),
  company: () => pick(COMPANIES),
  date: () => new Date(Date.now() - Math.random() * 3e10).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
  price: () => `$${(Math.random() * 500 + 5).toFixed(2)}`,
  number: () => String(Math.floor(Math.random() * 10000)),
  percent: () => `${(Math.random() * 100).toFixed(1)}%`,
};

/** Like "Content Reel": fill text layers with realistic sample data. */
export default defineExtension({
  id: 'random-data',
  name: 'Random Data',
  description: 'Fill selected text layers with names, emails, cities, dates, prices…',
  icon: '🎲',
  needsSelection: true,
  inputs: [
    {
      key: 'kind',
      label: 'Data',
      type: 'select',
      default: 'name',
      options: Object.keys(GEN).map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) })),
    },
  ],
  run(api, v) {
    const gen = GEN[String(v.kind)] ?? GEN.name;
    const all = api.selection().flatMap((n) => (n.type === 'text' ? [n] : api.pageNodes().filter((m) => m.type === 'text' && isDesc(m.parentId, n.id, api.get))));
    all.forEach((t) => api.update(t.id, { text: gen() }));
    return all.length ? `Filled ${all.length} text layer${all.length > 1 ? 's' : ''}.` : 'Select text layers (or frames containing text).';
  },
});

function isDesc(p: string | null, anc: string, get: (id: string) => { parentId: string | null } | undefined) {
  while (p) {
    if (p === anc) return true;
    p = get(p)?.parentId ?? null;
  }
  return false;
}
