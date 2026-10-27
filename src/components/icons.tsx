import type { ReactNode } from 'react';
import type { NodeType, SceneNode } from '../types';

/*
 * Icon set: 16×16 grid, 1.25px strokes, round joins, aligned to half-pixels so they stay crisp at 1x.
 * Original drawings in the spirit of Figma's UI3 icons (not copies).
 */
const I = (d: ReactNode, size = 16) =>
  function Icon() {
    return (
      <svg className="icon" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {d}
      </svg>
    );
  };

export const Icons = {
  select: I(<path d="M4 2.75l8.5 5-3.6.9-1.7 3.6z" fill="currentColor" stroke="currentColor" strokeWidth="1" />),
  frame: I(<path d="M5.5 2v12M10.5 2v12M2 5.5h12M2 10.5h12" />),
  section: I(
    <>
      <path d="M2.5 5.5h11v8h-11z" />
      <path d="M2.5 5.5V3.25c0-.4.3-.75.75-.75H7l1.2 3" />
    </>,
  ),
  rect: I(<rect x="2.5" y="2.5" width="11" height="11" rx="1" />),
  ellipse: I(<circle cx="8" cy="8" r="5.75" />),
  line: I(<path d="M3 13L13 3" />),
  arrow: I(<path d="M3 13L13 3M7.5 3H13v5.5" />),
  polygon: I(<path d="M8 2.5l5.75 10H2.25z" />),
  star: I(<path d="M8 2l1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3l-3.7 2 .8-4.1L2 6.3l4.2-.5z" />),
  pen: I(
    <>
      <path d="M8 2.25l4.25 5.5L8 13.75 3.75 7.75z" />
      <path d="M8 2.25V7" />
      <circle cx="8" cy="8.4" r="1.1" />
    </>,
  ),
  text: I(<path d="M3 3.5h10M8 3.5v9.25M6.25 12.75h3.5" />),
  hand: I(<path d="M5.5 8.5V4.25a1 1 0 012 0V7.5m0-4.25a1 1 0 012 0V7.5m0-2.75a1 1 0 012 0V9.5c0 2.75-1.6 4.75-4.4 4.75-1.9 0-3-1-3.7-2.4L2.4 9.4a1 1 0 011.7-1L5.5 10" />),
  comment: I(<path d="M8 2.5c3.2 0 5.5 2.2 5.5 5s-2.3 5-5.5 5c-.8 0-1.6-.15-2.3-.45L2.5 13.5l.95-2.75C2.85 9.85 2.5 8.75 2.5 7.5c0-2.8 2.3-5 5.5-5z" />),
  image: I(
    <>
      <rect x="2" y="2.5" width="12" height="11" rx="1.25" />
      <circle cx="5.75" cy="6.25" r="1.15" />
      <path d="M14 10.75l-3.4-3.4L4 13.5" />
    </>,
  ),
  puzzle: I(<path d="M6.25 2.5a1.5 1.5 0 013 0V4H12a.75.75 0 01.75.75V7.5H11.5a1.5 1.5 0 000 3h1.25v2.75A.75.75 0 0112 14H9.25v-1.25a1.5 1.5 0 00-3 0V14H3.25a.75.75 0 01-.75-.75V10.5h1.25a1.5 1.5 0 000-3H2.5V4.75A.75.75 0 013.25 4h3z" />),
  command: I(<path d="M6 6h4v4H6zM6 6V4.5A1.5 1.5 0 104.5 6H6M10 6h1.5A1.5 1.5 0 1010 4.5V6M10 10v1.5a1.5 1.5 0 101.5-1.5H10M6 10H4.5A1.5 1.5 0 106 11.5V10" />),
  settings: I(
    <>
      <circle cx="8" cy="8" r="2.25" />
      <path d="M13.2 9.3l1.05.8-1.25 2.2-1.3-.5c-.4.33-.83.58-1.3.75L10.2 13.9H7.8l-.2-1.35a4.6 4.6 0 01-1.3-.75l-1.3.5-1.25-2.2 1.05-.8a4.7 4.7 0 010-1.5L3.75 7l1.25-2.2 1.3.5c.4-.33.83-.58 1.3-.75L7.8 3.2h2.4l.2 1.35c.47.17.9.42 1.3.75l1.3-.5L14.25 7l-1.05.8c.08.5.08 1 0 1.5z" />
    </>,
  ),
  group: I(<rect x="2.5" y="2.5" width="11" height="11" rx="1" strokeDasharray="2 1.75" />),
  component: I(<path d="M8 1.75l2.25 2.25L8 6.25 5.75 4zM8 9.75l2.25 2.25L8 14.25 5.75 12zM4 5.75L6.25 8 4 10.25 1.75 8zM12 5.75L14.25 8 12 10.25 9.75 8z" />),
  instance: I(<path d="M8 2l6 6-6 6-6-6z" />),
  vector: I(
    <>
      <path d="M3 12.5C5 6 9.5 9.5 13 3.5" />
      <rect x="1.75" y="11.25" width="2.5" height="2.5" rx=".4" fill="currentColor" stroke="none" />
      <rect x="11.75" y="2.25" width="2.5" height="2.5" rx=".4" fill="currentColor" stroke="none" />
    </>,
  ),
  eye: I(
    <>
      <path d="M1.75 8S4.1 3.75 8 3.75 14.25 8 14.25 8 11.9 12.25 8 12.25 1.75 8 1.75 8z" />
      <circle cx="8" cy="8" r="1.9" />
    </>,
  ),
  eyeOff: I(<path d="M2.5 2.5l11 11M6.5 3.95A6 6 0 018 3.75C11.9 3.75 14.25 8 14.25 8a10.6 10.6 0 01-1.8 2.35M10.2 11.85A5.5 5.5 0 018 12.25C4.1 12.25 1.75 8 1.75 8a10.6 10.6 0 012.5-2.9" />),
  lock: I(
    <>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.25" />
      <path d="M5.5 7V5.25a2.5 2.5 0 015 0V7" />
    </>,
  ),
  unlock: I(
    <>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.25" />
      <path d="M5.5 7V5.25a2.5 2.5 0 014.75-1.1" />
    </>,
  ),
  plus: I(<path d="M8 3.25v9.5M3.25 8h9.5" />),
  minus: I(<path d="M3.25 8h9.5" />),
  chevron: I(<path d="M6 4l4 4-4 4" />, 12),
  chevronDown: I(<path d="M4 6l4 4 4-4" />, 12),
  caretUp: I(<path d="M5 9.5l3-3 3 3" />, 10),
  play: I(<path d="M5 3.25v9.5L12.5 8z" fill="currentColor" strokeWidth="1" />),
  history: I(
    <>
      <path d="M2.75 8a5.25 5.25 0 101.55-3.7M2.75 2.75v2.5h2.5" />
      <path d="M8 5.25v3l2 1.25" />
    </>,
  ),
  alignLeft: I(<path d="M2.5 2v12M5 5.25h8M5 10.75h5" />),
  alignHCenter: I(<path d="M8 2v12M3.5 5.25h9M5 10.75h6" />),
  alignRight: I(<path d="M13.5 2v12M3 5.25h8M6 10.75h5" />),
  alignTop: I(<path d="M2 2.5h12M5.25 5v8M10.75 5v5" />),
  alignVCenter: I(<path d="M2 8h12M5.25 3.5v9M10.75 5v6" />),
  alignBottom: I(<path d="M2 13.5h12M5.25 3v8M10.75 6v5" />),
  distH: I(<path d="M2.5 2.5v11M13.5 2.5v11M6.5 5h3v6h-3z" />),
  distV: I(<path d="M2.5 2.5h11M2.5 13.5h11M5 6.5h6v3H5z" />),
  arrowRight: I(<path d="M2.5 8h11M10 4.5L13.5 8 10 11.5" />),
  arrowDown: I(<path d="M8 2.5v11M4.5 10L8 13.5 11.5 10" />),
  rotate: I(<path d="M13 8a5 5 0 11-1.5-3.55M13 2.75v2.5h-2.5" />),
  radius: I(<path d="M2.75 13.25V8a5.25 5.25 0 015.25-5.25h5.25" />),
  search: I(
    <>
      <circle cx="7" cy="7" r="4.25" />
      <path d="M10.25 10.25l3.25 3.25" />
    </>,
  ),
  close: I(<path d="M4 4l8 8M12 4l-8 8" />),
  sun: I(
    <>
      <circle cx="8" cy="8" r="2.75" />
      <path d="M8 1.5v1.25M8 13.25v1.25M1.5 8h1.25M13.25 8h1.25M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9" />
    </>,
  ),
  moon: I(<path d="M13.25 9.75A5.5 5.5 0 016.25 2.75a5.5 5.5 0 107 7z" />),
  list: I(<path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01" strokeWidth="1.5" />),
  grid: I(<path d="M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z" />),
  style: I(
    <>
      <circle cx="5.5" cy="5.5" r="2.75" />
      <circle cx="10.5" cy="5.5" r="2.75" />
      <circle cx="8" cy="10.5" r="2.75" />
    </>,
  ),
  detach: I(<path d="M6.5 9.5l3-3M5 7.25L3.75 8.5a2.65 2.65 0 003.75 3.75L8.75 11M11 8.75l1.25-1.25A2.65 2.65 0 008.5 3.75L7.25 5M2.5 2.5l2 2M13.5 13.5l-2-2" />),
  corners: I(<path d="M2.5 6V3.5a1 1 0 011-1H6M10 2.5h2.5a1 1 0 011 1V6M13.5 10v2.5a1 1 0 01-1 1H10M6 13.5H3.5a1 1 0 01-1-1V10" />),
  mask: I(
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
      <circle cx="8" cy="8" r="3.25" fill="currentColor" stroke="none" />
    </>,
  ),
  scale: I(<path d="M2.5 13.5l5-5M2.5 9.5v4h4M9 2.5h4.5V7M13.5 2.5L9 7" />),
  eyedropper: I(<path d="M10.5 2.75a1.75 1.75 0 012.5 2.5l-1.25 1.25.75.75-1 1-.75-.75-5 5H3.5v-2.25l5-5-.75-.75 1-1 .75.75z" />),
  variable: I(<path d="M8 1.75l5.5 3.1v6.3L8 14.25l-5.5-3.1v-6.3zM8 8l5.5-3.15M8 8v6.25M8 8L2.5 4.85" />),
  textWidth: I(<path d="M2.5 8h11M4.5 6L2.5 8l2 2M11.5 6l2 2-2 2" />),
  textHeight: I(<path d="M8 2.5v11M6 4.5l2-2 2 2M6 11.5l2 2 2-2" />),
};

export const TypeIcon = ({ type, node }: { type: NodeType; node?: SceneNode }) => {
  const C = node?.section
    ? Icons.section
    : type === 'frame'
      ? Icons.frame
      : type === 'group'
        ? Icons.group
        : type === 'component'
          ? Icons.component
          : type === 'instance'
            ? Icons.instance
            : type === 'rect'
              ? Icons.rect
              : type === 'ellipse'
                ? Icons.ellipse
                : type === 'text'
                  ? Icons.text
                  : type === 'image'
                    ? Icons.image
                    : node?.polySides
                      ? node.starRatio
                        ? Icons.star
                        : Icons.polygon
                      : node?.arrowEnd
                        ? Icons.arrow
                        : Icons.vector;
  return <C />;
};

export const Logo = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-label="Vellum">
    <defs>
      <linearGradient id="vellum-logo" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#5b4ef0" />
        <stop offset="1" stopColor="#c026d3" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="9" fill="url(#vellum-logo)" />
    <path d="M9.5 9.5l6.5 13 6.5-13" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
