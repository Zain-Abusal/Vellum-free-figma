import { renderToStaticMarkup } from 'react-dom/server';
import { bbox, descendants, type Box } from './doc';
import { renderNode } from './render';
import { zip } from './zip';
import type { Doc, ExportFormat, ExportSetting, SceneNode } from './types';

export function toSVG(doc: Doc, ids: string[]): { svg: string; box: Box } | null {
  const b = bbox(ids.map((id) => doc.nodes[id]).filter(Boolean));
  if (!b) return null;
  const box = { x: b.x, y: b.y, w: Math.max(1, b.w), h: Math.max(1, b.h) };
  const ctx = { doc, interactive: false, prefix: 'e', depth: 0, zoom: 1 };
  const svg = renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" width={box.w} height={box.h} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}>
      {ids.map((id) => renderNode(ctx, id))}
    </svg>,
  );
  return { svg, box };
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- font embedding (so PNG/JPG/PDF use the real typefaces) ---------- */

const GOOGLE_FONTS = new Set(['Inter', 'Roboto', 'Poppins', 'Montserrat', 'Space Grotesk', 'Playfair Display', 'DM Serif Display', 'Space Mono']);
const fontCache = new Map<string, Promise<string>>();

const toDataUrl = (blob: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });

function usedFonts(doc: Doc, ids: string[]) {
  const out = new Map<string, Set<number>>();
  const visit = (id: string, depth = 0) => {
    const n = doc.nodes[id];
    if (!n || depth > 8) return;
    if (n.type === 'text' && GOOGLE_FONTS.has(n.fontFamily ?? '')) {
      const set = out.get(n.fontFamily!) ?? new Set();
      set.add(n.fontWeight ?? 400);
      out.set(n.fontFamily!, set);
    }
    if (n.type === 'instance' && n.componentId) visit(n.componentId, depth + 1);
    n.children.forEach((c) => visit(c, depth));
  };
  ids.forEach((id) => visit(id));
  return out;
}

function fontFaces(family: string, weights: number[]): Promise<string> {
  const key = family + weights.join(',');
  let p = fontCache.get(key);
  if (!p) {
    p = (async () => {
      const fam = encodeURIComponent(family).replace(/%20/g, '+');
      let res = await fetch(`https://fonts.googleapis.com/css2?family=${fam}:wght@${weights.sort().join(';')}&display=block`);
      if (!res.ok) res = await fetch(`https://fonts.googleapis.com/css2?family=${fam}&display=block`);
      if (!res.ok) return '';
      const css = await res.text();
      const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*{[^}]*})/g)].filter((m) => m[1] === 'latin').map((m) => m[2]);
      const faces = await Promise.all(
        (blocks.length ? blocks : css.match(/@font-face\s*{[^}]*}/g) ?? []).map(async (b) => {
          const url = b.match(/url\(([^)]+)\)/)?.[1];
          if (!url) return '';
          const data = await toDataUrl(await (await fetch(url)).blob());
          return b.replace(url, data);
        }),
      );
      return faces.join('\n');
    })().catch(() => '');
    fontCache.set(key, p);
  }
  return p;
}

async function withFonts(svg: string, doc: Doc, ids: string[]) {
  const fonts = usedFonts(doc, ids);
  if (!fonts.size) return svg;
  const css = (await Promise.all([...fonts].map(([f, w]) => fontFaces(f, [...w])))).join('\n');
  if (!css) return svg;
  const i = svg.indexOf('>') + 1;
  return svg.slice(0, i) + `<defs><style>${css}</style></defs>` + svg.slice(i);
}

/* ---------- raster ---------- */

async function rasterCanvas(svg: string, box: Box, scale: number, background?: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = url;
    });
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(box.w * scale));
    c.height = Math.max(1, Math.ceil(box.h * scale));
    const g = c.getContext('2d')!;
    if (background) {
      g.fillStyle = background;
      g.fillRect(0, 0, c.width, c.height);
    }
    g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const canvasBlob = (c: HTMLCanvasElement, type: string) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Export failed'))), type, 0.92));

async function renderBlob(doc: Doc, ids: string[], format: ExportFormat, scale: number): Promise<Blob | null> {
  if (format === 'pdf') return renderPdf(doc, ids, scale);
  if (format === 'gif') return renderGif(doc, ids, scale);
  const r = toSVG(doc, ids);
  if (!r) return null;
  if (format === 'svg') return new Blob([r.svg], { type: 'image/svg+xml' });
  const svg = await withFonts(r.svg, doc, ids);
  const c = await rasterCanvas(svg, r.box, scale, format === 'jpg' ? '#ffffff' : undefined);
  return canvasBlob(c, format === 'jpg' ? 'image/jpeg' : 'image/png');
}

/** One PDF page per layer. */
async function renderPdf(doc: Doc, ids: string[], scale: number): Promise<Blob | null> {
  const { jsPDF } = await import('jspdf');
  let pdf: InstanceType<typeof jsPDF> | null = null;
  for (const id of ids) {
    const r = toSVG(doc, [id]);
    if (!r) continue;
    const c = await rasterCanvas(await withFonts(r.svg, doc, [id]), r.box, Math.max(2, scale));
    const { w, h } = r.box;
    const o = w > h ? 'landscape' : 'portrait';
    if (!pdf) pdf = new jsPDF({ unit: 'px', format: [w, h], orientation: o, hotfixes: ['px_scaling'], compress: true });
    else pdf.addPage([w, h], o);
    pdf.addImage(c.toDataURL('image/png'), 'PNG', 0, 0, w, h);
  }
  return pdf ? pdf.output('blob') : null;
}

/* ---------- GIF (animated when the layers contain animated GIFs) ---------- */

const GIF_MAX_MS = 15_000;
const GIF_MAX_FRAMES = 300;

/** An animated GIF split into PNG frames with their start times (ms). */
type GifTrack = { src: string; frames: string[]; times: number[]; total: number };

/** Decodes an animated GIF data URL with WebCodecs. Null when unsupported or not animated. */
async function decodeGif(src: string): Promise<GifTrack | null> {
  if (typeof ImageDecoder === 'undefined') return null;
  const dec = new ImageDecoder({ data: await (await fetch(src)).arrayBuffer(), type: 'image/gif' });
  try {
    await Promise.all([dec.tracks.ready, dec.completed]);
    const count = dec.tracks.selectedTrack?.frameCount ?? 1;
    if (count < 2) return null;
    const c = document.createElement('canvas');
    const frames: string[] = [];
    const times: number[] = [];
    let t = 0;
    for (let i = 0; i < count && t < GIF_MAX_MS; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      c.width = image.displayWidth;
      c.height = image.displayHeight;
      c.getContext('2d')!.drawImage(image, 0, 0);
      const ms = (image.duration ?? 0) / 1000;
      image.close();
      frames.push(c.toDataURL('image/png'));
      times.push(t);
      t += ms > 10 ? ms : 100; // browsers play tiny delays at 100 ms
    }
    return { src, frames, times, total: t };
  } finally {
    dec.close();
  }
}

const frameAt = (tr: GifTrack, t: number) => {
  const local = t % tr.total;
  let i = 0;
  while (i + 1 < tr.times.length && tr.times[i + 1] <= local) i++;
  return i;
};

/** Renders the layers to a GIF. Animated GIFs inside play along; otherwise it's a single frame. */
async function renderGif(doc: Doc, ids: string[], scale: number): Promise<Blob | null> {
  const r = toSVG(doc, ids);
  if (!r) return null;
  const svg = await withFonts(r.svg, doc, ids);
  const srcs = [...new Set(svg.match(/data:image\/gif[^"']*/g) ?? [])];
  const tracks = (await Promise.all(srcs.map((s) => decodeGif(s).catch(() => null)))).filter((t): t is GifTrack => !!t);
  const total = Math.min(GIF_MAX_MS, Math.max(0, ...tracks.map((t) => t.total)));
  // A new output frame wherever any GIF changes frame (all loop until the longest one ends).
  const changes = new Set([0]);
  for (const tr of tracks) for (let base = 0; base < total; base += tr.total) for (const t of tr.times) if (base + t < total) changes.add(Math.round(base + t));
  let ticks = [...changes].sort((a, b) => a - b);
  if (ticks.length > GIF_MAX_FRAMES) ticks = ticks.filter((_, i) => i % Math.ceil(ticks.length / GIF_MAX_FRAMES) === 0);

  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
  const gif = GIFEncoder();
  for (let i = 0; i < ticks.length; i++) {
    let frameSvg = svg;
    for (const tr of tracks) frameSvg = frameSvg.split(tr.src).join(tr.frames[frameAt(tr, ticks[i])]);
    const c = await rasterCanvas(frameSvg, r.box, scale);
    const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
    const palette = quantize(data, 256, { format: 'rgba4444', oneBitAlpha: true });
    const transparentIndex = palette.findIndex((p) => p[3] === 0);
    gif.writeFrame(applyPalette(data, palette, 'rgba4444'), c.width, c.height, {
      palette,
      delay: (ticks[i + 1] ?? total) - ticks[i],
      transparent: transparentIndex >= 0,
      transparentIndex,
    });
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '').trim() || 'export';

export function fileNameFor(name: string, s: ExportSetting) {
  const scale = s.format === 'svg' || s.format === 'pdf' || s.scale === 1 ? '' : `@${s.scale}x`;
  return `${safeName(name)}${s.suffix}${scale}.${s.format}`;
}

/** Export every layer with every setting; several files are bundled into a ZIP. */
export async function exportLayers(doc: Doc, ids: string[], settings: ExportSetting[], zipName = 'Export') {
  const files: { name: string; blob: Blob }[] = [];
  for (const s of settings) {
    if (s.format === 'pdf') {
      const blob = await renderBlob(doc, ids, 'pdf', s.scale);
      if (blob) files.push({ name: fileNameFor(ids.length === 1 ? doc.nodes[ids[0]].name : zipName, s), blob });
      continue;
    }
    for (const id of ids) {
      const blob = await renderBlob(doc, [id], s.format, s.scale);
      if (blob) files.push({ name: fileNameFor(doc.nodes[id].name, s), blob });
    }
  }
  if (!files.length) return;
  if (files.length === 1) return download(files[0].blob, files[0].name);
  download(await zip(files), `${safeName(zipName)}.zip`);
}

/** Export a set of layers as one image (used for whole pages). */
export async function exportCombined(doc: Doc, ids: string[], s: ExportSetting, name: string) {
  const blob = await renderBlob(doc, ids, s.format, s.scale);
  if (blob) download(blob, fileNameFor(name, s));
}

export async function copyAsPNG(doc: Doc, ids: string[]) {
  const blob = await renderBlob(doc, ids, 'png', 2);
  if (blob) await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

export async function copyAsSVG(doc: Doc, ids: string[]) {
  const r = toSVG(doc, ids);
  if (r) await navigator.clipboard.writeText(r.svg);
}

export function thumbnail(doc: Doc): string | undefined {
  const r = toSVG(doc, doc.pages[0].children);
  if (!r || r.svg.length > 1_500_000) return undefined;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(r.svg);
}

/* ---------- dev mode CSS ---------- */

const px = (v: number) => `${Math.round(v * 100) / 100}px`;

export function cssFor(doc: Doc, n: SceneNode): string {
  const p = n.parentId ? doc.nodes[n.parentId] : null;
  const L = [`/* ${n.name} */`, 'position: absolute;', `left: ${px(n.x - (p?.x ?? 0))};`, `top: ${px(n.y - (p?.y ?? 0))};`, `width: ${px(n.w)};`, `height: ${px(n.h)};`];
  const al = n.autoLayout;
  if (al) {
    L.push(
      'display: flex;',
      `flex-direction: ${al.direction === 'horizontal' ? 'row' : 'column'};`,
      `align-items: ${al.align === 'start' ? 'flex-start' : al.align === 'end' ? 'flex-end' : 'center'};`,
      `gap: ${px(al.gap)};`,
      `padding: ${px(al.padding)};`,
    );
  }
  const g = n.gradient;
  const bg = g && n.fill ? (g.type === 'radial' ? `radial-gradient(circle, ${g.stops.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ')})` : `linear-gradient(${g.angle + 90}deg, ${g.stops.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ')})`) : n.fill;
  if (n.type === 'text') {
    L.push(`font-family: '${n.fontFamily}';`, `font-size: ${px(n.fontSize ?? 16)};`, `font-weight: ${n.fontWeight};`, `line-height: ${Math.round((n.lineHeight ?? 1.2) * 100)}%;`, `text-align: ${n.textAlign};`);
    if (n.letterSpacing) L.push(`letter-spacing: ${px(n.letterSpacing)};`);
    if (n.textDecoration && n.textDecoration !== 'none') L.push(`text-decoration: ${n.textDecoration};`);
    if (g && n.fill) L.push(`background: ${bg};`, '-webkit-background-clip: text;', 'color: transparent;');
    else if (n.fill) L.push(`color: ${n.fill};`);
  } else if (bg && n.type !== 'path') L.push(`background: ${bg};`);
  if (n.type === 'ellipse') L.push('border-radius: 50%;');
  else if (n.radius) L.push(`border-radius: ${px(n.radius)};`);
  if (n.stroke && n.type !== 'text') L.push(`border: ${px(n.strokeWidth)} solid ${n.stroke};`);
  if (n.opacity !== 1) L.push(`opacity: ${Math.round(n.opacity * 100) / 100};`);
  if (n.rotation) L.push(`transform: rotate(${n.rotation}deg);`);
  if (n.blendMode && n.blendMode !== 'normal') L.push(`mix-blend-mode: ${n.blendMode};`);
  if (n.blur) L.push(`filter: blur(${px(n.blur / 2)});`);
  if (n.shadow) {
    const s = n.shadow;
    const a = Math.round(s.opacity * 255).toString(16).padStart(2, '0');
    L.push(`box-shadow: ${px(s.x)} ${px(s.y)} ${px(s.blur)} ${s.color}${a};`);
  }
  if (n.type === 'image' && n.imageFit) L.push(`object-fit: ${n.imageFit === 'fit' ? 'contain' : 'cover'};`);
  return L.join('\n');
}

/** Every layer under `ids`, for "export all frames". */
export const withDescendants = (doc: Doc, ids: string[]) => ids.flatMap((id) => [id, ...descendants(doc, id)]);
