"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";
import { wouldCreateCycle } from "@/lib/graph";
import { demoEdges, demoNodes } from "@/lib/demo";
import { defaultThreeScene } from "@/lib/scene-types";
import type {
  CanvasComment,
  CanvasEdge,
  CanvasNode,
  NodeKind,
  Tool,
} from "@/lib/types";
type Snap = { nodes: CanvasNode[]; edges: CanvasEdge[] };
type Panel = "layers" | "assets" | "minimap" | "voices" | null;
type Store = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  comments: CanvasComment[];
  selected: string[];
  tool: Tool;
  zoom: number;
  pan: { x: number; y: number };
  connections: boolean;
  panel: Panel;
  history: Snap[];
  future: Snap[];
  setTool: (t: Tool) => void;
  setSelected: (ids: string[]) => void;
  setZoom: (z: number) => void;
  setPan: (p: { x: number; y: number }) => void;
  setPanel: (p: Panel) => void;
  toggleConnections: () => void;
  addNode: (kind: NodeKind, x?: number, y?: number) => string;
  updateNode: (id: string, p: Partial<CanvasNode>, record?: boolean) => void;
  moveNodes: (updates: Map<string, { x: number; y: number }>) => void;
  removeSelected: () => void;
  duplicate: () => void;
  addEdge: (from: string, to: string) => boolean;
  removeEdge: (id: string) => void;
  addStoryboard: (
    assets: { name: string; category: string; prompt: string }[],
    shots: { name: string; prompt: string; seconds?: number; assets: string[] }[],
    origin: { x: number; y: number; width: number; height: number },
    settings?: { imageModel?: string; videoModel?: string; ratio?: string },
  ) => void;
  createBoolean: (operandIds: string[], node: Partial<CanvasNode> & { x: number; y: number }) => string;
  releaseBoolean: (id: string) => void;
  toggleNode: (id: string, key: "visible" | "locked") => void;
  setComments: (comments: CanvasComment[]) => void;
  addComment: (comment: CanvasComment) => void;
  removeComment: (id: string) => void;
  moveComment: (id: string, x: number, y: number, objectId?: string | null) => void;
  addReply: (commentId: string, reply: CanvasComment["replies"][number]) => void;
  undo: () => void;
  redo: () => void;
};
const snap = (s: Store): Snap => ({ nodes: s.nodes, edges: s.edges });
const make = (kind: NodeKind, x = 420, y = 260): CanvasNode => {
  const media = kind.includes("image") || kind.includes("video") || kind.includes("audio"),
    frame = kind === "frame";
  return {
    id: nanoid(),
    kind,
    name: {
      rect: "矩形",
      ellipse: "椭圆",
      polygon: "多边形",
      path: "路径",
      text: "文本",
      frame: "Frame",
      image: "上传图片",
      video: "上传视频",
      audio: "上传音频",
      scene: "场景设计",
      "image-gen": "图片生成",
      "video-gen": "视频生成",
      "audio-gen": "音频生成",
    }[kind],
    x,
    y,
    width: frame ? 360 : kind==="scene"?420:kind.includes("audio") ? 420 : media ? 480 : kind === "text" ? 180 : kind === "rect" || kind === "ellipse" ? 140 : 150,
    height: frame ? 420 : kind==="scene"?280:kind === "audio" ? 140 : media ? 360 : kind === "text" ? 56 : kind === "rect" || kind === "ellipse" ? 140 : 120,
    rotation: 0,
    fill: kind === "text" || kind === "path" ? "transparent" : "#ffffff",
    stroke: kind === "rect" || kind === "ellipse" || kind === "polygon" ? "transparent" : "#cfcfcb",
    visible: true,
    locked: false,
    pathData: kind === "path" ? "M 8 92 C 32 10, 78 10, 142 92" : undefined,
    cornerRadius:kind === "rect" ? 0 : undefined,
    fontSize: kind === "text" ? 24 : undefined,
    fontWeight: kind === "text" ? 600 : undefined,
    textAlign: kind === "text" ? "left" : undefined,
    sceneData:kind==="scene"?defaultThreeScene():undefined,
    model: kind === "image-gen" ? "zhenzhen-image-g-v2.5-lowprice" : kind === "video-gen" ? "seedance-2.5-standard-t2v" : kind === "audio-gen" ? "doubao-seed-audio-1.0" : undefined,
    resolution: kind === "image-gen" ? "1k" : kind === "video-gen" ? "720p" : undefined,
    seconds: kind === "video-gen" ? 5 : undefined,
    content:
      kind === "text"
        ? "输入文字"
        : kind.includes("gen")
          ? "描述你想生成的内容"
          : "",
    status: kind.includes("gen") ? "idle" : undefined,
    version: 1,
  };
};
export const useCanvas = create<Store>()(
  persist(
    (set, get) => ({
      nodes: demoNodes,
      edges: demoEdges,
      comments: [],
      selected: [],
      tool: "select",
      zoom: 1,
      pan: { x: 0, y: 0 },
      connections: true,
      panel: "minimap",
      history: [],
      future: [],
      setTool: (tool) => set({ tool }),
      setSelected: (selected) => set({ selected }),
      setZoom: (zoom) => set({ zoom: Math.max(0.25, Math.min(2, zoom)) }),
      setPan: (pan) => set({ pan }),
      setPanel: (panel) => set({ panel }),
      toggleConnections: () => set((s) => ({ connections: !s.connections })),
      addNode: (kind, x, y) => {
        const id = nanoid();
        set((s) => ({
          history: [...s.history.slice(-39), snap(s)],
          future: [],
          nodes: [...s.nodes, { ...make(kind, x, y), id }],
          selected: [id],
          tool: "select",
        }));
        return id;
      },
      updateNode: (id, p, record = true) =>
        set((s) => ({
          history: record ? [...s.history.slice(-39), snap(s)] : s.history,
          future: record ? [] : s.future,
          nodes: s.nodes.map((n) =>
            n.id === id ? { ...n, ...p, version: n.version + 1 } : n,
          ),
        })),
      moveNodes: (updates) =>
        set((s) => ({
          history: [...s.history.slice(-39), snap(s)],
          future: [],
          nodes: s.nodes.map((n) => {
            const u = updates.get(n.id);
            return u ? { ...n, x: u.x, y: u.y, version: n.version + 1 } : n;
          }),
        })),
      removeSelected: () =>
        set((s) => {
          const ids = new Set(s.selected);
          let grew = true;
          while (grew) {
            grew = false;
            for (const n of s.nodes) {
              if (!ids.has(n.id) && n.parentId && ids.has(n.parentId)) {
                ids.add(n.id);
                grew = true;
              }
            }
          }
          for (const n of s.nodes)
            if (ids.has(n.id) && n.operands)
              for (const oid of n.operands) ids.add(oid);
          return {
            history: [...s.history, snap(s)],
            future: [],
            nodes: s.nodes.filter((n) => !ids.has(n.id)),
            edges: s.edges.filter(
              (e) => !ids.has(e.from) && !ids.has(e.to),
            ),
            selected: [],
          };
        }),
      createBoolean: (operandIds, node) => {
        const id = nanoid();
        set((s) => ({
          history: [...s.history.slice(-39), snap(s)],
          future: [],
          nodes: [
            ...s.nodes.map((n) =>
              operandIds.includes(n.id)
                ? { ...n, visible: false, version: n.version + 1 }
                : n,
            ),
            { ...make("path", node.x, node.y), ...node, id, operands: operandIds, operandsOrigin: { x: node.x, y: node.y } },
          ],
          selected: [id],
        }));
        return id;
      },
      releaseBoolean: (id) =>
        set((s) => {
          const container = s.nodes.find((n) => n.id === id);
          if (!container?.operands?.length) return {};
          const operandIds = container.operands.filter((oid) =>
            s.nodes.some((n) => n.id === oid),
          );
          const dx = container.x - (container.operandsOrigin?.x ?? container.x);
          const dy = container.y - (container.operandsOrigin?.y ?? container.y);
          return {
            history: [...s.history.slice(-39), snap(s)],
            future: [],
            nodes: s.nodes
              .filter((n) => n.id !== id)
              .map((n) =>
                operandIds.includes(n.id)
                  ? { ...n, visible: true, x: n.x + dx, y: n.y + dy, version: n.version + 1 }
                  : n,
              ),
            selected: operandIds,
          };
        }),
      duplicate: () =>
        set((s) => {
          const idMap = new Map<string, string>();
          const toCopy: CanvasNode[] = [];
          const seen = new Set<string>();
          const queue = s.nodes.filter((n) => s.selected.includes(n.id));
          const topLevel = new Set(queue.map((n) => n.id));
          while (queue.length) {
            const n = queue.shift()!;
            if (seen.has(n.id)) continue;
            seen.add(n.id);
            toCopy.push(n);
            for (const c of s.nodes.filter((x) => x.parentId === n.id))
              queue.push(c);
            for (const oid of n.operands ?? []) {
              const o = s.nodes.find((x) => x.id === oid);
              if (o) queue.push(o);
            }
          }
          for (const n of toCopy) idMap.set(n.id, nanoid());
          const copies = toCopy.map((n) => ({
            ...n,
            id: idMap.get(n.id)!,
            x: n.x + 24,
            y: n.y + 24,
            name: topLevel.has(n.id) ? n.name + " 副本" : n.name,
            parentId: n.parentId ? (idMap.get(n.parentId) ?? n.parentId) : undefined,
            operands: n.operands?.map((o) => idMap.get(o) ?? o),
            version: 1,
          }));
          return {
            history: [...s.history, snap(s)],
            future: [],
            nodes: [...s.nodes, ...copies],
            selected: [...topLevel].map((id) => idMap.get(id)!),
          };
        }),
      addEdge: (from, to) => {
        const s = get();
        if (from === to || s.edges.some((e) => e.from === from && e.to === to))
          return false;
      if (wouldCreateCycle(s.edges, from, to)) return false;
        set({
          history: [...s.history, snap(s)],
          future: [],
          edges: [...s.edges, { id: nanoid(), from, to }],
        });
        return true;
      },
      removeEdge: (id) =>
        set((s) => ({
          history: [...s.history, snap(s)],
          edges: s.edges.filter((e) => e.id !== id),
        })),
      addStoryboard: (assets, shots, origin, settings) =>
        set((s) => {
          if (!assets.length && !shots.length) return {};
          const GAP = 48;
          const occupied = s.nodes.map((n) => ({ x: n.x, y: n.y, width: n.width, height: n.height }));
          const hit = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
            a.x - GAP < b.x + b.width && a.x + a.width + GAP > b.x && a.y - GAP < b.y + b.height && a.y + a.height + GAP > b.y;
          const startX = origin.x + origin.width + 160;
          const findSpot = (w: number, h: number, prefY: number) => {
            let y = prefY;
            for (let band = 0; band < 50; band++) {
              let x = startX;
              for (let guard = 0; guard < 200; guard++) {
                const rect = { x, y, width: w, height: h };
                const blocker = occupied.find((o) => hit(rect, o));
                if (!blocker) {
                  occupied.push(rect);
                  return { x, y };
                }
                x = blocker.x + blocker.width + GAP;
                if (x > startX + 8 * (w + GAP)) break;
              }
              y += h + GAP + 60;
            }
            const bottom = Math.max(origin.y, ...occupied.map((o) => o.y + o.height));
            const rect = { x: startX, y: bottom + GAP, width: w, height: h };
            occupied.push(rect);
            return { x: rect.x, y: rect.y };
          };
          const place = (kind: "image-gen" | "video-gen", prefY: number) => {
            const node = make(kind, 0, 0);
            const spot = findSpot(node.width, node.height, prefY);
            node.x = spot.x;
            node.y = spot.y;
            return node;
          };
          const assetNodes = assets.map((asset) => ({
            ...place("image-gen", origin.y),
            name: asset.name,
            content: asset.prompt,
            ...(settings?.imageModel ? { model: settings.imageModel } : {}),
            ratio: asset.category === "character" ? "16:9" : undefined,
          }));
          const assetBottom = assetNodes.length
            ? Math.max(...assetNodes.map((n) => n.y + n.height))
            : origin.y + origin.height;
          const shotNodes = shots.map((shot) => ({
            ...place("video-gen", assetBottom + 80),
            name: shot.name,
            content: shot.prompt,
            seconds: shot.seconds,
            ...(settings?.videoModel
              ? {
                  model: `${settings.videoModel}-${shot.assets.length ? "i2v" : "t2v"}`,
                }
              : {}),
            ratio: settings?.ratio,
          }));
          const assetIdByName = new Map(assetNodes.map((n) => [n.name, n.id]));
          const newEdges: CanvasEdge[] = [];
          const seen = new Set<string>();
          shotNodes.forEach((shot, i) => {
            for (const assetName of shots[i].assets) {
              const from = assetIdByName.get(assetName);
              if (!from) continue;
              const key = `${from}->${shot.id}`;
              if (seen.has(key)) continue;
              seen.add(key);
              newEdges.push({ id: nanoid(), from, to: shot.id });
            }
          });
          const created = [...assetNodes, ...shotNodes];
          return {
            history: [...s.history.slice(-39), snap(s)],
            future: [],
            nodes: [...s.nodes, ...created],
            edges: [...s.edges, ...newEdges],
            selected: created.map((n) => n.id),
          };
        }),
      toggleNode: (id, key) =>
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === id ? { ...n, [key]: !n[key] } : n,
          ),
        })),
      setComments: (comments) => set({ comments }),
      addComment: (comment) => set((s) => ({ comments: [...s.comments, comment] })),
      removeComment: (id) => set((s) => ({ comments: s.comments.filter((comment) => comment.id !== id) })),
      moveComment: (id, x, y, objectId) => set((s) => ({ comments: s.comments.map((comment) => comment.id === id ? {...comment,x,y,objectId:objectId??undefined} : comment) })),
      addReply: (commentId, reply) => set((s) => ({ comments: s.comments.map((comment) => comment.id === commentId ? {...comment,replies:[...comment.replies,reply]} : comment) })),
      undo: () =>
        set((s) => {
          const prev = s.history.at(-1);
          if (!prev) return {};
          return {
            nodes: prev.nodes,
            edges: prev.edges,
            history: s.history.slice(0, -1),
            future: [snap(s), ...s.future],
            selected: [],
          };
        }),
      redo: () =>
        set((s) => {
          const next = s.future[0];
          if (!next) return {};
          return {
            nodes: next.nodes,
            edges: next.edges,
            history: [...s.history, snap(s)],
            future: s.future.slice(1),
            selected: [],
          };
        }),
    }),
    {
      name: "mini-canvas-demo",
      partialize: (s) => ({
        nodes: s.nodes,
        edges: s.edges,
      }),
    },
  ),
);
