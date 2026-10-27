/** Image import (downscaled so files stay small enough to sync). */
import { insert, makeNode, nextName } from '../doc';
import type { Pt } from '../types';
import { S } from './shared';
import { worldCenter } from './camera';
import { importSvg } from '../svgImport';

/** Reads an image, downscaling big photos so files stay small enough to sync and store. */
export function readImage(file: File): Promise<{ src: string; w: number; h: number }> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const src = r.result as string;
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || 300;
        const h = img.naturalHeight || 300;
        const vector = file.type === 'image/svg+xml' || file.type === 'image/gif';
        const k = Math.min(1, 1600 / Math.max(w, h));
        if (vector || (file.size < 300_000 && k === 1)) return res({ src, w, h });
        const c = document.createElement('canvas');
        c.width = Math.round(w * k);
        c.height = Math.round(h * k);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        res({ src: c.toDataURL('image/webp', 0.85), w, h });
      };
      img.onerror = rej;
      img.src = src;
    };
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

/** SVG markup → editable vector layers (like Figma's SVG import). */
export function importSvgText(text: string, at?: Pt, name?: string): boolean {
  const s = S();
  if (s.readOnly) return false;
  let id: string | null = null;
  s.update((d) => {
    id = importSvg(d, text, s.pageId, at ?? worldCenter(), name);
  });
  if (id) {
    s.select([id]);
    s.setTool('select');
  }
  return !!id;
}

export async function addImageFiles(files: File[], at?: Pt) {
  if (S().readOnly) return;
  // SVGs become editable vectors; everything else becomes an image layer.
  const svgs = files.filter((f) => f.type === 'image/svg+xml' || f.name.toLowerCase().endsWith('.svg'));
  for (const f of svgs) importSvgText(await f.text(), at, f.name.replace(/\.svg$/i, ''));
  const imgs = await Promise.all(files.filter((f) => f.type.startsWith('image/') && !svgs.includes(f)).map(readImage));
  if (!imgs.length) return;
  const s = S();
  const p = at ?? worldCenter();
  const ids: string[] = [];
  s.update((d) => {
    imgs.forEach((im, i) => {
      const k = Math.min(1, 800 / Math.max(im.w, im.h));
      const w = Math.round(im.w * k);
      const h = Math.round(im.h * k);
      const n = makeNode('image', s.pageId, { name: nextName(d, 'image'), src: im.src, x: Math.round(p.x - w / 2 + i * 24), y: Math.round(p.y - h / 2 + i * 24), w, h, naturalW: im.w, naturalH: im.h });
      insert(d, n, null);
      ids.push(n.id);
    });
  });
  s.select(ids);
  s.setTool('select');
}
