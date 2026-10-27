/** Frame size presets. */
import { bbox, getPage, insert, isFrameLike, makeNode, resizeTo } from '../doc';
import { S } from './shared';
import { worldCenter, zoomToBox } from './camera';

export const FRAME_PRESETS: { group: string; items: [string, number, number][] }[] = [
  { group: 'Phone', items: [['iPhone 16', 393, 852], ['iPhone 16 Pro Max', 440, 956], ['iPhone SE', 375, 667], ['Android Compact', 412, 917], ['Android Medium', 700, 840]] },
  { group: 'Tablet', items: [['iPad mini', 744, 1133], ['iPad Pro 11"', 834, 1194], ['iPad Pro 13"', 1032, 1376], ['Surface Pro', 912, 1368]] },
  { group: 'Desktop', items: [['Desktop', 1440, 1024], ['MacBook Air', 1280, 832], ['MacBook Pro 14"', 1512, 982], ['HD', 1920, 1080], ['Wireframe', 1440, 900]] },
  { group: 'Watch', items: [['Watch 45mm', 198, 242], ['Watch 41mm', 176, 215]] },
  { group: 'Social', items: [['Instagram post', 1080, 1350], ['Instagram story', 1080, 1920], ['X post', 1200, 675], ['LinkedIn post', 1200, 1200], ['YouTube thumbnail', 1280, 720], ['Facebook cover', 820, 312]] },
  { group: 'Paper', items: [['A4', 595, 842], ['A5', 420, 595], ['Letter', 612, 792], ['Tabloid', 792, 1224]] },
  { group: 'Slides', items: [['Slide 16:9', 1920, 1080], ['Slide 4:3', 1024, 768]] },
];

/** Insert a frame preset to the right of existing top-level content (or resize the selected frame). */
export function insertFramePreset(name: string, w: number, h: number) {
  const s = S();
  const sel = s.selection.length === 1 ? s.doc.nodes[s.selection[0]] : null;
  if (sel && isFrameLike(sel) && !sel.section) {
    s.update((d) => resizeTo(d, sel.id, { x: sel.x, y: sel.y, w, h }));
    return;
  }
  const top = getPage(s.doc, s.pageId).children.map((id) => s.doc.nodes[id]).filter(Boolean);
  const b = bbox(top);
  const x = b ? Math.round(b.x + b.w + 100) : Math.round(worldCenter().x - w / 2);
  const y = b ? Math.round(b.y) : Math.round(worldCenter().y - h / 2);
  let id = '';
  s.update((d) => {
    const n = makeNode('frame', s.pageId, { name, x, y, w, h });
    insert(d, n, null);
    id = n.id;
  });
  s.set({ selection: [id], tool: 'select' });
  zoomToBox({ x, y, w, h }, 1);
}
