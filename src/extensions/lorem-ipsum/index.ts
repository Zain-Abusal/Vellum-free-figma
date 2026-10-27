import { defineExtension } from '../types';

const WORDS =
  'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(' ');

function lorem(words: number) {
  const out: string[] = [];
  for (let i = 0; i < words; i++) out.push(WORDS[(i * 7 + Math.floor(Math.random() * 5)) % WORDS.length]);
  const s = out.join(' ');
  return s[0].toUpperCase() + s.slice(1) + '.';
}

/** Like the popular "Lorem ipsum" plugin: fills text layers with placeholder copy. */
export default defineExtension({
  id: 'lorem-ipsum',
  name: 'Lorem Ipsum',
  description: 'Fill selected text layers with placeholder text (or create a new text layer).',
  icon: '¶',
  inputs: [
    { key: 'words', label: 'Words', type: 'number', default: 24, min: 1, max: 500 },
    { key: 'lineEvery', label: 'Line break every N words (0 = none)', type: 'number', default: 8, min: 0 },
  ],
  run(api, v) {
    const words = Number(v.words) || 24;
    const every = Number(v.lineEvery) || 0;
    const text = () => {
      const t = lorem(words);
      if (!every) return t;
      return t
        .split(' ')
        .map((w, i) => (i && i % every === 0 ? '\n' + w : w))
        .join(' ')
        .replace(/ \n/g, '\n');
    };
    const texts = api.selection().filter((n) => n.type === 'text');
    if (texts.length) {
      texts.forEach((n) => api.update(n.id, { text: text() }));
      return `Filled ${texts.length} text layer${texts.length > 1 ? 's' : ''}.`;
    }
    const c = api.viewportCenter();
    const id = api.create('text', { text: text(), x: Math.round(c.x - 150), y: Math.round(c.y), fontSize: 16, name: 'Lorem ipsum' });
    api.select([id]);
  },
});
