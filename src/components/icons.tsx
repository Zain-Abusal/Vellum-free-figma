import type { ReactNode } from 'react';
import type { NodeType } from '../types';

const I = (d: ReactNode, size = 16) =>
  function Icon() {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
        {d}
      </svg>
    );
  };

export const Icons = {
  select: I(<path d="M3.5 2.5l9 4.6-4 1.2-1.7 4.2z" />),
  frame: I(<path d="M5.5 1.5v13M10.5 1.5v13M1.5 5.5h13M1.5 10.5h13" />),
  rect: I(<rect x="2.5" y="2.5" width="11" height="11" rx="0.5" />),
  ellipse: I(<circle cx="8" cy="8" r="5.5" />),
  line: I(<path d="M2.5 13.5l11-11" />),
  pen: I(
    <>
      <path d="M8 1.8l4.3 5.7L8 14.2 3.7 7.5z" />
      <circle cx="8" cy="8.3" r="1.1" />
    </>,
  ),
  text: I(<path d="M3 3.5h10M8 3.5v9.5M6.2 13h3.6" />),
  hand: I(<path d="M5.5 8.5V3.8a1 1 0 012 0V7.5m0-4.7a1 1 0 012 0v4.7m0-3.5a1 1 0 012 0v5.3c0 2.8-1.6 4.7-4.4 4.7-1.9 0-3-1-3.7-2.3L2.2 9a1 1 0 011.7-1L5.5 10" />),
  image: I(
    <>
      <rect x="2" y="2.5" width="12" height="11" rx="1.2" />
      <circle cx="5.8" cy="6.3" r="1.2" />
      <path d="M14 11l-3.6-3.6L4 13.5" />
    </>,
  ),
  group: I(<rect x="2.5" y="2.5" width="11" height="11" rx="0.5" strokeDasharray="2 1.6" />),
  component: I(<path d="M8 1.6l2.3 2.3L8 6.2 5.7 3.9zM8 9.8l2.3 2.3L8 14.4l-2.3-2.3zM3.9 5.7L6.2 8l-2.3 2.3L1.6 8zM12.1 5.7L14.4 8l-2.3 2.3L9.8 8z" />),
  instance: I(<path d="M8 1.8L14.2 8 8 14.2 1.8 8z" />),
  vector: I(<path d="M2.5 12.5c2-7 9-2 11-9" />),
  eye: I(
    <>
      <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="1.8" />
    </>,
  ),
  eyeOff: I(<path d="M2 2l12 12M6.4 3.7A6.6 6.6 0 018 3.5c4.1 0 6.5 4.5 6.5 4.5a11 11 0 01-1.9 2.4M10.2 11.9A6 6 0 018 12.5C3.9 12.5 1.5 8 1.5 8a11 11 0 012.6-3" />),
  lock: I(
    <>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1" />
      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
    </>,
  ),
  unlock: I(
    <>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1" />
      <path d="M5.5 7V5a2.5 2.5 0 014.8-1" />
    </>,
  ),
  plus: I(<path d="M8 3v10M3 8h10" />),
  minus: I(<path d="M3 8h10" />),
  chevron: I(<path d="M6 4l4 4-4 4" />, 12),
  play: I(<path d="M4.5 2.8v10.4L13 8z" />),
  history: I(
    <>
      <path d="M2.5 8a5.5 5.5 0 101.6-3.9M2.5 2.5v2.8h2.8" />
      <path d="M8 5v3.2l2 1.3" />
    </>,
  ),
  alignLeft: I(<path d="M2.5 2v12M5 5h8M5 11h5" />),
  alignHCenter: I(<path d="M8 2v12M3.5 5h9M5 11h6" />),
  alignRight: I(<path d="M13.5 2v12M3 5h8M6 11h5" />),
  alignTop: I(<path d="M2 2.5h12M5 5v8M11 5v5" />),
  alignVCenter: I(<path d="M2 8h12M5 3.5v9M11 5v6" />),
  alignBottom: I(<path d="M2 13.5h12M5 3v8M11 6v5" />),
  arrowRight: I(<path d="M2.5 8h11M10 4.5L13.5 8 10 11.5" />),
  arrowDown: I(<path d="M8 2.5v11M4.5 10L8 13.5 11.5 10" />),
  rotate: I(<path d="M13 8a5 5 0 11-1.5-3.6M13 2.5V5h-2.5" />),
  radius: I(<path d="M2.5 13.5V8a5.5 5.5 0 015.5-5.5h5.5" />),
  search: I(
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5l3 3" />
    </>,
  ),
  menu: I(<path d="M2.5 4h11M2.5 8h11M2.5 12h11" />),
  close: I(<path d="M4 4l8 8M12 4l-8 8" />),
  arrow: I(<path d="M2.5 13.5l11-11M7.5 2.5h6v6" />),
  polygon: I(<path d="M8 2.2l6 10.8H2z" />),
  star: I(<path d="M8 1.8l1.9 4 4.3.5-3.2 3 .9 4.3L8 11.4l-3.9 2.2.9-4.3-3.2-3 4.3-.5z" />),
  comment: I(<path d="M2.5 13.5V7.5a5 5 0 015-5h1a5 5 0 015 5v0a5 5 0 01-5 5H4z" />),
  puzzle: I(<path d="M6 2.5h3v1.6a1.4 1.4 0 102.8 0V2.5h0M3 5.5h3.2a1.4 1.4 0 110 2.8H3V13.5h10.5V10a1.4 1.4 0 10-2.8 0" />),
  caretUp: I(<path d="M5 9.5L8 6.5l3 3" />, 10),
};

export const TypeIcon = ({ type }: { type: NodeType }) => {
  const C =
    type === 'frame'
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
                    : Icons.vector;
  return <C />;
};

export const Logo = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32">
    <rect width="32" height="32" rx="8" fill="#1e1e1e" />
    <path d="M9 9l7 15 7-15" fill="none" stroke="#0d99ff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
