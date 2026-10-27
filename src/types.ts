export type NodeType = 'frame' | 'group' | 'component' | 'instance' | 'rect' | 'ellipse' | 'path' | 'text' | 'image';

export type Tool = 'select' | 'hand' | 'frame' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'polygon' | 'star' | 'pen' | 'text' | 'comment';

export type ExportFormat = 'png' | 'jpg' | 'svg' | 'pdf';

export interface Pt {
  x: number;
  y: number;
}

export interface Shadow {
  x: number;
  y: number;
  blur: number;
  color: string;
  opacity: number;
}

export interface GradientStop {
  offset: number;
  color: string;
}

export interface Gradient {
  type: 'linear' | 'radial';
  angle: number;
  stops: GradientStop[];
}

export interface AutoLayout {
  direction: 'horizontal' | 'vertical';
  gap: number;
  padding: number;
  align: 'start' | 'center' | 'end';
}

export type HConstraint = 'left' | 'right' | 'leftright' | 'center' | 'scale';
export type VConstraint = 'top' | 'bottom' | 'topbottom' | 'center' | 'scale';

export interface ExportSetting {
  scale: number;
  format: ExportFormat;
  suffix: string;
}

/** Coordinates are absolute (page space). Children are listed bottom → top. */
export interface SceneNode {
  id: string;
  type: NodeType;
  name: string;
  pageId: string;
  parentId: string | null;
  children: string[];
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  fill: string | null;
  gradient?: Gradient | null;
  stroke: string | null;
  strokeWidth: number;
  radius: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  shadow?: Shadow | null;
  blur?: number;
  blendMode?: string;
  constraints?: { h: HConstraint; v: VConstraint };
  exports?: ExportSetting[];
  // text
  text?: string;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  textAlign?: 'left' | 'center' | 'right';
  lineHeight?: number;
  letterSpacing?: number;
  textDecoration?: 'none' | 'underline' | 'line-through';
  // path — points normalised to the node box (0..1). `rings` (compound paths) wins over `points`.
  points?: Pt[];
  rings?: Pt[][];
  closed?: boolean;
  arrowEnd?: boolean;
  polySides?: number;
  starRatio?: number;
  // instance
  componentId?: string;
  // image
  src?: string;
  imageFit?: 'fill' | 'fit';
  // frame / component
  autoLayout?: AutoLayout | null;
  clip?: boolean;
  // prototype
  link?: string | null;
}

export interface CommentReply {
  id: string;
  author: string;
  text: string;
  date: number;
}

export interface Comment {
  id: string;
  x: number;
  y: number;
  resolved: boolean;
  /** First entry is the comment itself. */
  thread: CommentReply[];
}

export interface Page {
  id: string;
  name: string;
  children: string[];
  bg: string;
  comments?: Comment[];
}

export interface Doc {
  pages: Page[];
  nodes: Record<string, SceneNode>;
}

export interface Version {
  id: string;
  name: string;
  date: number;
  doc: Doc;
}
