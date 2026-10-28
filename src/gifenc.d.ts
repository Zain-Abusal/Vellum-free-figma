declare module 'gifenc' {
  type Palette = number[][];
  type Format = 'rgb565' | 'rgb444' | 'rgba4444';
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: { format?: Format; oneBitAlpha?: boolean | number; clearAlpha?: boolean; clearAlphaThreshold?: number; clearAlphaColor?: number }): Palette;
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette, format?: Format): Uint8Array;
  export function GIFEncoder(opts?: { auto?: boolean; initialCapacity?: number }): {
    writeFrame(index: Uint8Array, w: number, h: number, opts?: { palette?: Palette; transparent?: boolean; transparentIndex?: number; delay?: number; repeat?: number; dispose?: number }): void;
    finish(): void;
    bytes(): Uint8Array<ArrayBuffer>;
  };
}
