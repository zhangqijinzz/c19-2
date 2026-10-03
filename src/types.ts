export type ElementKind = 'booth' | 'stage' | 'seating' | 'entrance';
export type LayoutMode = 'edit' | 'inspect' | 'path' | 'access';
export type ViewPhase = 'loading' | 'ready' | 'error';

export interface ExpoElement {
  id: string;
  kind: ElementKind;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface RenderElement extends ExpoElement {
  displayWidth: number;
  displayHeight: number;
  occupiedArea: number;
}

export interface FieldSize {
  width: number;
  height: number;
}

export interface LayoutDocument {
  version: 1;
  title: string;
  field: FieldSize;
  elements: ExpoElement[];
}

export interface ElementSpec {
  kind: ElementKind;
  label: string;
  eyebrow: string;
  icon: string;
  color: string;
  width: number;
  height: number;
}

export interface OverlapIssue {
  firstId: string;
  secondId: string;
  amount: number;
}

export interface BoundsIssue {
  elementId: string;
  overflow: number;
}

export interface ChannelIssue {
  firstId: string;
  secondId: string;
  gap: number;
}

export interface PathPreview {
  points: Array<{ x: number; y: number }>;
  distance: number;
  fromName: string;
  toName: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface RouteSegment {
  from: Point;
  to: Point;
  /** 该段实际穿过的通道：两端元素 + 净宽（米），口径同窄通道判断 */
  channel: { firstId: string; secondId: string; gap: number } | null;
  /** 沿途最窄净宽（米）；未经过任何成对通道时为 null，表示两侧无元素夹挤 */
  clearance: number | null;
  narrow: boolean;
}

export interface EntranceRoute {
  entranceId: string;
  entranceName: string;
  targetName: string;
  start: Point;
  end: Point;
  segments: RouteSegment[];
  distance: number;
  minClearance: number | null;
  reachable: boolean;
}

export interface AccessAssessment {
  routes: EntranceRoute[];
  missing: string[];
}

export interface Analysis {
  overlaps: OverlapIssue[];
  bounds: BoundsIssue[];
  channels: ChannelIssue[];
  path: PathPreview | null;
  access: AccessAssessment;
}

export interface Notice {
  tone: 'info' | 'success' | 'warning' | 'error';
  message: string;
}
