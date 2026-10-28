export type NodeType = 'frame' | 'group' | 'component' | 'instance' | 'rect' | 'ellipse' | 'path' | 'text' | 'image';

export type Tool = 'select' | 'hand' | 'frame' | 'section' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'polygon' | 'star' | 'pen' | 'text' | 'comment' | 'scale';

export type ExportFormat = 'png' | 'jpg' | 'svg' | 'pdf' | 'gif';

export interface Pt {
  x: number;
  y: number;
}

/** Path vertex. Optional bezier handles (ix,iy = incoming, ox,oy = outgoing) live in the same space as x,y. */
export interface PathPoint extends Pt {
  ix?: number;
  iy?: number;
  ox?: number;
  oy?: number;
}

export interface LayoutGrid {
  type: 'columns' | 'rows' | 'grid';
  count: number;
  /** Cell size for 'grid'. */
  size: number;
  gutter: number;
  margin: number;
  color: string;
  visible: boolean;
}

export type Transition = 'instant' | 'dissolve' | 'smart' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down';

export type BoolOp = 'union' | 'subtract' | 'intersect' | 'exclude';

/** Properties that can be bound to a variable. */
export type VarProp = 'fill' | 'stroke' | 'radius' | 'opacity' | 'gap' | 'padding';

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
  /** Main-axis distribution (default 'start'). */
  justify?: 'start' | 'center' | 'end' | 'between';
  /** Hug contents (default true) or keep a fixed size, per axis. */
  hugMain?: boolean;
  hugCross?: boolean;
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
  /** Independent corner radii [top-left, top-right, bottom-right, bottom-left]. Wins over `radius`. */
  radii?: [number, number, number, number] | null;
  /** Dash length for dashed strokes (0 / undefined = solid). */
  strokeDash?: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  shadow?: Shadow | null;
  innerShadow?: Shadow | null;
  /** Live (non-destructive) boolean group: children are combined with this operation. */
  booleanOp?: BoolOp;
  /** Frame holding variants of one component (names like "Size=Small, State=Hover"). */
  componentSet?: boolean;
  /** Variable bindings: property → variable id. */
  vars?: Partial<Record<VarProp, string>>;
  /** Frame-level variable mode override: collection id → mode id (inherited by children). */
  varModes?: Record<string, string>;
  /** This layer masks the layers above it in its group. */
  isMask?: boolean;
  /** Group whose first child is a mask. */
  masked?: boolean;
  /** Auto layout child: fill the parent's main axis / stretch across the cross axis. */
  layoutFill?: boolean;
  layoutStretch?: boolean;
  blur?: number;
  blendMode?: string;
  constraints?: { h: HConstraint; v: VConstraint };
  exports?: ExportSetting[];
  /** Linked local styles (editing the style updates every linked layer). */
  fillStyleId?: string;
  textStyleId?: string;
  // text
  text?: string;
  /** 'width' = grows with content (default); 'height' = fixed width, wraps lines. */
  textAutoResize?: 'width' | 'height';
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  textAlign?: 'left' | 'center' | 'right';
  lineHeight?: number;
  letterSpacing?: number;
  textDecoration?: 'none' | 'underline' | 'line-through';
  // path — points normalised to the node box (0..1). `rings` (compound paths) wins over `points`.
  points?: PathPoint[];
  rings?: PathPoint[][];
  closed?: boolean;
  arrowEnd?: boolean;
  polySides?: number;
  starRatio?: number;
  // instance
  componentId?: string;
  /** Per-instance overrides of the main component's layers (text, visibility, fill). */
  overrides?: Record<string, { text?: string; visible?: boolean; fill?: string | null }>;
  // image
  src?: string;
  imageFit?: 'fill' | 'fit' | 'crop' | 'tile';
  naturalW?: number;
  naturalH?: number;
  /** Crop: zoom (≥1) and focal point (0..1). */
  cropZoom?: number;
  cropX?: number;
  cropY?: number;
  /** Tile: scale of one tile relative to the image's natural size. */
  tileScale?: number;
  // frame / component
  autoLayout?: AutoLayout | null;
  clip?: boolean;
  /** Frame drawn as a Figma-style section (organizes frames, name tag inside). */
  section?: boolean;
  layoutGrid?: LayoutGrid | null;
  // prototype
  /** Frame id, or '__back' to go back. */
  link?: string | null;
  linkTransition?: Transition;
  /** Navigate to the frame, or open it as an overlay on top. */
  linkAction?: 'navigate' | 'overlay';
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

export interface ColorStyle {
  id: string;
  name: string;
  color: string;
}

export interface TextStyle {
  id: string;
  name: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
}

export interface Variable {
  id: string;
  name: string;
  type: 'color' | 'number';
  /** mode id → value */
  values: Record<string, string | number>;
}

export interface VarCollection {
  id: string;
  name: string;
  modes: { id: string; name: string }[];
  defaultMode: string;
  vars: Variable[];
}

export interface Styles {
  colors: ColorStyle[];
  texts: TextStyle[];
  /** Variables live with styles so they sync with the same op. */
  variables?: VarCollection[];
}

export interface Doc {
  pages: Page[];
  nodes: Record<string, SceneNode>;
  styles?: Styles;
}

export interface Version {
  id: string;
  name: string;
  date: number;
  doc: Doc;
}
