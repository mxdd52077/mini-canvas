export type NodeKind =
  | "rect"
  | "ellipse"
  | "polygon"
  | "path"
  | "text"
  | "frame"
  | "image"
  | "video"
  | "audio"
  | "scene"
  | "image-gen"
  | "video-gen"
  | "audio-gen";
export type CanvasNode = {
  id: string;
  kind: NodeKind;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string;
  stroke: string;
  visible: boolean;
  locked: boolean;
  parentId?: string;
  content?: string;
  manualWidth?: boolean;
  manualHeight?: boolean;
  fontSize?: number;
  fontWeight?: number;
  textAlign?: "left" | "center" | "right";
  pathData?: string;
  pathPoints?: import("./pen-path").PenPoint[];
  pathClosed?: boolean;
  pathViewWidth?: number;
  pathViewHeight?: number;
  cornerRadius?: number;
  op?: "unite" | "subtract" | "intersect" | "exclude";
  operands?: string[];
  operandsOrigin?: { x: number; y: number };
  src?: string;
  srcPath?: string;
  assetId?: string;
  reference?: string;
  referencePath?: string;
  referenceAssetId?: string;
  promptRefs?: { id: string; src: string; path?: string; name: string }[];
  model?: string;
  resolution?: string;
  ratio?: string;
  seconds?: number;
  voice?: string;
  voiceName?: string;
  sceneData?: import("./scene-types").ThreeSceneData;
  sceneThumbnail?: string;
  taskId?: string;
  mjAction?: "upscale" | "variation" | "reroll" | "high-variation" | "low-variation" | "zoom";
  mjParentTaskId?: string;
  status?: "idle" | "queued" | "running" | "done" | "failed";
  errorMessage?: string;
  version: number;
};
export type CanvasEdge = { id: string; from: string; to: string };
export type CanvasComment = {
  id: string;
  x: number;
  y: number;
  objectId?: string;
  text: string;
  author: string;
  avatar: string;
  authorId: string;
  createdAt: string;
  color?: string;
  replies: {id:string;text:string;author:string;authorId:string;createdAt:string}[];
};
export type Tool =
  | "select"
  | "hand"
  | "rect"
  | "ellipse"
  | "polygon"
  | "pen"
  | "text"
  | "frame"
  | "image"
  | "video"
  | "audio"
  | "scene"
  | "image-gen"
  | "video-gen"
  | "audio-gen"
  | "comment";
