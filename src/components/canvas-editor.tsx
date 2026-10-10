"use client";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  AudioLines,
  Box,
  Brush,
  Camera,
  Check,
  ChevronDown,
  Circle,
  Copy,
  Download,
  Eraser,
  Eye,
  EyeOff,
  Film,
  Frame,
  Hand,
  ImageIcon,
  ImagePlus,
  Layers3,
  LayoutGrid,
  Lock,
  Map,
  Maximize2,
  MessageCircle,
  Mic,
  MousePointer2,
  Palette,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Pencil,
  PenTool,
  Play,
  Plus,
  Redo2,
  Send,
  Scissors,
  Settings,
  Shapes,
  Sparkles,
  Square,
  Trash2,
  Type,
  Undo2,
  Unlock,
  Users,
  Video,
  Waypoints,
  X,
} from "lucide-react";
import { useCanvas } from "@/store/canvas";
import { useAssistantUI } from "@/store/assistant";
import { StoryboardFlow } from "@/components/storyboard-flow";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { authFetch, ensureLogin, useAuthUI } from "@/lib/auth-ui";
import type { CanvasComment, CanvasEdge, CanvasNode, NodeKind, Tool } from "@/lib/types";
import { nearbyFreePosition, organizeMediaPositions } from "@/lib/graph";
import { normalizePenPath, penPath, type PenPoint } from "@/lib/pen-path";
import { ThemeToggle } from "@/components/theme-toggle";
import { ThreeSceneEditor } from "@/components/three-scene-editor";
import { defaultThreeScene, type ThreeSceneData } from "@/lib/scene-types";
import { modelCompatibility, type MediaInputCounts, type ModelRequirements } from "@/lib/model-compatibility";
import { classifyWheelGesture } from "@/lib/wheel-gesture";

type CatalogModel = {
  id: string;
  model_id: string;
  display_name: string;
  kind: "image" | "video" | "audio";
  capabilities?: { category?: string; category_label?: string; tags?: string[]; canvas_supported?: boolean; unsupported_reason?: string; requirements?: ModelRequirements; parameters?: { resolutions?: string[]; ratios?: string[]; duration?: { min: number; max: number; default: number }; voice_supported?: boolean; voice_required?: boolean } };
};
const DEFAULT_IMAGE_RESOLUTIONS=["1k","2k"];
const DEFAULT_VIDEO_RESOLUTIONS=["480p","720p","1080p","2k","4k"];
const DEFAULT_IMAGE_RATIOS=["1:1","16:9","9:16","4:3","3:4","3:2","2:3","21:9"];
const DEFAULT_VIDEO_RATIOS=["16:9","9:16","1:1","4:3","3:4","21:9"];

type ResizeHandle="n"|"s"|"e"|"w"|"ne"|"nw"|"se"|"sw";
const RESIZE_HANDLES:{handle:ResizeHandle;label:string;className:string;markerClassName:string}[]=[
  {handle:"n",label:"拖动上边缘调整高度",className:"-top-1.5 left-3 right-3 h-3 cursor-ns-resize",markerClassName:"left-1/2 top-1 h-1 w-8 -translate-x-1/2"},
  {handle:"s",label:"拖动下边缘调整高度",className:"-bottom-1.5 left-3 right-3 h-3 cursor-ns-resize",markerClassName:"bottom-1 left-1/2 h-1 w-8 -translate-x-1/2"},
  {handle:"w",label:"拖动左边缘调整宽度",className:"-left-1.5 bottom-3 top-3 w-3 cursor-ew-resize",markerClassName:"left-1 top-1/2 h-8 w-1 -translate-y-1/2"},
  {handle:"e",label:"拖动右边缘调整宽度",className:"-right-1.5 bottom-3 top-3 w-3 cursor-ew-resize",markerClassName:"right-1 top-1/2 h-8 w-1 -translate-y-1/2"},
  {handle:"nw",label:"拖动左上角调整宽高",className:"-left-2 -top-2 h-4 w-4 cursor-nwse-resize",markerClassName:"inset-0"},
  {handle:"ne",label:"拖动右上角调整宽高",className:"-right-2 -top-2 h-4 w-4 cursor-nesw-resize",markerClassName:"inset-0"},
  {handle:"sw",label:"拖动左下角调整宽高",className:"-bottom-2 -left-2 h-4 w-4 cursor-nesw-resize",markerClassName:"inset-0"},
  {handle:"se",label:"拖动右下角调整宽高",className:"-bottom-2 -right-2 h-4 w-4 cursor-nwse-resize",markerClassName:"inset-0"},
];

type VoiceOption={id:string;label:string};
type VoiceProfile={id:string;projectId:string|null;projectName:string;name:string;voiceId:string;sourceModel:string;lastUsedAt:string|null;createdAt:string;updatedAt:string};
type PromptRef={id:string;src:string;path?:string;name:string};
const VOICE_EXPIRY_MS=7*24*3600*1000;
const voiceExpiry=(voice:VoiceProfile)=>{
  const base=Date.parse(voice.lastUsedAt||voice.createdAt);
  if(!Number.isFinite(base))return null;
  const left=base+VOICE_EXPIRY_MS-Date.now();
  return{expired:left<=0,daysLeft:Math.max(0,Math.ceil(left/86400000))};
};
const DOUBAO_VOICES:VoiceOption[]=[
  {id:"zh_female_vv_uranus_bigtts",label:"Vivi 2.0 · 女声"},
  {id:"zh_male_shaonianzixin_uranus_bigtts",label:"少年梓辛 · 男声"},
  {id:"zh_male_yunzhou_jupiter_bigtts",label:"云舟 · 男声"},
];
const MINIMAX_VOICES:VoiceOption[]=[
  {id:"male-qn-qingse",label:"青涩青年 · 男声"},
  {id:"male-qn-jingying",label:"精英青年 · 男声"},
  {id:"male-qn-badao",label:"霸道青年 · 男声"},
  {id:"female-shaonv",label:"少女 · 女声"},
  {id:"female-yujie",label:"御姐 · 女声"},
  {id:"female-chengshu",label:"成熟女性"},
  {id:"female-tianmei",label:"甜美女声"},
  {id:"presenter_male",label:"主持人 · 男声"},
  {id:"presenter_female",label:"主持人 · 女声"},
];
const QWEN_VOICES:VoiceOption[]=[
  {id:"Cherry",label:"Cherry · 明亮自然女声"},
  {id:"Serena",label:"Serena · 温柔女声"},
  {id:"Chelsie",label:"Chelsie · 轻柔女声"},
  {id:"Ethan",label:"Ethan · 清朗男声"},
];

function compatibleCatalog(models: CatalogModel[], kind: CatalogModel["kind"], counts: MediaInputCounts) {
  return models.filter((model) => model.kind === kind && modelCompatibility(model, counts).compatible);
}

function CatalogOptions({ models, kind, counts }: { models: CatalogModel[]; kind: CatalogModel["kind"]; counts: MediaInputCounts }) {
  const matching = compatibleCatalog(models, kind, counts);
  if (!models.length) return kind === "image" ? <>
    <option value="zhenzhen-image-g-v2.5-lowprice">Zhenzhen Image G v2.5 · 低价版</option>
    <option value="seedream-v5-pro-t2i">Seedream 5 Pro</option>
  </> : kind === "video" ? <option value="seedance-2.5-standard-t2v">Seedance 2.5 Standard · 文生视频</option> : <option value="doubao-seed-audio-1.0">Doubao Seed Audio 1.0</option>;
  if (!matching.length) return <option value="" disabled>当前输入条件下没有可用模型</option>;
  const groups = matching.reduce<Record<string, CatalogModel[]>>((result, model) => {
    const label = model.capabilities?.category_label || "其他模型";
    (result[label] ||= []).push(model);
    return result;
  }, {});
  return <>{Object.entries(groups).map(([label, entries]) => (
    <optgroup key={label} label={label}>
      {entries.map((model) => <option key={model.id} value={model.model_id}>{model.display_name}</option>)}
    </optgroup>
  ))}</>;
}

const UnionIcon = ({ size = 15, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
    <path fillRule="evenodd" clipRule="evenodd" d="M3 2a1 1 0 00-1 1v6a1 1 0 001 1h2v3a1 1 0 001 1h6a1 1 0 001-1V7a1 1 0 00-1-1h-2V3a1 1 0 00-1-1H3zm6 4V3H3v6h2a1 1 0 001-1V6h3zm1 1v2a1 1 0 00-1 1H7v3h6V7h-3z" />
  </svg>
);

const SubtractIcon = ({ size = 15, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
    <path fillRule="evenodd" clipRule="evenodd" d="M3 2a1 1 0 00-1 1v6a1 1 0 001 1h2v-3a1 1 0 011-1h3V3a1 1 0 00-1-1H3zm3 4a1 1 0 00-1 1v6a1 1 0 001 1h6a1 1 0 001-1V7a1 1 0 00-1-1H6zm1 2h5v5H7V8z" />
  </svg>
);

const IntersectIcon = ({ size = 15, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
    <path fillRule="evenodd" clipRule="evenodd" d="M3 2a1 1 0 00-1 1v6a1 1 0 001 1h2v3a1 1 0 001 1h6a1 1 0 001-1V7a1 1 0 00-1-1h-2V3a1 1 0 00-1-1H3zm6 4H6v3h3V6zM3 3h5v2H6a1 1 0 00-1 1v2H3V3zm8 5v5H8v-2h2a1 1 0 001-1V8h2z" fillOpacity="0.25" />
    <path d="M6 6h3v3H6V6z" />
  </svg>
);

const ExcludeIcon = ({ size = 15, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
    <path fillRule="evenodd" clipRule="evenodd" d="M3 2a1 1 0 00-1 1v6a1 1 0 001 1h2v3a1 1 0 001 1h6a1 1 0 001-1V7a1 1 0 00-1-1h-2V3a1 1 0 00-1-1H3zm6 4H6v3h3V6zm-6-3h5v2H6a1 1 0 00-1 1v2H3V3zm8 5v5H8v-2h2a1 1 0 001-1V8h2z" />
  </svg>
);

const runBooleanOp = async (
  s: ReturnType<typeof useCanvas.getState>,
  op: "unite" | "subtract" | "intersect" | "exclude",
) => {
  const vectorNodes = s.nodes.filter(
    (item) =>
      s.selected.includes(item.id) &&
      ["rect", "ellipse", "polygon", "path"].includes(item.kind),
  );
  if (vectorNodes.length < 2) return;

  const paper = (await import("paper")).default;
  paper.setup(new paper.Size(4000, 4000));

  const toPath = (item: CanvasNode): paper.PathItem => {
    let p: paper.PathItem;
    const rect = new paper.Rectangle(item.x, item.y, item.width, item.height);
    if (item.kind === "ellipse") {
      p = new paper.Path.Ellipse(rect);
    } else if (item.kind === "polygon") {
      const poly = new paper.Path([
        [item.x + item.width / 2, item.y],
        [item.x + item.width, item.y + item.height * 0.38],
        [item.x + item.width * 0.82, item.y + item.height],
        [item.x + item.width * 0.18, item.y + item.height],
        [item.x, item.y + item.height * 0.38],
      ]);
      poly.closed = true;
      p = poly;
    } else if (item.kind === "path" && item.pathData) {
      const raw = new paper.Path(item.pathData);
      raw.translate(new paper.Point(item.x, item.y));
      p = raw;
    } else {
      if (item.cornerRadius) {
        p = new paper.Path.Rectangle(rect, new paper.Size(item.cornerRadius, item.cornerRadius));
      } else {
        p = new paper.Path.Rectangle(rect);
      }
    }
    if (item.rotation) {
      p.rotate(item.rotation, new paper.Point(item.x + item.width / 2, item.y + item.height / 2));
    }
    return p;
  };

  let result = toPath(vectorNodes[0]);
  for (const item of vectorNodes.slice(1)) {
    const next = toPath(item);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const computed = (result as any)[op](next) as paper.PathItem;
    if (computed) {
      result = computed;
    }
  }

  if (!result || !result.bounds || result.bounds.width === 0 || result.bounds.height === 0) {
    return;
  }

  const bounds = result.bounds.clone();
  result.translate(new paper.Point(-bounds.x, -bounds.y));
  const pathData = result.pathData;
  if (!pathData) return;

  const baseNode = vectorNodes[0];
  const opNames = {
    unite: "联集",
    subtract: "减去顶层",
    intersect: "交集",
    exclude: "排除重叠",
  };
  const id = s.createBoolean(
    vectorNodes.map((n) => n.id),
    {
      x: bounds.x,
      y: bounds.y,
      width: Math.max(1, Math.round(bounds.width)),
      height: Math.max(1, Math.round(bounds.height)),
      pathViewWidth: Math.max(1, Math.round(bounds.width)),
      pathViewHeight: Math.max(1, Math.round(bounds.height)),
      pathData,
      fill: baseNode.fill === "transparent" ? "#ffffff" : baseNode.fill,
      stroke: baseNode.stroke === "transparent" ? "#252525" : baseNode.stroke,
      name: opNames[op] || `布尔 ${op}`,
      op,
    },
  );
  s.setSelected([id]);
};

function requireLogin(){useAuthUI.getState().openLogin();}
const PEER_COLORS=["#f2555a","#f5a623","#4a90d9","#7ed321","#bd10e0","#00b8a9","#ec4899","#8b5cf6"];
const peerColor=(id:string)=>{let h=0;for(let i=0;i<id.length;i++)h=(h*31+id.charCodeAt(i))>>>0;return PEER_COLORS[h%PEER_COLORS.length];};
let commentBus: WebSocket | null = null;
const broadcastComment = (data: Record<string, unknown>) => {
  if (commentBus?.readyState === WebSocket.OPEN)
    commentBus.send(JSON.stringify({ type: "comment", ...data }));
};
function AvatarBubble({id,name,email,online,isMe}:{id:string;name:string;email?:string;online?:boolean;isMe?:boolean}){
  return (
    <span className="group/avatar relative inline-flex">
      <span className="relative grid h-7 w-7 place-items-center rounded-full border-2 border-white text-[11px] font-bold text-white shadow" style={{background:peerColor(id)}}>
        {name.slice(0,1)}
        {online&&<span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-green-500"/>}
      </span>
      <span className="pointer-events-none absolute left-1/2 top-full z-[120] mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-(--line) bg-white px-2.5 py-1.5 shadow-xl group-hover/avatar:block">
        <b className="block text-[11px] font-semibold text-(--ink)">{name}{isMe?"（我）":""}</b>
        {email&&<span className="block text-[10px] text-(--muted)">{email}</span>}
        <span className={`block text-[10px] ${online?"text-green-600":"text-(--muted)"}`}>{online?"在线":"离线"}</span>
      </span>
    </span>
  );
}
const toolItems: { id: Tool; label: string; icon: React.ReactNode }[] = [
  { id: "select", label: "选择", icon: <MousePointer2 size={18} /> },
  { id: "hand", label: "拖动画布", icon: <Hand size={18} /> },
  { id: "rect", label: "矩形", icon: <Square size={18} /> },
  { id: "ellipse", label: "椭圆", icon: <Circle size={18} /> },
  { id: "polygon", label: "多边形", icon: <Shapes size={18} /> },
  { id: "pen", label: "钢笔", icon: <PenTool size={18} /> },
  { id: "text", label: "文本", icon: <Type size={18} /> },
  { id: "frame", label: "Frame", icon: <Frame size={18} /> },
  { id: "image", label: "上传图片", icon: <ImageIcon size={18} /> },
  { id: "video", label: "上传视频", icon: <Video size={18} /> },
  { id: "audio", label: "上传音频", icon: <AudioLines size={18} /> },
  { id: "scene", label: "场景生成", icon: <Waypoints size={18} /> },
  { id: "image-gen", label: "图片生成", icon: <Sparkles size={18} /> },
  { id: "video-gen", label: "视频生成", icon: <Film size={18} /> },
  { id: "audio-gen", label: "音频生成", icon: <AudioLines size={18} /> },
  { id: "comment", label: "评论", icon: <MessageCircle size={18} /> },
];
const GEN_KINDS = ["image-gen", "video-gen", "audio-gen"];
const MEDIA_KINDS = ["image", "video", "audio", ...GEN_KINDS];
const GENERATION_INPUT_KINDS = ["image", "video", "audio", ...GEN_KINDS];
const fmtTime=(sec:number)=>{if(!Number.isFinite(sec)||sec<=0)return"0:00";const m=Math.floor(sec/60),s=Math.floor(sec%60);return`${m}:${String(s).padStart(2,"0")}`};
function BufferedTextarea({value,onCommit,ariaLabel,placeholder,className,style}:{value:string;onCommit:(value:string)=>void;ariaLabel:string;placeholder?:string;className:string;style?:React.CSSProperties}){
  const ref=useRef<HTMLTextAreaElement|null>(null);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const pending=useRef(value);
  const commit=()=>{if(timer.current){clearTimeout(timer.current);timer.current=null;}onCommit(pending.current);};
  useEffect(()=>{const element=ref.current;if(element&&document.activeElement!==element){element.value=value;pending.current=value;}},[value]);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  return <textarea ref={ref} defaultValue={value} style={style} className={className} aria-label={ariaLabel} placeholder={placeholder} onChange={e=>{pending.current=e.target.value;if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(commit,140);}} onBlur={commit}/>;
}
function BufferedInput({value,onCommit,ariaLabel,placeholder,className,maxLength}:{value:string;onCommit:(value:string)=>void;ariaLabel:string;placeholder?:string;className:string;maxLength?:number}){
  const ref=useRef<HTMLInputElement|null>(null);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const pending=useRef(value);
  const commit=()=>{if(timer.current){clearTimeout(timer.current);timer.current=null;}onCommit(pending.current);};
  useEffect(()=>{const element=ref.current;if(element&&document.activeElement!==element){element.value=value;pending.current=value;}},[value]);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  return <input ref={ref} defaultValue={value} className={className} aria-label={ariaLabel} placeholder={placeholder} maxLength={maxLength} onChange={e=>{pending.current=e.target.value;if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(commit,140);}} onBlur={commit}/>;
}
const PROMPT_FONT_KEY="mini-canvas:prompt-font-size";
const TOOLBAR_SIZE_KEY="mini-canvas:toolbar-size";
// 用户全局设置：localStorage 持久化，同页通过同名事件即时同步到其他实例，跨标签页走 storage 事件
function usePersistentValue<T>(key:string,fallback:T,parse:(raw:string|null)=>T){
  const parseRef=useRef(parse);
  useEffect(()=>{parseRef.current=parse;});
  const [value,setValue]=useState<T>(fallback);
  useEffect(()=>{
    const read=()=>setValue(parseRef.current(localStorage.getItem(key)));
    read();
    window.addEventListener("storage",read);
    window.addEventListener(key,read);
    return()=>{window.removeEventListener("storage",read);window.removeEventListener(key,read);};
  },[key]);
  const set=useCallback((next:T)=>{setValue(next);try{localStorage.setItem(key,JSON.stringify(next));}catch{}window.dispatchEvent(new Event(key));},[key]);
  return [value,set] as const;
}
function PromptReferenceInput({value,onCommit,refs,onRefsChange,candidates,onUpload,fontSize}:{
  value:string;
  onCommit:(value:string)=>void;
  refs:PromptRef[];
  onRefsChange:(refs:PromptRef[])=>void;
  candidates:PromptRef[];
  onUpload:(file:File)=>Promise<PromptRef|null>;
  fontSize:number;
}){
  const ref=useRef<HTMLTextAreaElement|null>(null);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const pending=useRef(value);
  const fileRef=useRef<HTMLInputElement|null>(null);
  const mirrorRef=useRef<HTMLDivElement|null>(null);
  const [picker,setPicker]=useState<{start:number;filter:string}|null>(null);
  const [pickerPos,setPickerPos]=useState<{left:number;top:number}>({left:0,top:0});
  const [uploading,setUploading]=useState(false);
  const commit=()=>{if(timer.current){clearTimeout(timer.current);timer.current=null;}onCommit(pending.current);};
  useEffect(()=>{const element=ref.current;if(element&&document.activeElement!==element){element.value=value;pending.current=value;}},[value]);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  const available=candidates.filter(item=>!refs.some(r=>r.src===item.src));
  const filtered=picker?available.filter(item=>!picker.filter||item.name.toLocaleLowerCase("zh-CN").includes(picker.filter.toLocaleLowerCase("zh-CN"))):[];
  // 镜像 div 测量 @ 符号在 textarea 里的坐标，下拉框锚定到符号旁边
  const measure=(element:HTMLTextAreaElement,index:number)=>{
    const mirror=mirrorRef.current;
    if(!mirror)return{left:0,top:0};
    const style=getComputedStyle(element);
    mirror.style.font=style.font;
    mirror.style.padding=style.padding;
    mirror.style.width=`${element.clientWidth}px`;
    mirror.style.lineHeight=style.lineHeight;
    mirror.style.letterSpacing=style.letterSpacing;
    mirror.textContent=element.value.slice(0,index);
    const marker=document.createElement("span");
    mirror.appendChild(marker);
    const lineHeight=parseFloat(style.lineHeight)||18;
    return{left:Math.max(0,Math.min(marker.offsetLeft,element.clientWidth-232)),top:marker.offsetTop-element.scrollTop+lineHeight+4};
  };
  const track=(element:HTMLTextAreaElement)=>{
    const cursor=element.selectionStart??element.value.length;
    const before=element.value.slice(0,cursor);
    const at=before.lastIndexOf("@");
    if(at>=0&&!/[\s@]/.test(before.slice(at+1))){
      setPicker({start:at,filter:before.slice(at+1)});
      setPickerPos(measure(element,at));
    }
    else setPicker(null);
  };
  const insert=(item:PromptRef)=>{
    const element=ref.current;
    if(!element||!picker)return;
    const cursor=element.selectionStart??element.value.length;
    const next=`${element.value.slice(0,picker.start)}@${item.name} ${element.value.slice(cursor)}`;
    element.value=next;
    pending.current=next;
    const pos=picker.start+item.name.length+2;
    element.setSelectionRange(pos,pos);
    onRefsChange([...refs,item]);
    setPicker(null);
    commit();
  };
  const upload=async(file:File)=>{
    setUploading(true);
    try{const item=await onUpload(file);if(item)insert(item);}
    finally{setUploading(false);}
  };
  return <div className="relative">
    <textarea ref={ref} defaultValue={value} style={{fontSize}} className="field min-h-20 w-full" aria-label="生成提示词" placeholder="描述要生成的内容，输入 @ 引用参考图" onChange={e=>{pending.current=e.target.value;track(e.target);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(commit,140);}} onBlur={commit} onKeyDown={e=>{if(e.key==="Escape"&&picker){setPicker(null);e.stopPropagation();}}}/>
    <div ref={mirrorRef} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 whitespace-pre-wrap break-words"/>
    {picker&&<div className="absolute z-40 max-h-48 w-56 overflow-auto rounded-lg border border-(--line) bg-white p-1 shadow-xl" style={{left:pickerPos.left,top:pickerPos.top}}>
      {filtered.map(item=><button key={item.id} type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-(--accent-tint)" onMouseDown={e=>e.preventDefault()} onClick={()=>insert(item)}>
        <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded"><Image src={item.src} alt={item.name} fill sizes="32px" unoptimized className="object-cover"/></span>
        <span className="min-w-0 flex-1 truncate">{item.name}</span>
      </button>)}
      <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-(--muted) hover:bg-(--accent-tint) disabled:opacity-50" disabled={uploading} onMouseDown={e=>e.preventDefault()} onClick={()=>fileRef.current?.click()}>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded border border-dashed"><Plus size={14}/></span>
        {uploading?"上传中…":"上传新图片"}
      </button>
      {picker.filter.length>0&&filtered.length===0&&<p className="px-2 py-1 text-[10px] text-(--muted)">没有匹配的参考图</p>}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.currentTarget.value="";}}/>
    </div>}
    {refs.length>0&&<div className="mt-1.5 flex flex-wrap gap-1.5">{refs.map(item=><span key={item.id} className="flex items-center gap-1 rounded-lg border border-(--line) bg-(--bg) py-0.5 pl-0.5 pr-1.5 text-[10px]">
      <span className="relative h-6 w-6 overflow-hidden rounded"><Image src={item.src} alt={item.name} fill sizes="24px" unoptimized className="object-cover"/></span>
      <span className="max-w-20 truncate">{item.name}</span>
      <button type="button" aria-label={`移除参考图${item.name}`} className="text-(--muted) hover:text-[#b44]" onClick={()=>onRefsChange(refs.filter(r=>r.id!==item.id))}><X size={10}/></button>
    </span>)}</div>}
  </div>;
}
const isNodeKind = (t: Tool): t is Exclude<NodeKind, "path"> =>
  [
    "rect",
    "ellipse",
    "polygon",
    "text",
    "frame",
    "image",
    "video",
    "audio",
    "scene",
    "image-gen",
    "video-gen",
    "audio-gen",
  ].includes(t);
const editablePath=(data:string)=>{
  if(!/^[\s\d.,+\-MLCZmlcz]+$/.test(data))return null;
  const tokens=data.match(/[MLCZmlcz]|[-+]?\d*\.?\d+/g)||[];
  const points:{index:number;x:number;y:number}[]=[];
  for(let i=0;i<tokens.length-1;i++)if(!Number.isNaN(Number(tokens[i]))&&!Number.isNaN(Number(tokens[i+1]))){points.push({index:i,x:Number(tokens[i]),y:Number(tokens[i+1])});i++}
  return {tokens,points};
};
const parseColor=(value:string):{color:string;alpha:number}=>{
  if(!value||value==="transparent")return{color:"#ffffff",alpha:0};
  if(/^#[0-9a-fA-F]{8}$/.test(value))return{color:value.slice(0,7),alpha:parseInt(value.slice(7),16)/255};
  if(/^#[0-9a-fA-F]{4}$/.test(value))return{color:`#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`,alpha:parseInt(`${value[4]}${value[4]}`,16)/255};
  if(/^#[0-9a-fA-F]{6}$/.test(value))return{color:value,alpha:1};
  return{color:"#ffffff",alpha:1};
};
const withAlpha=(color:string,alpha:number)=>alpha>=1?color.slice(0,7):`${color.slice(0,7)}${Math.round(Math.max(0,alpha)*255).toString(16).padStart(2,"0")}`;
const isTransparentColor=(value:string)=>!value||value==="transparent"||parseColor(value).alpha===0;
function ColorAlphaField({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}){
  const {color,alpha}=parseColor(value);
  return (
    <label className="block min-w-0">{label}
      <span className="mt-1 flex items-center gap-1.5">
        <input aria-label={label} type="color" className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-(--line) bg-transparent p-1" value={color} onChange={e=>onChange(withAlpha(e.target.value,alpha===0?1:alpha))}/>
        <input aria-label={`${label}透明度`} title="透明度" type="range" min={0} max={100} className="min-w-0 flex-1" value={Math.round(alpha*100)} onChange={e=>onChange(withAlpha(color,Number(e.target.value)/100))}/>
        <span className="w-8 shrink-0 text-right text-[10px] text-(--muted)">{Math.round(alpha*100)}%</span>
      </span>
    </label>
  );
}
function Curve({
  from,
  to,
  active,
  onDelete,
}: {
  from: CanvasNode;
  to: CanvasNode;
  active: boolean;
  onDelete: () => void;
}) {
  const A=from,B=to;
  const x1 = A.x + A.width,
    y1 = A.y + A.height / 2,
    x2 = B.x,
    y2 = B.y + B.height / 2,
    c = Math.max(80, Math.abs(x2 - x1) * 0.45);
  return (
    <g onDoubleClick={onDelete} className="cursor-pointer">
      <path
        d={`M${x1} ${y1} C${x1 + c} ${y1},${x2 - c} ${y2},${x2} ${y2}`}
        fill="none"
        stroke="transparent"
        strokeWidth="16"
      />
      <path
        d={`M${x1} ${y1} C${x1 + c} ${y1},${x2 - c} ${y2},${x2} ${y2}`}
        fill="none"
        stroke={active ? "var(--accent)" : "var(--muted)"}
        strokeWidth={active ? 3 : 2}
        strokeDasharray={active ? "0" : "6 6"}
      />
    </g>
  );
}
const MAX_MEDIA_NODE_SIDE=480;
const fitMediaSize=(w:number,h:number)=>{const scale=Math.min(1,MAX_MEDIA_NODE_SIDE/Math.max(w,h)||1);return{width:Math.max(40,Math.round(w*scale)),height:Math.max(40,Math.round(h*scale))}};
const probeMediaSize=(kind:"image"|"video",url:string)=>new Promise<{width:number;height:number}|null>(resolve=>{
  if(kind==="image"){const img=new window.Image();img.onload=()=>resolve(fitMediaSize(img.naturalWidth,img.naturalHeight));img.onerror=()=>resolve(null);img.src=url;return;}
  const video=document.createElement("video");video.preload="metadata";video.onloadedmetadata=()=>resolve(fitMediaSize(video.videoWidth,video.videoHeight));video.onerror=()=>resolve(null);video.src=url;
});
const downloadNode=async(node:CanvasNode)=>{
  if(!node.src)return;
  try{
    const response=await fetch(node.src);
    if(!response.ok)throw new Error("下载失败");
    const blob=await response.blob();
    const rawExt=blob.type.split("/")[1]?.split(";")[0]||(node.kind.includes("video")?"mp4":"png");
    const ext=rawExt==="jpeg"?"jpg":rawExt;
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=`${node.name||"media"}.${ext}`;
    a.click();URL.revokeObjectURL(url);
  }catch{window.open(node.src,"_blank");}
};
const extractImageNode=(s:ReturnType<typeof useCanvas.getState>,node:CanvasNode)=>{
  if(!node.src)return;
  const id=s.addNode("image",node.x+node.width+60,node.y);
  s.updateNode(id,{name:node.name||"生成图片",src:node.src,srcPath:node.srcPath,assetId:node.assetId},false);
  void probeMediaSize("image",node.src).then(size=>{if(size)useCanvas.getState().updateNode(id,size,false);});
};
const FRAME_LABEL={first:"首帧",last:"尾帧",current:"当前帧"} as const;
type FrameAt=keyof typeof FRAME_LABEL;
function MediaPreviewModal({src,isVideo,name,onClose}:{src:string;isVideo:boolean;name?:string;onClose:()=>void}){
  useEffect(()=>{
    const close=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose();};
    addEventListener("keydown",close);
    return()=>removeEventListener("keydown",close);
  },[onClose]);
  if(typeof document==="undefined")return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] grid cursor-zoom-out place-items-center bg-black/75 p-10" onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onClose();}}>
      <div className="relative max-h-full max-w-full" onClick={e=>e.stopPropagation()}>
        {isVideo?(
          <video src={src} controls autoPlay playsInline className="max-h-[85vh] max-w-[90vw] rounded-xl shadow-2xl"/>
        ):(
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={src} alt={name||"预览"} className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"/>
        )}
        <button aria-label="关闭预览" className="absolute -right-3 -top-3 grid h-8 w-8 place-items-center rounded-full bg-white text-(--ink) shadow-lg hover:bg-(--bg)" onClick={onClose}>
          <X size={16}/>
        </button>
      </div>
    </div>,
    document.body,
  );
}
type DoodleStroke={color:string;size:number;erase:boolean;points:{x:number;y:number}[]};
const DOODLE_COLORS=["#ef4444","#f59e0b","#22c55e","#3b82f6","#111111","#ffffff"];
const drawDoodleStroke=(ctx:CanvasRenderingContext2D,stroke:DoodleStroke)=>{
  if(!stroke.points.length)return;
  ctx.save();
  ctx.globalCompositeOperation=stroke.erase?"destination-out":"source-over";
  ctx.strokeStyle=stroke.color;
  ctx.fillStyle=stroke.color;
  ctx.lineWidth=stroke.size;
  ctx.lineCap="round";
  ctx.lineJoin="round";
  if(stroke.points.length===1){ctx.beginPath();ctx.arc(stroke.points[0].x,stroke.points[0].y,stroke.size/2,0,Math.PI*2);ctx.fill();}
  else{ctx.beginPath();ctx.moveTo(stroke.points[0].x,stroke.points[0].y);for(const p of stroke.points.slice(1))ctx.lineTo(p.x,p.y);ctx.stroke();}
  ctx.restore();
};
function DoodleEditModal({src,initialPrompt,fontSize,busy,error,onCreate,onClose}:{src:string;initialPrompt:string;fontSize:number;busy:boolean;error:string;onCreate:(blob:Blob,prompt:string)=>void;onClose:()=>void}){
  const imgRef=useRef<HTMLImageElement|null>(null);
  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const strokesRef=useRef<DoodleStroke[]>([]);
  const drawingRef=useRef<DoodleStroke|null>(null);
  const promptRef=useRef(initialPrompt);
  const [size,setSize]=useState<{width:number;height:number}|null>(null);
  const [color,setColor]=useState(DOODLE_COLORS[0]);
  const [brushSize,setBrushSize]=useState(12);
  const [erase,setErase]=useState(false);
  const [strokeCount,setStrokeCount]=useState(0);
  const [localError,setLocalError]=useState("");
  useEffect(()=>{
    const close=(e:KeyboardEvent)=>{if(e.key==="Escape"&&!busy)onClose();};
    addEventListener("keydown",close);
    return()=>removeEventListener("keydown",close);
  },[onClose,busy]);
  const syncSize=useCallback(()=>{const el=imgRef.current;if(el&&el.naturalWidth)setSize({width:el.clientWidth,height:el.clientHeight});},[]);
  useEffect(()=>{syncSize();},[syncSize]);
  const repaint=()=>{
    const canvas=canvasRef.current;
    const ctx=canvas?.getContext("2d");
    if(!canvas||!ctx)return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for(const stroke of strokesRef.current)drawDoodleStroke(ctx,stroke);
  };
  const pointAt=(e:React.PointerEvent)=>{
    const rect=canvasRef.current!.getBoundingClientRect();
    return{x:e.clientX-rect.left,y:e.clientY-rect.top};
  };
  const down=(e:React.PointerEvent)=>{
    e.stopPropagation();
    const canvas=canvasRef.current;
    if(!canvas||busy)return;
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current={color,size:brushSize,erase,points:[pointAt(e)]};
    const ctx=canvas.getContext("2d");
    if(ctx)drawDoodleStroke(ctx,drawingRef.current);
  };
  const move=(e:React.PointerEvent)=>{
    const stroke=drawingRef.current;
    if(!stroke)return;
    e.stopPropagation();
    stroke.points.push(pointAt(e));
    const ctx=canvasRef.current?.getContext("2d");
    const n=stroke.points.length;
    if(ctx&&n>1){
      ctx.save();
      ctx.globalCompositeOperation=stroke.erase?"destination-out":"source-over";
      ctx.strokeStyle=stroke.color;
      ctx.lineWidth=stroke.size;
      ctx.lineCap="round";
      ctx.lineJoin="round";
      ctx.beginPath();
      ctx.moveTo(stroke.points[n-2].x,stroke.points[n-2].y);
      ctx.lineTo(stroke.points[n-1].x,stroke.points[n-1].y);
      ctx.stroke();
      ctx.restore();
    }
  };
  const up=(e:React.PointerEvent)=>{
    if(!drawingRef.current)return;
    e.stopPropagation();
    strokesRef.current.push(drawingRef.current);
    drawingRef.current=null;
    setStrokeCount(strokesRef.current.length);
  };
  const flatten=async()=>{
    if(!size)throw new Error("图片尚未加载完成");
    const response=await fetch(src);
    if(!response.ok)throw new Error("原图加载失败");
    const url=URL.createObjectURL(await response.blob());
    try{
      const img=await new Promise<HTMLImageElement>((resolve,reject)=>{const el=new window.Image();el.onload=()=>resolve(el);el.onerror=()=>reject(new Error("原图解码失败"));el.src=url;});
      const out=document.createElement("canvas");
      out.width=img.naturalWidth;
      out.height=img.naturalHeight;
      const ctx=out.getContext("2d");
      if(!ctx)throw new Error("无法创建画布");
      ctx.drawImage(img,0,0,out.width,out.height);
      ctx.save();
      ctx.scale(out.width/size.width,out.width/size.width);
      for(const stroke of strokesRef.current)drawDoodleStroke(ctx,stroke);
      ctx.restore();
      return await new Promise<Blob>((resolve,reject)=>out.toBlob(blob=>blob?resolve(blob):reject(new Error("合成图片失败")),"image/png"));
    }finally{URL.revokeObjectURL(url);}
  };
  if(typeof document==="undefined")return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] grid place-items-center bg-black/60 p-6" onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();if(!busy)onClose();}}>
      <div className="flex max-h-full w-[min(94vw,1100px)] flex-col gap-3 rounded-2xl bg-white p-4 shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <b className="text-sm">涂鸦编辑</b>
          <button aria-label="关闭涂鸦编辑" className="icon-btn !h-7 !w-7 disabled:opacity-50" disabled={busy} onClick={onClose}><X size={14}/></button>
        </div>
        <div className="flex min-h-0 flex-1 gap-4">
          <div className="grid min-h-0 flex-1 place-items-center overflow-auto rounded-xl bg-(--bg) p-2">
            <div className="relative" style={size?{width:size.width,height:size.height}:undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img ref={imgRef} src={src} alt="涂鸦底图" draggable={false} onLoad={syncSize} className="block max-h-[62vh] max-w-full select-none rounded-lg"/>
              {size&&<canvas ref={canvasRef} width={size.width} height={size.height} aria-label="涂鸦区域" className="absolute inset-0 touch-none cursor-crosshair" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}/>}
            </div>
          </div>
          <div className="flex w-60 shrink-0 flex-col gap-3 overflow-auto">
            <div>
              <div className="mb-1 text-[10px] text-(--muted)">笔刷颜色</div>
              <div className="flex flex-wrap gap-1.5">{DOODLE_COLORS.map(item=><button key={item} type="button" aria-label={`颜色 ${item}`} className={`h-7 w-7 rounded-full border border-black/15 transition ${color===item&&!erase?"ring-2 ring-(--accent) ring-offset-1":""}`} style={{background:item}} onClick={()=>{setColor(item);setErase(false);}}/>)}</div>
            </div>
            <label className="block text-[10px] text-(--muted)">粗细<input aria-label="笔刷粗细" type="range" min={2} max={40} value={brushSize} onChange={e=>setBrushSize(Number(e.target.value))} className="mt-1 w-full"/></label>
            <div className="flex gap-1.5">
              <button type="button" title="橡皮" className={`grid h-8 flex-1 place-items-center rounded-lg border ${erase?"border-(--accent) bg-(--accent-tint) text-(--accent)":"border-(--line) text-(--muted)"}`} onClick={()=>setErase(v=>!v)}><Eraser size={14}/></button>
              <button type="button" title="撤销上一笔" disabled={!strokeCount} className="grid h-8 flex-1 place-items-center rounded-lg border border-(--line) text-(--muted) disabled:opacity-40" onClick={()=>{strokesRef.current.pop();setStrokeCount(strokesRef.current.length);repaint();}}><Undo2 size={14}/></button>
              <button type="button" title="清空涂鸦" disabled={!strokeCount} className="h-8 flex-1 rounded-lg border border-(--line) text-[10px] text-(--muted) disabled:opacity-40" onClick={()=>{strokesRef.current=[];setStrokeCount(0);repaint();}}>清空</button>
            </div>
            <BufferedTextarea className="field min-h-24 w-full flex-1" style={{fontSize}} ariaLabel="编辑提示词" placeholder="描述要如何修改这张图，例如：把红色圈出的区域改成蓝色" value={initialPrompt} onCommit={value=>{promptRef.current=value;}}/>
            <button className="rounded-lg bg-(--btn) px-4 py-2 text-white disabled:opacity-50" disabled={busy||!size} onClick={()=>{setLocalError("");flatten().then(blob=>onCreate(blob,promptRef.current.trim()||"根据涂鸦标记修改图片")).catch(e=>setLocalError(e instanceof Error?e.message:"合成图片失败"));}}>
              {busy?"正在创建…":"创建编辑节点"}
            </button>
            {(error||localError)&&<p role="status" className="text-[11px] text-[#b44]">{error||localError}</p>}
            <p className="text-[10px] leading-4 text-(--muted)">在图片上涂出要修改的区域并填写提示词，创建后原图和涂鸦合成图会作为参考连到编辑节点，确认后点「生成」。</p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
function PromptEditorModal({value,fontSize,onCommit,onClose}:{value:string;fontSize:number;onCommit:(value:string)=>void;onClose:()=>void}){
  const [draft,setDraft]=useState(value);
  useEffect(()=>{
    const close=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose();};
    addEventListener("keydown",close);
    return()=>removeEventListener("keydown",close);
  },[onClose]);
  if(typeof document==="undefined")return null;
  const done=()=>{onCommit(draft);onClose();};
  return createPortal(
    <div className="fixed inset-0 z-[200] grid place-items-center bg-black/60 p-8" onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onClose();}}>
      <div className="flex h-[70vh] w-[min(92vw,860px)] flex-col gap-3 rounded-2xl bg-white p-5 shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <b className="text-sm">编辑提示词</b>
          <button aria-label="关闭全屏编辑" className="icon-btn !h-7 !w-7" onClick={onClose}><X size={14}/></button>
        </div>
        <textarea autoFocus aria-label="全屏编辑提示词" className="field min-h-0 flex-1 resize-none" style={{fontSize:Math.max(fontSize,14)}} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==="Enter")done();}}/>
        <div className="flex items-center justify-end gap-3 text-[11px] text-(--muted)">
          <span>Ctrl+Enter 完成</span>
          <button className="rounded-lg bg-(--btn) px-4 py-2 text-white" onClick={done}>完成</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
const captureVideoFrame=async(src:string,at:FrameAt,currentTime:number)=>{
  const response=await fetch(src);
  if(!response.ok)throw new Error("视频加载失败");
  const url=URL.createObjectURL(await response.blob());
  try{
    const video=document.createElement("video");
    video.preload="auto";video.muted=true;video.playsInline=true;video.src=url;
    await new Promise<void>((resolve,reject)=>{video.onloadeddata=()=>resolve();video.onerror=()=>reject(new Error("视频解码失败"));});
    try{await video.play();video.pause();}catch{}
    const duration=Number.isFinite(video.duration)?video.duration:0;
    const target=at==="first"?Math.min(0.04,duration||0.04):at==="last"?Math.max(0,duration-0.05):Math.min(Math.max(0,currentTime),Math.max(0,duration-0.02));
    await new Promise<void>(resolve=>{video.onseeked=()=>resolve();video.currentTime=target;});
    const canvas=document.createElement("canvas");
    canvas.width=video.videoWidth;canvas.height=video.videoHeight;
    if(!canvas.width||!canvas.height)throw new Error("无法读取视频画面");
    const ctx=canvas.getContext("2d");
    if(!ctx)throw new Error("无法创建画布");
    ctx.drawImage(video,0,0,canvas.width,canvas.height);
    return await new Promise<Blob>((resolve,reject)=>{canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("截取帧失败")),"image/png");});
  }finally{URL.revokeObjectURL(url);}
};
type UploadAssetKind="image"|"video"|"audio";
const uploadAssetBlob=async(projectId:string,blob:Blob,filename:string,kind:UploadAssetKind)=>{
  const client=createSupabaseClient();
  if(!client)throw new Error("请先配置 Supabase 存储");
  const {data:{session},error:sessionError}=await client.auth.getSession();
  const user=session?.user;
  if(sessionError||!user){requireLogin();throw new Error("请先登录");}
  const path=`${projectId}/${crypto.randomUUID()}-${filename.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
  const contentType=blob.type||(kind==="audio"?"audio/wav":kind==="video"?"video/mp4":"image/png");
  const {error}=await client.storage.from("project-assets").upload(path,blob,{contentType});
  if(error)throw new Error(error.message);
  const {data:asset,error:assetError}=await client.from("assets").insert({project_id:projectId,owner_id:user.id,kind,storage_path:path,mime_type:contentType,byte_size:blob.size,source:"upload"}).select("id").single();
  if(assetError||!asset){await client.storage.from("project-assets").remove([path]);throw new Error(assetError?.message||"保存素材记录失败");}
  const signed=await client.storage.from("project-assets").createSignedUrl(path,7*86400);
  if(signed.error||!signed.data?.signedUrl)throw new Error(signed.error?.message||"获取素材地址失败");
  return {src:signed.data.signedUrl,srcPath:path,assetId:asset.id};
};
const uploadImageBlob=(projectId:string,blob:Blob,filename:string)=>uploadAssetBlob(projectId,blob,filename,"image");
const encodeWav=(buffer:AudioBuffer,startSeconds=0,endSeconds=buffer.duration)=>{
  const channels=buffer.numberOfChannels;
  const sampleRate=buffer.sampleRate;
  const startFrame=Math.max(0,Math.min(buffer.length,Math.floor(startSeconds*sampleRate)));
  const endFrame=Math.max(startFrame+1,Math.min(buffer.length,Math.ceil(endSeconds*sampleRate)));
  const frameCount=endFrame-startFrame;
  const bytesPerSample=2;
  const dataSize=frameCount*channels*bytesPerSample;
  const bytes=new ArrayBuffer(44+dataSize);
  const view=new DataView(bytes);
  const write=(offset:number,value:string)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
  write(0,"RIFF");view.setUint32(4,36+dataSize,true);write(8,"WAVE");write(12,"fmt ");
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);
  view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*channels*bytesPerSample,true);
  view.setUint16(32,channels*bytesPerSample,true);view.setUint16(34,16,true);write(36,"data");view.setUint32(40,dataSize,true);
  const channelData=Array.from({length:channels},(_,channel)=>buffer.getChannelData(channel));
  let offset=44;
  for(let frame=startFrame;frame<endFrame;frame++)for(let channel=0;channel<channels;channel++){
    const sample=Math.max(-1,Math.min(1,channelData[channel][frame]));
    view.setInt16(offset,sample<0?sample*0x8000:sample*0x7fff,true);offset+=2;
  }
  return new Blob([bytes],{type:"audio/wav"});
};
const audioBufferCache=new globalThis.Map<string,Promise<AudioBuffer>>();
const decodeMediaAudio=(src:string)=>{
  const cached=audioBufferCache.get(src);
  if(cached)return cached;
  const pending=(async()=>{
    const response=await fetch(src);
    if(!response.ok)throw new Error("媒体加载失败");
    const AudioContextClass=window.AudioContext;
    if(!AudioContextClass)throw new Error("当前浏览器不支持音频处理");
    const context=new AudioContextClass();
    try{return await context.decodeAudioData(await response.arrayBuffer());}
    catch{throw new Error("无法解码音轨，请换用 MP3、WAV、M4A、MP4 或 WebM 文件");}
    finally{void context.close();}
  })();
  audioBufferCache.set(src,pending);
  void pending.catch(()=>audioBufferCache.delete(src));
  if(audioBufferCache.size>4){const oldest=audioBufferCache.keys().next().value;if(oldest)audioBufferCache.delete(oldest);}
  return pending;
};
const waveformPeaks=(buffer:AudioBuffer,count=120)=>{
  const peaks:number[]=[];
  const bucket=Math.max(1,Math.floor(buffer.length/count));
  const stride=Math.max(1,Math.floor(bucket/160));
  for(let i=0;i<count;i++){
    const start=i*bucket,end=Math.min(buffer.length,start+bucket);
    let peak=0;
    for(let frame=start;frame<end;frame+=stride)for(let channel=0;channel<buffer.numberOfChannels;channel++)peak=Math.max(peak,Math.abs(buffer.getChannelData(channel)[frame]||0));
    peaks.push(peak);
  }
  const max=Math.max(.001,...peaks);
  return peaks.map(peak=>Math.max(.04,peak/max));
};
const createAudioNodeFromBlob=async(projectId:string,source:CanvasNode,blob:Blob,name:string,duration:number)=>{
  const uploaded=await uploadAssetBlob(projectId,blob,`${name}.wav`,"audio");
  const s=useCanvas.getState();
  const size={width:420,height:140};
  const pos=nearbyFreePosition(s.nodes,{x:source.x,y:source.y},size);
  const id=s.addNode("audio",pos.x,pos.y);
  useCanvas.getState().updateNode(id,{name,src:uploaded.src,srcPath:uploaded.srcPath,assetId:uploaded.assetId,seconds:duration,...size},false);
  return id;
};
const extractAudioTrackNode=async(projectId:string,node:CanvasNode,onError:(message:string)=>void)=>{
  if(!node.src)return;
  onError("");
  try{
    const buffer=await decodeMediaAudio(node.src);
    await createAudioNodeFromBlob(projectId,node,encodeWav(buffer),`${node.name||"视频"}·音轨`,buffer.duration);
  }catch(error){onError(error instanceof Error?error.message:"提取音轨失败");}
};
const clipAudioNode=async(projectId:string,node:CanvasNode,start:number,end:number,onError:(message:string)=>void)=>{
  if(!node.src)return;
  onError("");
  try{
    const buffer=await decodeMediaAudio(node.src);
    const safeStart=Math.max(0,start);
    const safeEnd=Math.min(buffer.duration,end);
    if(!Number.isFinite(safeStart)||!Number.isFinite(safeEnd)||safeEnd-safeStart<0.05)throw new Error("结束时间必须比开始时间至少晚 0.05 秒");
    await createAudioNodeFromBlob(projectId,node,encodeWav(buffer,safeStart,safeEnd),`${node.name||"音频"}·${safeStart.toFixed(2)}-${safeEnd.toFixed(2)}秒`,safeEnd-safeStart);
  }catch(error){onError(error instanceof Error?error.message:"截取音频失败");}
};
const extractVideoFrameNode=async(projectId:string,node:CanvasNode,at:FrameAt,onError:(message:string)=>void)=>{
  if(!node.src)return;
  onError("");
  try{
    const videoEl=at==="current"?document.querySelector<HTMLVideoElement>(`[data-node-id="${node.id}"] video`):null;
    const blob=await captureVideoFrame(node.src,at,videoEl?.currentTime??0);
    const uploaded=await uploadImageBlob(projectId,blob,`${node.name||"video"}-${FRAME_LABEL[at]}.png`);
    const size=(await probeMediaSize("image",uploaded.src))||fitMediaSize(16,9);
    const s=useCanvas.getState();
    const pos=nearbyFreePosition(s.nodes,{x:node.x,y:node.y},size);
    const id=s.addNode("image",pos.x,pos.y);
    useCanvas.getState().updateNode(id,{name:`${node.name||"视频"}·${FRAME_LABEL[at]}`,src:uploaded.src,srcPath:uploaded.srcPath,assetId:uploaded.assetId,...size},false);
  }catch(error){onError(error instanceof Error?error.message:"提取帧失败");}
};
const breakdownStoryboardNode=(_s:ReturnType<typeof useCanvas.getState>,node:CanvasNode,_projectId:string,onError:(message:string)=>void)=>{
  if(!node.content?.trim()){onError("请先在文本节点中写好分镜脚本");return;}
  onError("");
  useAssistantUI.getState().startStoryboard({
    nodeId:node.id,
    script:node.content,
    origin:{x:node.x,y:node.y,width:node.width,height:node.height},
  });
};
function NodeView({
  node,
  projectId,
  modelCatalog,
  voiceProfiles,
  onVoiceSaved,
  onVoiceUsed,
  onDoodle,
  connecting,
  startConnection,
  finishConnection,
  openContext,
  dropTarget,
  setDropTarget,
  peerLock,
}: {
  node: CanvasNode;
  projectId: string;
  modelCatalog: CatalogModel[];
  voiceProfiles: VoiceProfile[];
  onVoiceSaved: (voice:VoiceProfile)=>void;
  onVoiceUsed: (voiceId:string)=>void;
  onDoodle: (node:CanvasNode)=>void;
  connecting: string | null;
  startConnection: (id: string, e: React.PointerEvent, dir?: "out" | "in") => void;
  finishConnection: (id: string) => void;
  openContext: (id: string, x: number, y: number) => void;
  dropTarget: string | null;
  setDropTarget: (id: string | null) => void;
  peerLock?: { by: string; color: string } | null;
}) {
  const s = useCanvas(),
    selected = s.selected.includes(node.id),
    [generationError,setGenerationError]=useState(""),
    [mjBusy,setMjBusy]=useState(""),
    [inlinePrompt,setInlinePrompt]=useState(""),[inlineBusy,setInlineBusy]=useState(false),
    drag = useRef<{ x: number; y: number; ox: number; oy: number; nx?:number; ny?:number; kids?: {id:string;x:number;y:number}[] } | null>(
      null,
    ),
    resize = useRef<{ clientX:number;clientY:number;x:number;y:number;width:number;height:number;handle:ResizeHandle } | null>(null);
  const [livePosition,setLivePosition]=useState<{x:number;y:number}|null>(null);
  const dispX=livePosition?.x??node.x,dispY=livePosition?.y??node.y,dispW=node.width,dispH=node.height;
  const pathDrag=useRef<{index:number;x:number;y:number;px:number;py:number}|null>(null);
  const penHandleDrag=useRef<{index:number;part:"anchor"|"in"|"out";x:number;y:number;points:PenPoint[]}|null>(null);
  const press=useRef<{x:number;y:number;moved:boolean}|null>(null);
  const [previewOpen,setPreviewOpen]=useState(false);
  const [sceneOpen,setSceneOpen]=useState(false);
  const [promptExpanded,setPromptExpanded]=useState(false);
  const [downloading,setDownloading]=useState(false);
  const [frameMenuOpen,setFrameMenuOpen]=useState(false);
  const [frameBusy,setFrameBusy]=useState(false);
  const [audioBusy,setAudioBusy]=useState(false);
  const [clipStart,setClipStart]=useState(0);
  const [clipEnd,setClipEnd]=useState(node.seconds||0);
  const [waveformData,setWaveformData]=useState<{src:string;peaks:number[]}|null>(null);
  const waveform=waveformData&&waveformData.src===node.src?waveformData.peaks:[];
  const waveformLoading=node.kind.includes("audio")&&!!node.src&&selected&&waveform.length===0;
  const [inputPreview,setInputPreview]=useState<{src:string;isVideo:boolean;name:string}|null>(null);
  const [voiceSearch,setVoiceSearch]=useState("");
  const [promptFontSize,setPromptFontSize]=usePersistentValue<number>(PROMPT_FONT_KEY,12,raw=>{const v=Number(raw);return Number.isFinite(v)&&v>=10&&v<=24?v:12;});
  const [toolbarSize,setToolbarSize]=usePersistentValue<{width:number|null;height:number|null}>(TOOLBAR_SIZE_KEY,{width:null,height:null},raw=>{try{const v=JSON.parse(raw||"null") as {width?:unknown;height?:unknown}|null;return{width:typeof v?.width==="number"?v.width:null,height:typeof v?.height==="number"?v.height:null};}catch{return{width:null,height:null}}});
  const panelResize=useRef<{clientX:number;clientY:number;width:number;height:number;k:number}|null>(null);
  const [videoPlaying,setVideoPlaying]=useState(false);
  const [videoTime,setVideoTime]=useState(0);
  const [videoDuration,setVideoDuration]=useState(0);
  const videoProgress=Number.isFinite(videoDuration)&&videoDuration>0?Math.min(100,(videoTime/videoDuration)*100):0;
  const videoRef=useRef<HTMLVideoElement|null>(null);
  const seekBarRef=useRef<HTMLDivElement|null>(null);
  const waveformRef=useRef<HTMLDivElement|null>(null);
  const waveformDrag=useRef<"start"|"end"|null>(null);
  const seekingRef=useRef(false);
  const textMeasure=useRef<HTMLDivElement|null>(null);
  const seekVideo=(e:React.PointerEvent)=>{
    const bar=seekBarRef.current,v=videoRef.current;
    if(!bar||!v||!v.duration)return;
    const rect=bar.getBoundingClientRect();
    const ratio=Math.min(1,Math.max(0,(e.clientX-rect.left)/rect.width));
    v.currentTime=ratio*v.duration;
    setVideoTime(ratio*v.duration);
  };
  useEffect(()=>{
    if(!node.kind.includes("audio")||!node.src||!selected)return;
    let active=true;
    void decodeMediaAudio(node.src).then(buffer=>{
      if(!active)return;
      setWaveformData({src:node.src!,peaks:waveformPeaks(buffer)});
      setClipStart(0);
      setClipEnd(buffer.duration);
      if(Math.abs((node.seconds||0)-buffer.duration)>.05)useCanvas.getState().updateNode(node.id,{seconds:buffer.duration},false);
    }).catch(error=>{if(active)setGenerationError(error instanceof Error?error.message:"无法读取音频波形");});
    return()=>{active=false;};
  },[node.id,node.kind,node.src,node.seconds,selected]);
  const updateClipFromPointer=(e:React.PointerEvent,handle:"start"|"end")=>{
    const el=waveformRef.current,duration=node.seconds||clipEnd;
    if(!el||duration<=0)return;
    const rect=el.getBoundingClientRect();
    const value=Math.max(0,Math.min(duration,((e.clientX-rect.left)/rect.width)*duration));
    if(handle==="start")setClipStart(Math.min(value,clipEnd-.05));
    else setClipEnd(Math.max(value,clipStart+.05));
  };
  useEffect(()=>{
    if(!node.taskId||!["queued","running"].includes(node.status||""))return;
    let active=true;
    let checking=false;
    const check=async()=>{
      if(checking)return;
      checking=true;
      try{
        const kind=node.kind==="image-gen"?"image":node.kind==="audio-gen"?"audio":"video";
        const modelParam=node.model?`&model=${encodeURIComponent(node.model)}`:"";
        const response=await authFetch(`/api/generations?kind=${kind}&id=${encodeURIComponent(node.taskId!)}&projectId=${encodeURIComponent(projectId)}${modelParam}`);
        const result=await response.json();
        if(!active)return;
        if(!response.ok)throw new Error(result.error||"查询失败");
        const task=Array.isArray(result.data)?result.data[0]:(result.data||result);
        const status=String(task?.status||"").toUpperCase();
        if(status==="SUCCESS"||status==="COMPLETED"){
          if(node.kind==="audio-gen"&&node.model?.includes("voice-clone")){
            if(!node.voiceName?.trim()||!node.voice?.trim())throw new Error("请填写音色名称后重新保存");
            const voiceResponse=await authFetch("/api/voices",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({projectId,name:node.voiceName,voiceId:node.voice,sourceModel:node.model})});
            const voiceResult=await voiceResponse.json();
            if(!voiceResponse.ok)throw new Error(voiceResult.error||"保存克隆音色失败");
            if(active){onVoiceSaved(voiceResult.voice);s.updateNode(node.id,{status:"done",errorMessage:undefined});setGenerationError(`音色“${node.voiceName}”已保存到个人音色库`);}
          }else{
            const savedResponse=await authFetch("/api/generations/result",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({projectId,kind,taskId:node.taskId,model:node.model})});
            const saved=await savedResponse.json();
            if(!savedResponse.ok)throw new Error(saved.error||"保存生成结果失败");
            if(active){const size=kind==="audio"?null:await probeMediaSize(kind,saved.url);s.updateNode(node.id,{status:"done",src:saved.url,srcPath:saved.path,assetId:saved.assetId,errorMessage:undefined,...(size||{})});setGenerationError("");}
          }
        }else if(status==="FAILURE"||status==="FAILED"){
          const message=task?.fail_reason||result.error?.message||"生成失败";
          s.updateNode(node.id,{status:"failed",errorMessage:message});setGenerationError(message);
        }
      }catch(error){if(active)setGenerationError(error instanceof Error?error.message:"查询失败");}
      finally{checking=false;}
    };
    const timer=setInterval(check,4000);void check();return()=>{active=false;clearInterval(timer)};
  },[node.taskId,node.status,node.kind,node.model,node.voice,node.voiceName,node.id,projectId,s,onVoiceSaved]);
  useEffect(()=>{
    if(!frameMenuOpen)return;
    const close=()=>setFrameMenuOpen(false);
    const timer=window.setTimeout(()=>addEventListener("pointerdown",close),0);
    return()=>{clearTimeout(timer);removeEventListener("pointerdown",close);};
  },[frameMenuOpen]);
  const genInputs=node.kind.includes("gen")?s.edges.filter(e=>e.to===node.id).map(e=>s.nodes.find(n=>n.id===e.from)).filter((n):n is CanvasNode=>!!n&&MEDIA_KINDS.includes(n.kind)):[];
  const genInputItems=useMemo(()=>{
    if(!node.kind.includes("gen"))return[];
    const items:{key:string;src?:string;name:string;kind:"image"|"video"|"audio";edgeId?:string;pending:boolean}[]=[];
    if(node.reference)items.push({key:"reference",src:node.reference,name:"参考图",kind:"image",pending:false});
    for(const edge of s.edges){
      if(edge.to!==node.id)continue;
      const from=s.nodes.find(n=>n.id===edge.from);
      if(!from||!MEDIA_KINDS.includes(from.kind))continue;
      items.push({key:from.id,src:from.src,name:from.name||"输入素材",kind:from.kind.includes("video")?"video":from.kind.includes("audio")?"audio":"image",edgeId:edge.id,pending:!from.src});
    }
    return items;
  },[s.edges,s.nodes,node.id,node.kind,node.reference]);
  const imageInputCount=genInputs.filter(n=>n.kind.includes("image")).length+(node.reference?1:0)+(node.kind!=="audio-gen"?node.promptRefs?.length||0:0);
  const videoInputCount=genInputs.filter(n=>n.kind.includes("video")).length;
  const audioInputCount=genInputs.filter(n=>n.kind.includes("audio")).length;
  const pendingInputCount=genInputs.filter(n=>!n.src).length;
  const inputCounts=useMemo(()=>({image:imageInputCount,video:videoInputCount,audio:audioInputCount}),[imageInputCount,videoInputCount,audioInputCount]);
  const promptRefCandidates=useMemo<PromptRef[]>(()=>genInputItems.filter(item=>item.src&&item.kind==="image").map(item=>({id:item.key,src:item.src!,path:item.key==="reference"?node.referencePath:s.nodes.find(n=>n.id===item.key)?.srcPath,name:item.name})),[genInputItems,node.referencePath,s.nodes]);
  const generationKind=node.kind==="image-gen"?"image":node.kind==="video-gen"?"video":node.kind==="audio-gen"?"audio":null;
  const compatibleModels=useMemo(()=>generationKind?compatibleCatalog(modelCatalog,generationKind,inputCounts):[],[generationKind,modelCatalog,inputCounts]);
  useEffect(()=>{
    if(!generationKind||!modelCatalog.length||!compatibleModels.length)return;
    if(!compatibleModels.some(model=>model.model_id===node.model))s.updateNode(node.id,{model:compatibleModels[0].model_id});
  },[generationKind,modelCatalog.length,compatibleModels,node.id,node.model,s]);
  const selectedCatalogModel=modelCatalog.find(model=>model.model_id===node.model);
  const selectedParameters=selectedCatalogModel?.capabilities?.parameters;
  const resolutionOptions=selectedParameters?.resolutions||(node.kind==="image-gen"?DEFAULT_IMAGE_RESOLUTIONS:DEFAULT_VIDEO_RESOLUTIONS);
  const ratioOptions=selectedParameters?.ratios||(node.kind==="image-gen"?DEFAULT_IMAGE_RATIOS:DEFAULT_VIDEO_RATIOS);
  const durationRule=selectedParameters?.duration||{min:4,max:30,default:5};
  const requiresVoice=Boolean(node.kind==="audio-gen"&&selectedParameters?.voice_required);
  const supportsVoice=Boolean(node.kind==="audio-gen"&&(selectedParameters?.voice_supported||requiresVoice||node.model==="doubao-seed-audio-1.0"));
  const isVoiceClone=node.kind==="audio-gen"&&node.model?.includes("voice-clone");
  const presetVoices=node.model?.includes("speech-2.8")?MINIMAX_VOICES:node.model?.includes("qwen3-tts")?QWEN_VOICES:node.model==="doubao-seed-audio-1.0"?DOUBAO_VOICES:[];
  const voiceNeedle=voiceSearch.trim().toLocaleLowerCase("zh-CN");
  const matchingVoiceProfiles=voiceProfiles.filter(item=>!voiceNeedle||`${item.projectName} ${item.name} ${item.voiceId}`.toLocaleLowerCase("zh-CN").includes(voiceNeedle));
  const voiceGroups=Object.entries(matchingVoiceProfiles.reduce<Record<string,VoiceProfile[]>>((groups,item)=>{(groups[item.projectName]||=[]).push(item);return groups;},{}));
  const currentCompatibility=selectedCatalogModel?modelCompatibility(selectedCatalogModel,inputCounts):{compatible:true,reason:""};
  useEffect(()=>{
    if(node.kind==="audio-gen")return;
    const patch:Partial<CanvasNode>={};
    if(resolutionOptions.length&&!resolutionOptions.includes(node.resolution||""))patch.resolution=resolutionOptions[0];
    if(node.ratio&&!ratioOptions.includes(node.ratio))patch.ratio=undefined;
    if(node.kind==="video-gen"&&node.seconds&&(node.seconds<durationRule.min||node.seconds>durationRule.max))patch.seconds=durationRule.default;
    if(Object.keys(patch).length)s.updateNode(node.id,patch,false);
  },[node.kind,node.id,node.resolution,node.ratio,node.seconds,resolutionOptions,ratioOptions,durationRule.min,durationRule.max,durationRule.default,s]);
  useEffect(()=>{
    if(node.kind!=="text")return;
    const el=textMeasure.current;
    if(!el)return;
    const height=Math.max(32,Math.ceil(el.offsetHeight));
    if(node.manualWidth){
      if(!node.manualHeight&&Math.abs(height-node.height)>1)s.updateNode(node.id,{height},false);
      return;
    }
    const width=Math.max(48,Math.ceil(el.offsetWidth));
    const patch:Partial<CanvasNode>={};
    if(Math.abs(width-node.width)>1)patch.width=width;
    if(!node.manualHeight&&Math.abs(height-node.height)>1)patch.height=height;
    if(Object.keys(patch).length)s.updateNode(node.id,patch,false);
  });
  if (!node.visible) return null;
  const down = (e: React.PointerEvent) => {
    if (node.locked || peerLock) return;
    e.stopPropagation();
    if (e.shiftKey) s.setSelected([...new Set([...s.selected, node.id])]);
    else if (!(s.selected.length > 1 && s.selected.includes(node.id))) s.setSelected([node.id]);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    press.current={x:e.clientX,y:e.clientY,moved:false};
    drag.current=null;
  };
  const move = (e: React.PointerEvent) => {
    if(!press.current)return;
    if(!press.current.moved){
      if(Math.hypot(e.clientX-press.current.x,e.clientY-press.current.y)>6){
        press.current.moved=true;
        drag.current={x:press.current.x,y:press.current.y,ox:node.x,oy:node.y};
        const kids:{id:string;x:number;y:number}[]=[];
        const seen=new Set<string>([node.id]);
        const collect=(pid:string)=>{for(const n of s.nodes.filter(x=>x.parentId===pid)){if(!seen.has(n.id)){seen.add(n.id);kids.push({id:n.id,x:n.x,y:n.y});}collect(n.id);}};
        if(s.selected.length>1&&s.selected.includes(node.id)){
          for(const n of s.nodes)if(s.selected.includes(n.id)&&!seen.has(n.id)){seen.add(n.id);kids.push({id:n.id,x:n.x,y:n.y});}
          for(const n of s.nodes)if(s.selected.includes(n.id)&&n.kind==="frame")collect(n.id);
        } else if(node.kind==="frame")collect(node.id);
        if(kids.length)drag.current.kids=kids;
      }
      else return;
    }
    if (!drag.current) return;
    const dx = (e.clientX - drag.current.x) / s.zoom,
      dy = (e.clientY - drag.current.y) / s.zoom;
    const nx=drag.current.ox+dx,ny=drag.current.oy+dy;
    drag.current.nx=nx;drag.current.ny=ny;
    setLivePosition({x:nx,y:ny});
    if(drag.current.kids)for(const k of drag.current.kids){const element=document.querySelector<HTMLElement>(`[data-node-id="${k.id}"]`);if(element){element.style.left=`${k.x+dx}px`;element.style.top=`${k.y+dy}px`;}}
    const cx=nx+node.width/2,cy=ny+node.height/2;
    const own=new Set((drag.current.kids||[]).map(k=>k.id));
    const host=s.nodes.find(n=>n.kind==="frame"&&n.visible&&n.id!==node.id&&!own.has(n.id)&&cx>=n.x&&cx<=n.x+n.width&&cy>=n.y&&cy<=n.y+n.height);
    setDropTarget(host?host.id:null);
  };
  const up = () => {
    setDropTarget(null);
    if(press.current){
      press.current=null;
      if(drag.current){
        const finalX=drag.current.nx??node.x,finalY=drag.current.ny??node.y;
        const dx=finalX-drag.current.ox,dy=finalY-drag.current.oy;
        const ownKids=new Set((drag.current.kids||[]).map(k=>k.id));
        const cx=finalX+node.width/2,cy=finalY+node.height/2;
        const host=useCanvas.getState().nodes.find(n=>n.kind==="frame"&&n.visible&&n.id!==node.id&&!ownKids.has(n.id)&&cx>=n.x&&cx<=n.x+n.width&&cy>=n.y&&cy<=n.y+n.height);
        const newParent=host?host.id:undefined;
        s.updateNode(node.id,{x:finalX,y:finalY,...(newParent!==node.parentId?{parentId:newParent}:{})},true);
        if(drag.current.kids)for(const k of drag.current.kids)s.updateNode(k.id,{x:k.x+dx,y:k.y+dy},false);
        setLivePosition(null);
      }
      drag.current=null;
      return;
    }
    if (drag.current) {
      s.updateNode(node.id,{x:drag.current.nx??node.x,y:drag.current.ny??node.y},true);
      setLivePosition(null);
      drag.current = null;
    }
  };
  const resizeMove = (e: React.PointerEvent) => {
    const current=resize.current;
    if(!current)return;
    e.stopPropagation();
    const dx=(e.clientX-current.clientX)/s.zoom,dy=(e.clientY-current.clientY)/s.zoom;
    const changesWidth=current.handle.includes("e")||current.handle.includes("w");
    const changesHeight=current.handle.includes("n")||current.handle.includes("s");
    const minWidth=node.kind==="text"?48:40,minHeight=30;
    const nextWidth=changesWidth?Math.max(minWidth,current.width+(current.handle.includes("w")?-dx:dx)):current.width;
    const nextHeight=changesHeight?Math.max(minHeight,current.height+(current.handle.includes("n")?-dy:dy)):current.height;
    const patch:Partial<CanvasNode>={width:nextWidth,height:nextHeight};
    if(current.handle.includes("w"))patch.x=current.x+(current.width-nextWidth);
    if(current.handle.includes("n"))patch.y=current.y+(current.height-nextHeight);
    if(node.kind==="text"){
      if(changesWidth)patch.manualWidth=true;
      if(changesHeight)patch.manualHeight=true;
    }
    if(node.kind==="path"){
      patch.pathViewWidth=node.pathViewWidth||current.width;
      patch.pathViewHeight=node.pathViewHeight||current.height;
    }
    s.updateNode(node.id,patch,false);
  };
  const resizeUp = () => {
    if (!resize.current) return;
    resize.current = null;
    s.updateNode(node.id, {}, true);
  };
  const startResize=(e:React.PointerEvent,handle:ResizeHandle)=>{
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resize.current={clientX:e.clientX,clientY:e.clientY,x:node.x,y:node.y,width:node.width,height:node.height,handle};
  };
  const media =
    node.kind === "image" || node.kind === "video" || node.kind === "audio" || node.kind.includes("gen");
  const shape=["rect","ellipse","polygon"].includes(node.kind);
  const pathEdit=node.kind==="path"&&selected&&!node.pathPoints?editablePath(node.pathData||""):null;
  const startPenHandle=(e:React.PointerEvent,index:number,part:"anchor"|"in"|"out")=>{e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);penHandleDrag.current={index,part,x:e.clientX,y:e.clientY,points:node.pathPoints!.map(p=>({...p}))}};
  const movePenHandle=(e:React.PointerEvent)=>{
    const drag=penHandleDrag.current;if(!drag||!node.pathPoints)return;
    e.stopPropagation();
    const dx=(e.clientX-drag.x)/s.zoom*(node.pathViewWidth||node.width)/node.width,dy=(e.clientY-drag.y)/s.zoom*(node.pathViewHeight||node.height)/node.height;
    const points=drag.points.map((point,i)=>{
      if(i!==drag.index)return point;
      if(drag.part==="anchor")return {...point,x:point.x+dx,y:point.y+dy,inX:point.inX+dx,inY:point.inY+dy,outX:point.outX+dx,outY:point.outY+dy};
      if(drag.part==="out")return {...point,outX:point.outX+dx,outY:point.outY+dy,...(!e.altKey?{inX:2*point.x-point.outX-dx,inY:2*point.y-point.outY-dy}:{})};
      return {...point,inX:point.inX+dx,inY:point.inY+dy,...(!e.altKey?{outX:2*point.x-point.inX-dx,outY:2*point.y-point.inY-dy}:{})};
    });
    s.updateNode(node.id,{pathPoints:points,pathData:penPath(points,node.pathClosed)},false);
  };
  const canvasRect=selected&&typeof document!=="undefined"?document.querySelector<HTMLElement>(".canvas-grid")?.getBoundingClientRect():null;
  const desiredToolbarWidth=node.kind.includes("gen")?460:node.kind==="audio"?420:node.kind==="text"?420:shape?360:300;
  const toolbarWidth=canvasRect?Math.min(desiredToolbarWidth,Math.max(240,canvasRect.width-24)):desiredToolbarWidth;
  const panelWidth=toolbarSize.width?Math.min(Math.max(300,toolbarSize.width),Math.max(300,(canvasRect?.width||1200)-24)):toolbarWidth;
  const startPanelResize=(e:React.PointerEvent)=>{
    e.stopPropagation();
    const rect=(e.currentTarget as HTMLElement).parentElement?.getBoundingClientRect();
    if(!rect)return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panelResize.current={clientX:e.clientX,clientY:e.clientY,width:rect.width,height:rect.height,k:rect.width/panelWidth};
  };
  const panelResizeMove=(e:React.PointerEvent)=>{
    const current=panelResize.current;
    if(!current)return;
    e.stopPropagation();
    const width=Math.round(Math.min(Math.max(300,(canvasRect?.width||1200)-24),Math.max(300,(current.width+e.clientX-current.clientX)/current.k)));
    const height=Math.round(Math.min(Math.max(200,(canvasRect?.height||900)-40),Math.max(200,(current.height+e.clientY-current.clientY)/current.k)));
    setToolbarSize({width,height});
  };
  const panelResizeUp=(e:React.PointerEvent)=>{if(panelResize.current){e.stopPropagation();panelResize.current=null;}};
  const uploadPromptRef=async(file:File):Promise<PromptRef|null>=>{
    setGenerationError("");
    try{
      const uploaded=await uploadImageBlob(projectId,file,file.name);
      return{id:crypto.randomUUID(),src:uploaded.src,path:uploaded.srcPath,name:file.name.replace(/\.[^.]+$/,"")||"参考图"};
    }catch(error){setGenerationError(error instanceof Error?error.message:"上传失败");return null;}
  };
  const nodeScreenX=canvasRect?canvasRect.left+s.pan.x+dispX*s.zoom:0;
  const centeredToolbarLeft=nodeScreenX+(dispW*s.zoom-panelWidth)/2;
  const toolbarLeft=canvasRect?Math.max(canvasRect.left+12,Math.min(centeredToolbarLeft,canvasRect.right-panelWidth-12)):0;
  const toolbarOffset=canvasRect?(toolbarLeft-nodeScreenX)/s.zoom:0;
  const toolbarHeight=node.kind.includes("gen")?400:node.kind==="audio"?440:node.kind==="text"?240:shape?190:170;
  const nodeScreenTop=canvasRect?canvasRect.top+s.pan.y+dispY*s.zoom:0;
  const below=canvasRect?canvasRect.bottom-(nodeScreenTop+dispH*s.zoom):Infinity;
  const above=canvasRect?nodeScreenTop-canvasRect.top:0;
  const toolbarAbove=below<toolbarHeight+18&&above>below;
  const loadFile = async (file: File, field: "src" | "reference") => {
    setGenerationError("");
    const client=createSupabaseClient();
    if(!client){setGenerationError("请先配置 Supabase 存储");return;}
    const {data:{session},error:sessionError}=await client.auth.getSession();
    const user=session?.user;
    if(sessionError||!user){requireLogin();return;}
    const assetKind:UploadAssetKind=field==="src"&&node.kind==="audio"?"audio":file.type.startsWith("audio/")?"audio":file.type.startsWith("video/")?"video":"image";
    const mimeType=file.type||(assetKind==="audio"?"audio/mpeg":assetKind==="video"?"video/mp4":"image/png");
    const path=`${projectId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
    const {error}=await client.storage.from("project-assets").upload(path,file,{contentType:mimeType});
    if(error){setGenerationError(error.message);return;}
    const {data:asset,error:assetError}=await client.from("assets").insert({project_id:projectId,owner_id:user.id,kind:assetKind,storage_path:path,mime_type:mimeType,byte_size:file.size,source:"upload"}).select("id").single();
    if(assetError||!asset){await client.storage.from("project-assets").remove([path]);setGenerationError(assetError?.message||"保存素材记录失败");return;}
    const signed=await client.storage.from("project-assets").createSignedUrl(path,7*86400);
    if(signed.error||!signed.data?.signedUrl){setGenerationError(signed.error?.message||"获取素材地址失败");return;}
    const size=field==="src"&&assetKind!=="audio"?await probeMediaSize(assetKind,signed.data.signedUrl):null;
    s.updateNode(node.id,{...(size||{}),[field]:signed.data.signedUrl,[field==="src"?"srcPath":"referencePath"]:path,[field==="src"?"assetId":"referenceAssetId"]:asset.id,...(field==="reference"&&node.kind==="video-gen"&&node.model?.endsWith("-t2v")?{model:node.model.replace(/-t2v$/,"-i2v")}:{})});
  };
  const generate = async () => {
    if(!node.content?.trim()){setGenerationError("请先输入提示词");return;}
    if(node.kind==="audio-gen"&&node.model?.includes("voice-clone")&&!node.voiceName?.trim()){setGenerationError("请先给克隆音色填写名称");return;}
    if(node.kind==="audio-gen"&&node.model?.includes("voice-clone")&&!node.voice?.trim()){setGenerationError("音色 ID 尚未生成");return;}
    if(!(await ensureLogin(()=>void generate())))return;
    setGenerationError("");s.updateNode(node.id,{status:"running",taskId:undefined});
    try{
      let reference=node.reference;
      if(node.referencePath){const client=createSupabaseClient();const signed=await client?.storage.from("project-assets").createSignedUrl(node.referencePath,3600);if(signed?.error)throw signed.error;reference=signed?.data.signedUrl;}
      const references:{url:string;kind:"image"|"video"|"audio"}[]=[];
      if(reference)references.push({url:reference,kind:"image"});
      for(const edge of s.edges){if(edge.to!==node.id)continue;const from=s.nodes.find(n=>n.id===edge.from);if(from?.src)references.push({url:from.src,kind:from.kind.includes("video")?"video":from.kind.includes("audio")?"audio":"image"});}
      if(node.kind!=="audio-gen")for(const item of node.promptRefs||[]){
        let url=item.src;
        if(item.path){const client=createSupabaseClient();const signed=await client?.storage.from("project-assets").createSignedUrl(item.path,3600);if(signed?.data?.signedUrl)url=signed.data.signedUrl;}
        if(url)references.push({url,kind:"image"});
      }
      const model=node.model||(node.kind==="image-gen"?"zhenzhen-image-g-v2.5-lowprice":node.kind==="video-gen"?"seedance-2.5-standard-t2v":"doubao-seed-audio-1.0");
      const response=await authFetch("/api/generations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({projectId,provider:"seedance-nz",kind:node.kind==="image-gen"?"image":node.kind==="audio-gen"?"audio":"video",model,prompt:node.content,references,resolution:node.resolution||(node.kind==="image-gen"?"1k":"720p"),ratio:node.ratio,seconds:node.seconds,voice:node.voice,idempotencyKey:crypto.randomUUID()})},()=>void generate());
      const result=await response.json();
      if(!response.ok||result.error)throw new Error(result.error||"提交失败");
      if(result.demo)throw new Error("生成服务尚未配置密钥，未提交真实任务");
      const taskId=result.task_id||result.id||result.data?.task_id||(Array.isArray(result.data)?result.data[0]?.task_id:undefined);
      if(!taskId)throw new Error("服务商没有返回任务 ID");
      if(node.kind==="audio-gen"&&node.voice?.trim())onVoiceUsed(node.voice.trim());
      s.updateNode(node.id,{status:"queued",taskId});
      setGenerationError(`任务已提交，正在查询生成结果…${pendingInputCount?`（${pendingInputCount} 个连接的输入素材尚未生成，本次未使用）`:""}`);
    }catch(error){s.updateNode(node.id,{status:"failed"});setGenerationError(error instanceof Error?error.message:"生成失败");}
  };
  const runMidjourneyAction=async(action:NonNullable<CanvasNode["mjAction"]>,index?:number,zoomRatio?:number)=>{
    if(!node.taskId||mjBusy)return;
    if(!(await ensureLogin(()=>void runMidjourneyAction(action,index,zoomRatio))))return;
    setMjBusy(`${action}:${index||zoomRatio||""}`);setGenerationError("");
    const labels:Record<NonNullable<CanvasNode["mjAction"]>,string>={upscale:"放大",variation:"变体",reroll:"重新生成","high-variation":"强变体","low-variation":"弱变体",zoom:"扩图"};
    const position=nearbyFreePosition(s.nodes.map(item=>({x:item.x,y:item.y,width:item.width,height:item.height})),{x:node.x+node.width+64,y:node.y},{width:node.width,height:node.height},36);
    const id=s.addNode("image-gen",position.x,position.y);
    s.updateNode(id,{name:`MJ ${labels[action]}${index?` ${index}`:""}`,model:"midjourney-imagine",content:node.content,status:"running",taskId:undefined,mjAction:action,mjParentTaskId:node.taskId,resolution:node.resolution,ratio:node.ratio,width:node.width,height:node.height,errorMessage:undefined},false);
    s.addEdge(node.id,id);
    try{
      const response=await authFetch("/api/generations/midjourney-action",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({projectId,taskId:node.taskId,action,index,zoomRatio})},()=>void runMidjourneyAction(action,index,zoomRatio));
      const result=await response.json();
      if(!response.ok||result.error)throw new Error(typeof result.error==="string"?result.error:result.error?.message||"Midjourney 操作失败");
      const taskId=result.task_id||result.id||result.data?.task_id||(Array.isArray(result.data)?result.data[0]?.task_id:undefined);
      if(!taskId)throw new Error("服务商没有返回任务 ID");
      s.updateNode(id,{taskId,status:"queued",errorMessage:undefined},false);
      setGenerationError(`已提交${labels[action]}任务`);
    }catch(error){const message=error instanceof Error?error.message:"Midjourney 操作失败";s.updateNode(id,{status:"failed",errorMessage:message},false);setGenerationError(message);}
    finally{setMjBusy("");}
  };
  const generateText = async () => {
    if(!node.content?.trim()){setGenerationError("请先输入文字内容作为提示词");return;}
    if(node.status==="running")return;
    if(!(await ensureLogin(()=>void generateText())))return;
    setGenerationError("");
    s.updateNode(node.id,{status:"running"});
    try{
      const response=await authFetch("/api/text-generation",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({projectId,prompt:node.content})},()=>void generateText());
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"生成失败");
      s.updateNode(node.id,{content:result.text,status:"done"});
    }catch(error){s.updateNode(node.id,{status:"failed"});setGenerationError(error instanceof Error?error.message:"生成失败");}
  };
  const breakdownStoryboard=()=>void breakdownStoryboardNode(s,node,projectId,setGenerationError);
  const editWithAssistant=async()=>{
    if(!inlinePrompt.trim()||inlineBusy)return;
    if(!(await ensureLogin(()=>void editWithAssistant())))return;
    setInlineBusy(true);setGenerationError("");
    try{const response=await authFetch("/api/agent",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({projectId,prompt:inlinePrompt,selected:[node]})},()=>void editWithAssistant());const data=await response.json();if(!response.ok)throw new Error(data.error||"修改失败");for(const command of data.commands||[]){if(command.type==="update")s.updateNode(node.id,command.patch);if(command.type==="create")s.addNode(command.kind,command.x,command.y);if(command.type==="connect")s.addEdge(command.from,command.to)}setInlinePrompt("");setGenerationError(data.message||"已修改")}catch(error){setGenerationError(error instanceof Error?error.message:"修改失败")}finally{setInlineBusy(false)}
  };
  const downloadAsset=async()=>{
    if(!node.src||downloading)return;
    setDownloading(true);
    try{
      const response=await fetch(node.src);
      if(!response.ok)throw new Error("下载失败");
      const blob=await response.blob();
      const ext=(blob.type.split("/")[1]||"").replace("jpeg","jpg")||(node.kind.includes("video")?"mp4":"png");
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");
      link.href=url;
      link.download=`${node.name||"生成资源"}.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }catch{window.open(node.src,"_blank");}
    finally{setDownloading(false);}
  };
  const extractFrame=async(at:FrameAt)=>{
    if(!node.src||frameBusy)return;
    setFrameMenuOpen(false);setFrameBusy(true);
    await extractVideoFrameNode(projectId,node,at,setGenerationError);
    setFrameBusy(false);
  };
  const extractAudio=async()=>{
    if(!node.src||audioBusy)return;
    setAudioBusy(true);
    await extractAudioTrackNode(projectId,node,setGenerationError);
    setAudioBusy(false);
  };
  const createClip=async()=>{
    if(!node.src||audioBusy)return;
    setAudioBusy(true);
    await clipAudioNode(projectId,node,clipStart,clipEnd,setGenerationError);
    setAudioBusy(false);
  };
  const saveScene=(sceneData:ThreeSceneData,sceneThumbnail:string)=>{
    s.updateNode(node.id,{sceneData,sceneThumbnail});
    setSceneOpen(false);
  };
  const captureScene=async(sceneData:ThreeSceneData,blob:Blob)=>{
    const uploaded=await uploadImageBlob(projectId,blob,`${node.name||"场景"}-镜头.png`);
    const size=(await probeMediaSize("image",uploaded.src))||fitMediaSize(16,9);
    const current=useCanvas.getState();
    const pos=nearbyFreePosition(current.nodes,{x:node.x+node.width+48,y:node.y},size);
    const id=current.addNode("image",pos.x,pos.y);
    useCanvas.getState().updateNode(id,{name:`${node.name||"场景"}·镜头`,src:uploaded.src,srcPath:uploaded.srcPath,assetId:uploaded.assetId,...size},false);
    const bitmap=await createImageBitmap(blob);const thumb=document.createElement("canvas");thumb.width=420;thumb.height=280;thumb.getContext("2d")!.drawImage(bitmap,0,0,420,280);bitmap.close();const sceneThumbnail=thumb.toDataURL("image/jpeg",.72);
    s.updateNode(node.id,{sceneData,sceneThumbnail});
    setGenerationError("已从当前镜头创建图片节点");
  };
  const uploadSceneImage=async(file:File)=>{
    const uploaded=await uploadImageBlob(projectId,file,file.name);
    const bitmap=await createImageBitmap(file);
    const aspectRatio=Math.max(.1,Math.min(10,bitmap.width/Math.max(1,bitmap.height)));
    bitmap.close();
    return {...uploaded,aspectRatio};
  };
  const removeInput=(item:{edgeId?:string})=>{
    if(item.edgeId)s.removeEdge(item.edgeId);
    else s.updateNode(node.id,{reference:undefined,referencePath:undefined,referenceAssetId:undefined});
  };
  return (
    <div
      data-node-id={node.id}
      className={`node group ${shape||node.kind==="text"||node.kind==="path"?"node-vector":""} ${selected ? "selected" : ""}`}
      style={{
        left: dispX,
        top: dispY,
        width: dispW,
        height: dispH,
        transform: `rotate(${node.rotation}deg)${dropTarget===node.id?" scale(1.04)":""}`,
        transition: "transform .18s",
        background:shape||node.kind==="text"||node.kind==="path"?"transparent":node.fill,
        borderColor:shape||node.kind==="text"||node.kind==="path"?"transparent":node.stroke,
        outline:peerLock?`2px solid ${peerLock.color}`:undefined,
        outlineOffset:peerLock?2:undefined,
        cursor:peerLock?"not-allowed":undefined,
        zIndex: node.kind === "frame" ? 0 : selected ? 5 : 2,
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!s.selected.includes(node.id)) {
          s.setSelected([node.id]);
        }
        openContext(node.id, e.clientX, e.clientY);
      }}
    >
      {peerLock&&(
        <div className="absolute -top-6 right-0 z-40 flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white shadow" style={{background:peerLock.color}}>
          <Lock size={10}/> {peerLock.by}
        </div>
      )}
      {node.kind.includes("gen") && (
        <button
          aria-label="连接到此节点"
          className="port in"
          onPointerDown={(e) => startConnection(node.id, e, "in")}
          onPointerUp={(e) => { e.stopPropagation(); finishConnection(node.id); }}
          onClick={(e) => { e.stopPropagation(); finishConnection(node.id); }}
        />
      )}
      {node.kind === "frame" && (
        <div className="absolute -top-7 left-0 flex items-center gap-1 text-xs text-(--muted)">
          <Frame size={13} />
          {node.name}
        </div>
      )}
      {node.kind === "rect" && (
        <div
          className="h-full w-full"
          style={{ background: node.fill,borderRadius:node.cornerRadius||0,border:!isTransparentColor(node.stroke)?`2px solid ${node.stroke}`:"none" }}
        />
      )}
      {node.kind === "ellipse" && (
        <div
          className="h-full w-full rounded-full"
          style={{ background: node.fill,border:!isTransparentColor(node.stroke)?`2px solid ${node.stroke}`:"none" }}
        />
      )}
      {node.kind === "polygon" && (
        <svg className="h-full w-full" viewBox={`0 0 ${node.width} ${node.height}`} preserveAspectRatio="none"><polygon points={`${node.width/2},0 ${node.width},${node.height*.38} ${node.width*.82},${node.height} ${node.width*.18},${node.height} 0,${node.height*.38}`} fill={node.fill} stroke={node.stroke} strokeWidth="2"/></svg>
      )}
      {node.kind === "path" && (
        <svg
          className="h-full w-full overflow-visible"
          viewBox={`0 0 ${node.pathViewWidth||node.width} ${node.pathViewHeight||node.height}`}
        >
          <path
            d={node.pathData}
            fill={node.fill}
            stroke={node.stroke}
            strokeWidth="2"
          />
          {selected&&node.pathPoints?.map((point,index)=><g key={index}>
            {(point.inX!==point.x||point.inY!==point.y||point.outX!==point.x||point.outY!==point.y)&&<path d={`M ${point.inX} ${point.inY} L ${point.x} ${point.y} L ${point.outX} ${point.outY}`} fill="none" stroke="var(--accent)" strokeWidth="1"/>}
            {(["in","out"] as const).map(part=><circle key={part} cx={part==="in"?point.inX:point.outX} cy={part==="in"?point.inY:point.outY} r="4" fill="white" stroke="var(--accent)" strokeWidth="1.5" className="cursor-crosshair" onPointerDown={e=>startPenHandle(e,index,part)} onPointerMove={movePenHandle} onPointerUp={e=>{e.stopPropagation();if(penHandleDrag.current){penHandleDrag.current=null;s.updateNode(node.id,{},true)}}}/>)}
            <circle cx={point.x} cy={point.y} r="6" fill="var(--accent)" stroke="white" strokeWidth="2" className="cursor-move" onPointerDown={e=>startPenHandle(e,index,"anchor")} onPointerMove={movePenHandle} onPointerUp={e=>{e.stopPropagation();if(penHandleDrag.current){penHandleDrag.current=null;s.updateNode(node.id,{},true)}}}/>
          </g>)}
          {pathEdit?.points.map(point=><circle key={point.index} cx={point.x} cy={point.y} r="5" fill="var(--accent)" stroke="white" strokeWidth="2" style={{cursor:"move"}} onPointerDown={e=>{e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);pathDrag.current={index:point.index,x:e.clientX,y:e.clientY,px:point.x,py:point.y}}} onPointerMove={e=>{if(!pathDrag.current||pathDrag.current.index!==point.index)return;e.stopPropagation();const tokens=[...pathEdit.tokens];tokens[point.index]=String(Math.round(pathDrag.current.px+(e.clientX-pathDrag.current.x)/s.zoom));tokens[point.index+1]=String(Math.round(pathDrag.current.py+(e.clientY-pathDrag.current.y)/s.zoom));s.updateNode(node.id,{pathData:tokens.join(" ")},false)}} onPointerUp={e=>{e.stopPropagation();if(pathDrag.current){pathDrag.current=null;s.updateNode(node.id,{},true)}}}/>)}
        </svg>
      )}
      {node.kind === "text" && (
        <>
          <div className="whitespace-pre-wrap break-words p-2 leading-tight" style={{fontSize:node.fontSize || 24,fontWeight:node.fontWeight || 600,textAlign:node.textAlign || "left",color:!node.stroke||node.stroke==="transparent"||node.stroke==="#cfcfcb" ? "#181818" : node.stroke}}>
            {node.content}
          </div>
          <div ref={textMeasure} aria-hidden className="invisible absolute left-0 top-0 whitespace-pre-wrap break-words p-2 leading-tight" style={{fontSize:node.fontSize || 24,fontWeight:node.fontWeight || 600,width:node.manualWidth?node.width:"max-content",maxWidth:node.manualWidth?undefined:520}}>
            {node.content}
          </div>
        </>
      )}
      {node.kind === "text" && node.status === "running" && <div className="shimmer" />}
      {node.kind==="scene"&&<div className="relative h-full w-full overflow-hidden rounded-[12px] bg-gradient-to-br from-slate-700 via-slate-800 to-slate-950">
        {node.sceneThumbnail?<Image draggable={false} src={node.sceneThumbnail} alt={node.name} fill sizes="420px" unoptimized className="object-cover"/>:<div className="absolute inset-0"><div className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(135deg,transparent_49%,rgba(255,255,255,.08)_50%,transparent_51%)] bg-[length:28px_28px]"/><div className="absolute left-1/2 top-1/2 h-20 w-12 -translate-x-1/2 -translate-y-1/2 rounded-t-full bg-white/35 after:absolute after:-bottom-12 after:left-1/2 after:h-14 after:w-16 after:-translate-x-1/2 after:rounded-t-xl after:bg-white/30"/></div>}
        <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-lg bg-black/55 px-2 py-1 text-[10px] text-white backdrop-blur"><Waypoints size={12}/> {node.sceneData?.entities.length||1} 个对象</div>
        <button className="absolute inset-x-3 bottom-3 rounded-xl bg-black/65 px-3 py-2 text-xs font-medium text-white opacity-90 shadow backdrop-blur transition hover:bg-black/80" onPointerDown={event=>event.stopPropagation()} onPointerUp={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();setSceneOpen(true)}}>打开 3D 场景编辑器</button>
      </div>}
      {media && (
        <>
          {node.src && node.kind.includes("video") ? (
            <>
              <video ref={videoRef} src={node.src} playsInline preload="metadata" className="h-full w-full rounded-[12px] object-cover" onPlay={()=>setVideoPlaying(true)} onPause={()=>setVideoPlaying(false)} onEnded={()=>setVideoPlaying(false)} onTimeUpdate={e=>setVideoTime(e.currentTarget.currentTime)} onLoadedMetadata={e=>{setVideoDuration(e.currentTarget.duration);setVideoTime(e.currentTarget.currentTime)}} onDurationChange={e=>setVideoDuration(e.currentTarget.duration)} />
              <button aria-label={videoPlaying?"暂停":"播放"} title={videoPlaying?"暂停":"播放"} className={`absolute left-1/2 top-1/2 z-10 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/75 ${videoPlaying?"opacity-0 group-hover:opacity-100":""}`} onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();const v=videoRef.current;if(!v)return;if(v.paused)void v.play();else v.pause();}}>
                {videoPlaying?<Pause size={26} fill="white"/>:<Play size={26} fill="white" className="ml-1"/>}
              </button>
              <div className="absolute inset-x-2 bottom-2 z-10 flex items-center gap-2 rounded-lg bg-black/55 px-2 py-1" onPointerDown={e=>e.stopPropagation()} onPointerMove={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
                <button aria-label={videoPlaying?"暂停":"播放"} className="grid h-5 w-5 shrink-0 place-items-center text-white" onClick={()=>{const v=videoRef.current;if(v){if(v.paused)void v.play();else v.pause();}}}>
                  {videoPlaying?<Pause size={13} fill="white"/>:<Play size={13} fill="white"/>}
                </button>
                <div ref={seekBarRef} role="slider" aria-label="播放进度" aria-valuemin={0} aria-valuemax={Math.round(videoDuration)} aria-valuenow={Math.round(videoTime)} className="flex-1 cursor-pointer py-1.5" onPointerDown={e=>{e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);seekingRef.current=true;seekVideo(e)}} onPointerMove={e=>{if(seekingRef.current){e.stopPropagation();seekVideo(e)}}} onPointerUp={e=>{e.stopPropagation();seekingRef.current=false}}>
                  <div className="relative h-1 rounded-full bg-white/30">
                    <div className="absolute inset-y-0 left-0 rounded-full bg-(--accent)" style={{width:`${videoProgress}%`}}/>
                    <div className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" style={{left:`${videoProgress}%`}}/>
                  </div>
                </div>
                <span className="shrink-0 text-[9px] tabular-nums text-white">{fmtTime(videoTime)}/{fmtTime(videoDuration)}</span>
                <button aria-label="提取当前帧" title="提取当前帧为图片节点" disabled={frameBusy} className="grid h-5 w-5 shrink-0 place-items-center text-white disabled:opacity-50" onClick={()=>void extractFrame("current")}>
                  <Camera size={12} className={frameBusy?"animate-pulse":""}/>
                </button>
                <button aria-label="提取音轨" title="提取音轨为音频节点" disabled={audioBusy} className="grid h-5 w-5 shrink-0 place-items-center text-white disabled:opacity-50" onClick={()=>void extractAudio()}>
                  <AudioLines size={12} className={audioBusy?"animate-pulse":""}/>
                </button>
                <button aria-label="大屏预览" title="大屏预览" className="grid h-5 w-5 shrink-0 place-items-center text-white" onClick={()=>setPreviewOpen(true)}>
                  <Maximize2 size={12}/>
                </button>
              </div>
            </>
          ) : node.src && node.kind.includes("audio") ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-[12px] bg-gradient-to-br from-[#f4f0ff] to-[#e8f4ff] px-5 pt-6">
              <AudioLines size={30} className="text-(--accent-strong)"/>
              <audio
                src={node.src}
                controls
                preload="metadata"
                className="w-full"
                onPointerDown={e=>e.stopPropagation()}
                onPointerMove={e=>e.stopPropagation()}
                onPointerUp={e=>e.stopPropagation()}
                onClick={e=>e.stopPropagation()}
                onLoadedMetadata={e=>{const duration=e.currentTarget.duration;if(Number.isFinite(duration)){setClipEnd(current=>current>0?Math.min(current,duration):duration);if(Math.abs((node.seconds||0)-duration)>.05)s.updateNode(node.id,{seconds:duration},false);}}}
              />
            </div>
          ) : node.src ? (
            <Image
              draggable={false}
              src={node.src}
              alt={node.name}
              fill
              sizes="300px"
              unoptimized
              className="rounded-[12px] object-cover"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 rounded-[12px] bg-(--bg) text-(--muted)">
              {node.kind.includes("video") ? <Film /> : node.kind.includes("audio") ? <AudioLines /> : <ImageIcon />}
              <span className="text-xs">
                {node.kind.includes("gen")
                  ? node.status==="running"?"正在提交任务…":node.status==="queued"?"正在生成并轮询结果…":node.status==="failed"?(node.errorMessage||"生成失败"):"输入提示词后开始生成"
                  : "点击上传素材"}
              </span>
            </div>
          )}
          {node.kind==="image-gen"&&node.model==="midjourney-imagine"&&node.status==="done"&&node.src&&node.taskId&&(
            !node.mjAction||["variation","high-variation","low-variation","reroll"].includes(node.mjAction)?(
              <div className="pointer-events-none absolute inset-0 z-10 grid grid-cols-2 grid-rows-2 overflow-hidden rounded-[12px]">
                {[1,2,3,4].map(index=><div key={index} className="group/mj relative flex items-end justify-center border border-white/15 pb-3">
                  <span className="absolute left-2 top-2 rounded bg-black/45 px-1.5 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm">{index}</span>
                  <div className="flex gap-1 rounded-lg bg-black/45 p-1 opacity-75 shadow-lg backdrop-blur-sm transition group-hover/mj:opacity-100">
                    <button title={`放大第 ${index} 张`} disabled={!!mjBusy} className="pointer-events-auto rounded-md bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-black hover:bg-white disabled:opacity-45" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();void runMidjourneyAction("upscale",index)}}>U{index}</button>
                    <button title={`以第 ${index} 张生成变体`} disabled={!!mjBusy} className="pointer-events-auto rounded-md bg-black/55 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-black/80 disabled:opacity-45" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();void runMidjourneyAction("variation",index)}}>V{index}</button>
                  </div>
                </div>)}
                <button title="重新生成四宫格" disabled={!!mjBusy} className="pointer-events-auto absolute right-2 top-2 rounded-md bg-black/50 px-2 py-1 text-[10px] text-white shadow backdrop-blur-sm hover:bg-black/75 disabled:opacity-45" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();void runMidjourneyAction("reroll")}}>↻ 重抽</button>
              </div>
            ):(
              <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 grid grid-cols-4 gap-1 rounded-lg bg-black/45 p-1.5 shadow-lg backdrop-blur-sm">
                <button title="生成强变体" disabled={!!mjBusy} className="pointer-events-auto rounded-md bg-white/90 px-1 py-1.5 text-[9px] font-medium text-black hover:bg-white disabled:opacity-45" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();void runMidjourneyAction("high-variation",1)}}>强变体</button>
                <button title="生成弱变体" disabled={!!mjBusy} className="pointer-events-auto rounded-md bg-white/90 px-1 py-1.5 text-[9px] font-medium text-black hover:bg-white disabled:opacity-45" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();void runMidjourneyAction("low-variation",1)}}>弱变体</button>
                <button title="向外扩展 1.5 倍" disabled={!!mjBusy} className="pointer-events-auto rounded-md bg-black/55 px-1 py-1.5 text-[9px] text-white hover:bg-black/80 disabled:opacity-45" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();void runMidjourneyAction("zoom",undefined,1.5)}}>Zoom 1.5×</button>
                <button title="向外扩展 2 倍" disabled={!!mjBusy} className="pointer-events-auto rounded-md bg-black/55 px-1 py-1.5 text-[9px] text-white hover:bg-black/80 disabled:opacity-45" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();void runMidjourneyAction("zoom",undefined,2)}}>Zoom 2×</button>
              </div>
            )
          )}
          <div className="absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-md bg-black/65 text-white" title={node.name}>
            {node.kind.includes("video")?<Film size={13}/>:node.kind.includes("audio")?<AudioLines size={13}/>:node.kind.includes("gen")?<Sparkles size={13}/>:<ImageIcon size={13}/>}
          </div>
          {node.kind.includes("gen")&&node.src&&(
            <button aria-label="下载生成资源" title="下载生成资源" disabled={downloading} className="absolute right-2 top-2 z-20 grid h-8 w-8 place-items-center rounded-lg bg-black/60 text-white opacity-0 shadow transition hover:bg-black/80 group-hover:opacity-100 disabled:opacity-70" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();void downloadAsset()}}>
              <Download size={15} className={downloading?"animate-pulse":""}/>
            </button>
          )}
          {node.src&&!node.kind.includes("video")&&!node.kind.includes("audio")&&(
            <button aria-label="预览图片" title="预览图片" className={`absolute top-2 z-20 grid h-8 w-8 place-items-center rounded-lg bg-black/60 text-white opacity-0 shadow transition hover:bg-black/80 group-hover:opacity-100 ${node.kind.includes("gen")?"right-11":"right-2"}`} onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();setPreviewOpen(true)}}>
              <Maximize2 size={15}/>
            </button>
          )}
          {node.src&&node.kind.includes("video")&&(
            <button aria-label="预览视频" title="预览视频" className={`absolute top-2 z-20 grid h-8 w-8 place-items-center rounded-lg bg-black/60 text-white opacity-0 shadow transition hover:bg-black/80 group-hover:opacity-100 ${node.kind.includes("gen")?"right-20":"right-11"}`} onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();setPreviewOpen(true)}}>
              <Maximize2 size={15}/>
            </button>
          )}
          {node.src&&(node.kind==="image"||node.kind==="image-gen")&&(
            <button aria-label="涂鸦编辑" title="涂鸦编辑" className={`absolute top-2 z-20 grid h-8 w-8 place-items-center rounded-lg bg-black/60 text-white opacity-0 shadow transition hover:bg-black/80 group-hover:opacity-100 ${node.kind.includes("gen")?"right-28":"right-11"}`} onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onDoodle(node)}}>
              <Brush size={14}/>
            </button>
          )}
          {node.kind==="image-gen"&&node.src&&(
            <button aria-label="转为独立图片节点" title="转为独立图片节点(参与画布设计)" className="absolute right-20 top-2 z-20 grid h-8 w-8 place-items-center rounded-lg bg-black/60 text-white opacity-0 shadow transition hover:bg-black/80 group-hover:opacity-100" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();extractImageNode(s,node);}}>
              <ImagePlus size={15}/>
            </button>
          )}
          {node.src&&node.kind.includes("video")&&(
            <div className={`absolute top-2 z-20 ${node.kind.includes("gen")?"right-11":"right-2"}`} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
              <button aria-label="提取视频帧" title="提取视频帧为图片节点" disabled={frameBusy} className="grid h-8 w-8 place-items-center rounded-lg bg-black/60 text-white opacity-0 shadow transition hover:bg-black/80 group-hover:opacity-100 disabled:opacity-70" onClick={()=>setFrameMenuOpen(v=>!v)}>
                <Camera size={15} className={frameBusy?"animate-pulse":""}/>
              </button>
              {frameMenuOpen&&(
                <div className="absolute right-0 top-10 w-32 rounded-lg bg-black/80 p-1 text-white shadow-xl">
                  {(["first","last","current"] as const).map(at=>(
                    <button key={at} className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-white/15" disabled={frameBusy} onClick={()=>void extractFrame(at)}>
                      提取{FRAME_LABEL[at]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {(node.status === "running" || node.status === "queued") && <div className="shimmer" />}
        </>
      )}
      {previewOpen&&node.src&&(
        <MediaPreviewModal src={node.src} isVideo={node.kind.includes("video")} name={node.name} onClose={()=>setPreviewOpen(false)}/>
      )}
      {promptExpanded&&(
        <PromptEditorModal value={node.content||""} fontSize={promptFontSize} onCommit={content=>s.updateNode(node.id,{content})} onClose={()=>setPromptExpanded(false)}/>
      )}
      {inputPreview&&(
        <MediaPreviewModal src={inputPreview.src} isVideo={inputPreview.isVideo} name={inputPreview.name} onClose={()=>setInputPreview(null)}/>
      )}
      {sceneOpen&&typeof document!=="undefined"&&createPortal(<ThreeSceneEditor projectId={projectId} initial={node.sceneData||defaultThreeScene()} onClose={()=>setSceneOpen(false)} onSave={saveScene} onCapture={captureScene} onUploadImage={uploadSceneImage}/>,document.body)}
      {selected&&!node.locked&&!peerLock&&RESIZE_HANDLES.map(({handle,label,className,markerClassName})=><span key={handle} role="button" aria-label={label} className={`absolute z-20 touch-none ${className}`} onPointerDown={e=>startResize(e,handle)} onPointerMove={resizeMove} onPointerUp={resizeUp} onPointerCancel={resizeUp}><span className={`pointer-events-none absolute rounded-full border border-white bg-(--accent) shadow-sm ${markerClassName}`}/></span>)}
      {media && (
        <button
          aria-label="从此节点拖动连线"
          className={`port out !z-30 ${connecting === node.id ? "!opacity-100 !bg-(--accent)" : ""}`}
          onPointerDown={(e) => startConnection(node.id, e)}
          onClick={(e) => e.stopPropagation()}
        >
          <Plus size={11} />
        </button>
      )}
      {selected && s.selected.length === 1 && !node.locked && !peerLock && <div className="absolute z-30 rounded-xl border border-(--line) bg-white p-3 text-xs shadow-xl" style={{left:toolbarOffset,width:panelWidth,...(toolbarSize.height?{minHeight:toolbarSize.height}:{}),transform:`scale(${1/s.zoom})`,transformOrigin:toolbarAbove?"0 100%":"0 0",...(toolbarAbove?{bottom:`calc(100% + ${18/s.zoom}px)`}:{top:`calc(100% + ${18/s.zoom}px)`})}} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
        <span role="separator" aria-label="拖动调整操作栏大小" title="拖动调整操作栏大小" className="absolute -bottom-1.5 -right-1.5 z-40 h-4 w-4 cursor-nwse-resize rounded-full border border-(--line) bg-white shadow" onPointerDown={startPanelResize} onPointerMove={panelResizeMove} onPointerUp={panelResizeUp} onPointerCancel={panelResizeUp}/>
        {!shape&&node.kind!=="text"&&<div className="mb-2 grid grid-cols-2 gap-2"><label className="min-w-0">宽度<input aria-label="宽度" type="number" min="20" className="field mt-1 !py-2" value={Math.round(node.width)} onChange={e=>s.updateNode(node.id,{width:Math.max(20,Number(e.target.value)),...(node.kind==="path"?{pathViewWidth:node.pathViewWidth||node.width,pathViewHeight:node.pathViewHeight||node.height}:{})})}/></label><label className="min-w-0">高度<input aria-label="高度" type="number" min="20" className="field mt-1 !py-2" value={Math.round(node.height)} onChange={e=>s.updateNode(node.id,{height:Math.max(20,Number(e.target.value)),...(node.kind==="path"?{pathViewWidth:node.pathViewWidth||node.width,pathViewHeight:node.pathViewHeight||node.height}:{})})}/></label></div>}
        {node.kind==="text" && <><BufferedTextarea className="field min-h-16 w-full resize-y" ariaLabel="文字内容" value={node.content||""} onCommit={content=>s.updateNode(node.id,{content})}/><div className="mt-2 grid grid-cols-[68px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2"><input aria-label="字号" type="number" min="8" max="200" className="field min-w-0 !px-2" value={node.fontSize||24} onChange={e=>s.updateNode(node.id,{fontSize:Number(e.target.value)})}/><select aria-label="字重" className="field min-w-0 !px-2" value={node.fontWeight||600} onChange={e=>s.updateNode(node.id,{fontWeight:Number(e.target.value)})}><option value="400">常规</option><option value="600">半粗</option><option value="700">粗体</option></select><select aria-label="对齐" className="field min-w-0 !px-2" value={node.textAlign||"left"} onChange={e=>s.updateNode(node.id,{textAlign:e.target.value as CanvasNode["textAlign"]})}><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></div><div className="mt-2 flex items-center gap-2"><label className="flex min-w-0 flex-1 items-center gap-2"><span className="shrink-0 text-(--muted)">宽度</span><input aria-label="文本宽度" type="number" min="48" className="field min-w-0 !py-2" value={Math.round(node.width)} onChange={e=>s.updateNode(node.id,{width:Math.max(48,Number(e.target.value)),manualWidth:true})}/></label>{(node.manualWidth||node.manualHeight)&&<button className="shrink-0 rounded-lg border px-2 py-1.5 text-[10px] text-(--muted)" onClick={()=>s.updateNode(node.id,{manualWidth:false,manualHeight:false})}>自动尺寸</button>}</div><div className="mt-2"><ColorAlphaField label="文字颜色" value={!node.stroke||node.stroke==="transparent"||node.stroke==="#cfcfcb"?"#181818":node.stroke} onChange={v=>s.updateNode(node.id,{stroke:v})}/></div><div className="mt-2 flex items-center gap-2"><span className="text-[10px] text-(--muted)">以当前文字为提示词 · G5.6 Luna</span><button className="ml-auto rounded-lg border px-3 py-2 disabled:opacity-50" disabled={node.status==="running"} onClick={breakdownStoryboard}>拆解分镜</button><button className="rounded-lg bg-(--btn) px-4 py-2 text-white disabled:opacity-50" disabled={node.status==="running"} onClick={generateText}>{node.status==="running"?"生成中…":"AI 生成"}</button></div></>}
        {shape&&<><div className="grid grid-cols-2 gap-2"><ColorAlphaField label="填充颜色" value={node.fill} onChange={v=>s.updateNode(node.id,{fill:v})}/><ColorAlphaField label="描边颜色" value={node.stroke} onChange={v=>s.updateNode(node.id,{stroke:v})}/></div><div className="mt-2 grid grid-cols-2 gap-2"><label className="min-w-0">宽度<input aria-label="图形宽度" type="number" min="20" className="field mt-1 !py-2" value={Math.round(node.width)} onChange={e=>s.updateNode(node.id,{width:Math.max(20,Number(e.target.value))})}/></label><label className="min-w-0">高度<input aria-label="图形高度" type="number" min="20" className="field mt-1 !py-2" value={Math.round(node.height)} onChange={e=>s.updateNode(node.id,{height:Math.max(20,Number(e.target.value))})}/></label></div>{node.kind==="rect"&&<label className="mt-2 block">圆角 <input aria-label="圆角" type="range" min="0" max="70" value={node.cornerRadius||0} onChange={e=>s.updateNode(node.id,{cornerRadius:Number(e.target.value)})}/></label>}</>}
        {node.kind==="path" && <><p className="text-(--muted)">拖动锚点或手柄修改路径；按 Alt 可独立调整手柄。</p><label className="mt-2 block">SVG 路径<textarea aria-label="SVG 路径" className="field mt-1 min-h-16 w-full font-mono" value={node.pathData||""} onChange={e=>s.updateNode(node.id,{pathData:e.target.value,pathPoints:undefined})}/></label><div className="mt-2 grid grid-cols-2 gap-2"><ColorAlphaField label="填充" value={node.fill} onChange={v=>s.updateNode(node.id,{fill:v})}/><ColorAlphaField label="描边" value={node.stroke} onChange={v=>s.updateNode(node.id,{stroke:v})}/></div></>}
        {(node.kind==="image"||node.kind==="video"||node.kind==="audio") && <label className="block cursor-pointer rounded-lg border border-dashed p-2 text-center">上传{node.kind==="image"?"图片":node.kind==="video"?"视频":"音频"}<input type="file" accept={node.kind==="image"?"image/*":node.kind==="video"?"video/*":"audio/*"} className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)void loadFile(f,"src")}}/></label>}
        {node.kind==="scene"&&<button className="flex w-full items-center justify-center gap-2 rounded-lg bg-(--btn) px-3 py-2 text-white" onClick={()=>setSceneOpen(true)}><Waypoints size={14}/>打开 3D 场景编辑器</button>}
        {node.kind.includes("audio")&&node.src&&<div className="mt-3 rounded-lg bg-(--bg) p-3"><div className="mb-2 flex items-center justify-between"><span className="font-medium">截取片段</span><span className="text-[10px] text-(--muted)">{fmtTime(clipStart)}–{fmtTime(clipEnd)} / {fmtTime(node.seconds||clipEnd)}</span></div><div ref={waveformRef} role="group" aria-label="拖动选择音频片段" className="relative h-20 touch-none cursor-ew-resize overflow-hidden rounded-lg border border-(--line) bg-white select-none" onPointerDown={e=>{e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);const duration=node.seconds||clipEnd;const rect=e.currentTarget.getBoundingClientRect();const value=((e.clientX-rect.left)/rect.width)*duration;waveformDrag.current=Math.abs(value-clipStart)<=Math.abs(value-clipEnd)?"start":"end";updateClipFromPointer(e,waveformDrag.current);}} onPointerMove={e=>{if(waveformDrag.current){e.stopPropagation();updateClipFromPointer(e,waveformDrag.current);}}} onPointerUp={e=>{e.stopPropagation();waveformDrag.current=null;}} onPointerCancel={()=>{waveformDrag.current=null;}}>{waveformLoading?<div className="grid h-full place-items-center text-[10px] text-(--muted)">正在读取波形…</div>:<div className="absolute inset-0 flex items-center gap-px px-1">{waveform.map((peak,index)=><span key={index} className="min-w-0 flex-1 rounded-full bg-[#8b5cf6]/70" style={{height:`${Math.round(peak*88)}%`}}/>)}</div>}<div className="pointer-events-none absolute inset-y-0 left-0 bg-white/70" style={{width:`${Math.max(0,Math.min(100,(clipStart/(node.seconds||clipEnd||1))*100))}%`}}/><div className="pointer-events-none absolute inset-y-0 right-0 bg-white/70" style={{width:`${Math.max(0,Math.min(100,(1-clipEnd/(node.seconds||clipEnd||1))*100))}%`}}/><div className="pointer-events-none absolute inset-y-0 w-0.5 bg-[#6d28d9]" style={{left:`${(clipStart/(node.seconds||clipEnd||1))*100}%`}}><span className="absolute -left-1.5 top-1/2 h-7 w-3 -translate-y-1/2 rounded bg-[#6d28d9] shadow"/></div><div className="pointer-events-none absolute inset-y-0 w-0.5 bg-[#6d28d9]" style={{left:`${(clipEnd/(node.seconds||clipEnd||1))*100}%`}}><span className="absolute -left-1.5 top-1/2 h-7 w-3 -translate-y-1/2 rounded bg-[#6d28d9] shadow"/></div></div><div className="mt-2 grid grid-cols-2 gap-2"><label>开始（秒）<input aria-label="片段开始时间" type="number" min="0" max={Math.max(0,clipEnd-.05)} step="0.1" className="field mt-1 !py-2" value={Number(clipStart.toFixed(2))} onChange={e=>setClipStart(Math.min(Math.max(0,Number(e.target.value)),clipEnd-.05))}/></label><label>结束（秒）<input aria-label="片段结束时间" type="number" min="0.05" max={node.seconds||undefined} step="0.1" className="field mt-1 !py-2" value={Number(clipEnd.toFixed(2))} onChange={e=>setClipEnd(Math.max(clipStart+.05,Math.min(node.seconds||Infinity,Number(e.target.value))))}/></label></div><button className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-(--btn) px-3 py-2 text-white disabled:opacity-50" disabled={audioBusy||waveformLoading||clipEnd-clipStart<.05} onClick={()=>void createClip()}><Scissors size={14}/>{audioBusy?"处理中…":"生成片段节点"}</button><p className="mt-2 text-[10px] text-(--muted)">拖动左右分割点选择片段；在浏览器中保存为 WAV，不调用 AI。</p></div>}
        {node.kind.includes("gen") && <>
          {node.kind==="audio-gen"
            ?<BufferedTextarea className="field min-h-20 w-full" style={{fontSize:promptFontSize}} ariaLabel="生成提示词" placeholder="描述要生成的内容" value={node.content||""} onCommit={content=>s.updateNode(node.id,{content})}/>
            :<PromptReferenceInput value={node.content||""} onCommit={content=>s.updateNode(node.id,{content})} refs={node.promptRefs||[]} onRefsChange={promptRefs=>s.updateNode(node.id,{promptRefs})} candidates={promptRefCandidates} onUpload={uploadPromptRef} fontSize={promptFontSize}/>}
          <div className="mt-1.5 flex items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 text-[10px] text-(--muted)"><span className="shrink-0">字号</span><input aria-label="提示词字号" type="range" min={10} max={20} value={promptFontSize} onChange={e=>setPromptFontSize(Number(e.target.value))} className="min-w-0 flex-1"/><span className="w-5 shrink-0 text-right">{promptFontSize}</span></label>
            <button aria-label="全屏编辑提示词" title="全屏编辑提示词" className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-(--line) text-(--muted) transition hover:bg-(--bg) hover:text-(--ink)" onClick={()=>setPromptExpanded(true)}><Maximize2 size={12}/></button>
          </div>
          <div className={`mt-3 grid gap-2 ${node.kind==="audio-gen"?"grid-cols-1":"grid-cols-[minmax(0,1fr)_82px_88px]"}`}>
            <label className="min-w-0">
              <span className="mb-1 block text-(--muted)">模型</span>
              <select aria-label="模型" className="field min-w-0 w-full" value={node.model||(node.kind==="image-gen"?"zhenzhen-image-g-v2.5-lowprice":node.kind==="video-gen"?"seedance-2.5-standard-t2v":"doubao-seed-audio-1.0")} onChange={e=>{setVoiceSearch("");s.updateNode(node.id,{model:e.target.value,voice:undefined,voiceName:undefined})}}>
                <CatalogOptions models={modelCatalog} kind={generationKind!} counts={inputCounts}/>
              </select>
            </label>
            {node.kind!=="audio-gen"&&<>
              <label><span className="mb-1 block text-(--muted)">分辨率</span><select aria-label="分辨率" className="field w-full" value={node.resolution||(node.kind==="image-gen"?"1k":"720p")} onChange={e=>s.updateNode(node.id,{resolution:e.target.value})}>{resolutionOptions.map(v=><option key={v}>{v}</option>)}</select></label>
              <label><span className="mb-1 block text-(--muted)">比例</span><select aria-label="画面比例" className="field w-full" value={node.ratio||""} onChange={e=>s.updateNode(node.id,{ratio:e.target.value||undefined})}><option value="">自动</option>{ratioOptions.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
            </>}
          </div>
          {supportsVoice&&<div className="mt-3">{isVoiceClone?<div className="grid gap-2"><label className="block"><span className="mb-1 block text-(--muted)">音色名称</span><BufferedInput ariaLabel="音色名称" maxLength={80} className="field" value={node.voiceName||""} placeholder="例如：旁白女声" onCommit={voiceName=>s.updateNode(node.id,{voiceName,...(!node.voice?{voice:`voice_${crypto.randomUUID().replaceAll("-","").slice(0,24)}`}:{})})}/></label><label className="block"><span className="mb-1 block text-(--muted)">音色 ID</span><BufferedInput ariaLabel="音色 ID" maxLength={160} className="field font-mono text-[11px]" value={node.voice||""} placeholder="填写名称后自动生成" onCommit={voice=>s.updateNode(node.id,{voice:voice.replace(/[^\w.-]/g,"_")})}/></label><p className="text-[10px] leading-4 text-(--muted)">克隆成功后保存到你的个人音色库，并按当前项目名称分类；克隆音色若 7 天未被语音生成使用，会被云端自动删除，每次使用会重新计时。</p></div>:<div className="grid gap-2">{node.model?.includes("speech-2.8")&&voiceProfiles.length>0&&<input aria-label="搜索个人音色" className="field" value={voiceSearch} placeholder="搜索项目名称或音色名称" onChange={e=>setVoiceSearch(e.target.value)}/>}<label className="block"><span className="mb-1 block text-(--muted)">选择音色</span><select aria-label="音色" className="field w-full" value={node.voice||""} onChange={e=>{setVoiceSearch("");s.updateNode(node.id,{voice:e.target.value||undefined})}}><option value="">{requiresVoice?"请选择音色":"自动选择"}</option>{presetVoices.length>0&&<optgroup label="预设音色">{presetVoices.map(voice=><option key={voice.id} value={voice.id}>{voice.label}</option>)}</optgroup>}{node.model?.includes("speech-2.8")&&voiceGroups.map(([project,voices])=><optgroup key={project} label={project}>{voices.map(voice=><option key={voice.id} value={voice.voiceId}>{voice.name}{voiceExpiry(voice)?.expired?"（已过期）":""}</option>)}</optgroup>)}{node.voice&&![...presetVoices.map(item=>item.id),...matchingVoiceProfiles.map(item=>item.voiceId)].includes(node.voice)&&<option value={node.voice}>{voiceProfiles.find(item=>item.voiceId===node.voice)?.name||node.voice} · 当前选择</option>}</select></label>{node.model?.includes("speech-2.8")&&voiceProfiles.length>0&&<p className="text-[10px] text-(--muted)">{voiceNeedle?`找到 ${matchingVoiceProfiles.length} 个个人音色`:`个人音色 ${voiceProfiles.length} 个 · 已按项目分组`}</p>}</div>}<p className="mt-1 text-[10px] leading-4 text-(--muted)"><a href="https://api.seedance.nz/docs/" target="_blank" rel="noreferrer" className="underline">查看音频模型文档</a></p></div>}
          {node.kind==="audio-gen"&&audioInputCount===0&&<p className="mt-2 rounded-lg bg-[#f3e8ff] px-3 py-2 text-[10px] leading-4 text-[#6d28d9]">将一段语音或截取片段连接到此节点后，模型列表会显示 MiniMax Voice Clone；克隆模型仅接受 1 段音频。</p>}
          {selectedCatalogModel&&<p className="mt-2 text-[10px] text-(--muted)">{selectedCatalogModel.capabilities?.category_label}{currentCompatibility.reason?` · ${currentCompatibility.reason}`:""}</p>}
          {(node.kind!=="audio-gen"||genInputItems.length>0)&&<div className="mt-2">
            <div className="mb-1 text-[10px] text-(--muted)">输入素材 · 当前条件会自动筛选可用模型</div>
            <div className="flex flex-wrap gap-1.5">{node.kind!=="audio-gen"&&<label aria-label="上传参考图" title="上传参考图" className="grid h-12 w-12 shrink-0 cursor-pointer place-items-center rounded-lg border border-dashed border-(--muted) text-(--muted) transition hover:border-(--accent) hover:bg-(--accent-tint) hover:text-(--accent)"><Plus size={19}/><input type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)void loadFile(f,"reference");e.currentTarget.value=""}}/></label>}{genInputItems.map(item=>(
              <div key={item.key} className="group relative h-12 w-12 shrink-0 rounded-lg border border-(--line) bg-(--bg)">
                <button type="button" aria-label={`预览${item.name}`} className="h-full w-full overflow-hidden rounded-lg disabled:cursor-default" disabled={item.pending||!item.src||item.kind==="audio"} onClick={()=>{if(item.src&&item.kind!=="audio")setInputPreview({src:item.src,isVideo:item.kind==="video",name:item.name})}}>
                  {item.src?(item.kind==="video"?<><video src={item.src} muted playsInline preload="metadata" className="pointer-events-none h-full w-full object-cover"/><span className="pointer-events-none absolute inset-0 grid place-items-center"><Film size={14} className="text-white drop-shadow"/></span></>:item.kind==="audio"?<span className="grid h-full place-items-center text-[#9333ea]"><AudioLines size={19}/></span>:<Image src={item.src} alt={item.name} fill sizes="48px" unoptimized className="rounded-lg object-cover"/>):<span className="grid h-full place-items-center text-[9px] text-(--muted)">待生成</span>}
                </button>
                <button type="button" aria-label={`断开${item.name}`} title="断开连接" className="absolute -right-1.5 -top-1.5 z-10 grid h-4 w-4 place-items-center rounded-full bg-black/65 text-white opacity-0 transition group-hover:opacity-100 hover:bg-black" onClick={()=>removeInput(item)}><X size={9}/></button>
              </div>
            ))}</div>
            {pendingInputCount>0&&<p className="mt-1 text-[10px] text-(--muted)">{pendingInputCount} 个输入尚未生成/上传，本次不会使用</p>}
          </div>}
          {node.kind==="video-gen"&&<label className="mt-3 block">时长 <input type="number" min={durationRule.min} max={durationRule.max} className="field !w-20" value={node.seconds||durationRule.default} onChange={e=>s.updateNode(node.id,{seconds:Number(e.target.value)})}/> 秒</label>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className="ml-auto rounded-lg bg-(--btn) px-4 py-2 text-white disabled:opacity-45" disabled={!currentCompatibility.compatible||!node.model||(requiresVoice&&!node.voice?.trim())||(isVoiceClone&&(!node.voiceName?.trim()||!node.voice?.trim()))} onClick={generate}>生成</button>
          </div>
          {generationError&&<p role="status" className={`mt-2 ${node.status==="failed"?"text-[#b44]":"text-(--muted)"}`}>{generationError}</p>}
        </>}
        {generationError&&!node.kind.includes("gen")&&<p role="status" className="mt-2 text-[#b44]">{generationError}</p>}
        <div className="mt-2 flex gap-1 border-t pt-2"><input aria-label="对选中节点对话修改" className="field min-w-0 flex-1" placeholder="告诉助手如何修改此节点" value={inlinePrompt} onChange={e=>setInlinePrompt(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")editWithAssistant()}}/><button title="发送" className="rounded-lg bg-black px-2 text-white disabled:opacity-50" disabled={inlineBusy} onClick={editWithAssistant}><Send size={14}/></button></div>
      </div>}
    </div>
  );
}
function LayersPanel() {
  const s = useCanvas();
  return (
    <div className="absolute bottom-20 left-5 z-30 w-72 rounded-2xl p-3 glass">
      <div className="flex items-center justify-between px-2 pb-2">
        <b className="text-sm">图层</b>
        <button className="icon-btn !h-7 !w-7" onClick={() => s.setPanel(null)}>
          <X size={14} />
        </button>
      </div>
      <div className="scrollbar max-h-72 overflow-auto">
        {(()=>{
          const rows:[CanvasNode,number][]=[];
          const walk=(n:CanvasNode,depth:number)=>{rows.push([n,depth]);for(const c of s.nodes.filter(x=>x.parentId===n.id).reverse())walk(c,depth+1);};
          for(const n of [...s.nodes].filter(x=>!x.parentId||!s.nodes.some(p=>p.id===x.parentId)).reverse())walk(n,0);
          return rows.map(([n,depth]) => (
          <button
            key={n.id}
            onClick={() => s.setSelected([n.id])}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs ${s.selected.includes(n.id) ? "bg-(--accent-tint)" : "hover:bg-(--bg)"}`}
            style={depth?{paddingLeft:8+depth*18}:undefined}
          >
            <span className="text-(--muted)">
              {n.kind === "frame" ? (
                <Frame size={14} />
              ) : n.kind.includes("video") ? (
                <Film size={14} />
              ) : n.kind.includes("audio") ? (
                <AudioLines size={14} />
              ) : n.kind.includes("image") ? (
                <ImageIcon size={14} />
              ) : (
                <Box size={14} />
              )}
            </span>
            <span className="flex-1 truncate">{n.name}</span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                s.toggleNode(n.id, "locked");
              }}
            >
              {n.locked ? <Lock size={13} /> : <Unlock size={13} />}
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                s.toggleNode(n.id, "visible");
              }}
            >
              {n.visible ? <Eye size={13} /> : <EyeOff size={13} />}
            </span>
          </button>
          ));
        })()}
      </div>
    </div>
  );
}
function AssetsPanel() {
  const s = useCanvas();
  const assets = s.nodes.filter((n) => n.src);
  return (
    <div className="absolute bottom-20 left-5 z-30 w-80 rounded-2xl p-3 glass">
      <div className="flex items-center justify-between px-2 pb-2">
        <div>
          <b className="text-sm">AI 资产</b>
          <p className="text-[11px] text-(--muted)">生成结果与上传素材</p>
        </div>
        <button className="icon-btn !h-7 !w-7" onClick={() => s.setPanel(null)}>
          <X size={14} />
        </button>
      </div>
      <div className="grid max-h-64 grid-cols-3 gap-2 overflow-auto">
        {assets.map((n) => (
          <button
            key={n.id}
            onClick={() => s.setSelected([n.id])}
            className="relative aspect-square overflow-hidden rounded-lg bg-(--accent-tint)"
          >
            {n.kind.includes("video")?<Film className="m-auto mt-8"/>:n.kind.includes("audio")?<AudioLines className="m-auto mt-8"/>:<Image src={n.src!} alt={n.name} fill sizes="96px" unoptimized className="object-cover"/>}
          </button>
        ))}
      </div>
    </div>
  );
}
function VoicesPanel({voices,onRename,onDelete}:{voices:VoiceProfile[];onRename:(voice:VoiceProfile,name:string)=>Promise<void>;onDelete:(voice:VoiceProfile)=>Promise<void>}) {
  const s = useCanvas();
  const [search,setSearch]=useState("");
  const [editingId,setEditingId]=useState<string|null>(null);
  const [nameDraft,setNameDraft]=useState("");
  const [confirmingId,setConfirmingId]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const needle=search.trim().toLocaleLowerCase("zh-CN");
  const matching=voices.filter(item=>!needle||`${item.projectName} ${item.name} ${item.voiceId}`.toLocaleLowerCase("zh-CN").includes(needle));
  const groups=Object.entries(matching.reduce<Record<string,VoiceProfile[]>>((acc,item)=>{(acc[item.projectName]||=[]).push(item);return acc;},{}));
  const submitRename=async(voice:VoiceProfile)=>{
    const name=nameDraft.trim();
    if(!name||name===voice.name){setEditingId(null);return;}
    setBusy(true);setError("");
    try{await onRename(voice,name);setEditingId(null);}
    catch(e){setError(e instanceof Error?e.message:"重命名失败");}
    finally{setBusy(false);}
  };
  const confirmDelete=async(voice:VoiceProfile)=>{
    setBusy(true);setError("");
    try{await onDelete(voice);setConfirmingId(null);}
    catch(e){setError(e instanceof Error?e.message:"删除失败");}
    finally{setBusy(false);}
  };
  return (
    <div className="absolute bottom-20 left-5 z-30 w-80 rounded-2xl p-3 glass">
      <div className="flex items-center justify-between px-2 pb-2">
        <div>
          <b className="text-sm">音色管理</b>
          <p className="text-[11px] text-(--muted)">个人音色 {voices.length} 个 · 跨项目可用 · 7 天未使用会被云端删除</p>
        </div>
        <button className="icon-btn !h-7 !w-7" onClick={() => s.setPanel(null)}>
          <X size={14} />
        </button>
      </div>
      {voices.length>0&&<input aria-label="搜索音色" className="field mb-2 w-full" value={search} placeholder="搜索项目名称或音色名称" onChange={e=>setSearch(e.target.value)}/>}
      <div className="scrollbar max-h-72 overflow-auto">
        {groups.map(([project,items])=>(
          <div key={project}>
            <div className="px-2 pb-1 pt-2 text-[10px] font-medium text-(--muted)">{project} · {items.length}</div>
            {items.map(voice=>(
              <div key={voice.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-(--bg)">
                <AudioLines size={14} className="shrink-0 text-[#9333ea]"/>
                {editingId===voice.id?(
                  <>
                    <input aria-label="新音色名称" maxLength={80} autoFocus className="field min-w-0 flex-1 !py-1" value={nameDraft} onChange={e=>setNameDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void submitRename(voice);if(e.key==="Escape")setEditingId(null);}}/>
                    <button type="button" aria-label="确认重命名" title="确认" className="shrink-0 disabled:opacity-50" disabled={busy} onClick={()=>void submitRename(voice)}><Check size={13}/></button>
                    <button type="button" aria-label="取消重命名" title="取消" className="shrink-0" onClick={()=>setEditingId(null)}><X size={13}/></button>
                  </>
                ):(
                  <>
                    <span className="min-w-0 flex-1 truncate" title={voice.voiceId}>{voice.name}</span>
                    {(()=>{const expiry=voiceExpiry(voice);if(!expiry)return null;return <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] ${expiry.expired?"bg-[#fee2e2] text-[#b44]":expiry.daysLeft<=1?"bg-[#fef3c7] text-[#b45309]":"bg-(--bg) text-(--muted)"}`} title="MiniMax 克隆音色 7 天未被语音生成使用会被云端自动删除，每次使用会重新计时">{expiry.expired?"已过期":expiry.daysLeft<=1?"即将过期":`${expiry.daysLeft} 天后过期`}</span>;})()}
                    {confirmingId===voice.id?(
                      <span className="flex shrink-0 items-center gap-1.5 text-[10px]">
                        <button type="button" className="rounded border border-[#b44] px-1.5 py-0.5 text-[#b44] disabled:opacity-50" disabled={busy} onClick={()=>void confirmDelete(voice)}>确认删除</button>
                        <button type="button" className="rounded border px-1.5 py-0.5 text-(--muted)" onClick={()=>setConfirmingId(null)}>取消</button>
                      </span>
                    ):(
                      <>
                        <button type="button" aria-label={`重命名${voice.name}`} title="重命名" className="shrink-0 opacity-0 transition group-hover:opacity-100" onClick={()=>{setEditingId(voice.id);setNameDraft(voice.name);setConfirmingId(null);setError("")}}><Pencil size={13}/></button>
                        <button type="button" aria-label={`删除${voice.name}`} title="删除" className="shrink-0 opacity-0 transition group-hover:opacity-100 hover:text-[#b44]" onClick={()=>{setConfirmingId(voice.id);setEditingId(null);setError("")}}><Trash2 size={13}/></button>
                      </>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
        {groups.length===0&&<p className="px-2 py-6 text-center text-[11px] text-(--muted)">{voices.length?"没有匹配的音色":"还没有个人音色，用音色克隆节点创建一个"}</p>}
      </div>
      {error&&<p role="status" className="px-2 pt-2 text-[11px] text-[#b44]">{error}</p>}
    </div>
  );
}
function MiniMap() {
  const s = useCanvas();
  return (
    <div className="absolute bottom-20 left-5 z-20 h-32 w-52 overflow-hidden rounded-xl glass">
      <div className="absolute inset-2 bg-(--canvas)">
        {s.nodes.map((n) => (
          <span
            key={n.id}
            className="absolute border border-(--muted) bg-white/80"
            style={{
              left: n.x / 9,
              top: n.y / 9,
              width: Math.max(5, n.width / 9),
              height: Math.max(4, n.height / 9),
            }}
          />
        ))}
      </div>
    </div>
  );
}
function Inspector() {
  const s = useCanvas(),
    n = s.nodes.find((n) => n.id === s.selected[0]);
  if (!n) return null;
  const vectorNodes = s.nodes.filter(
    (item) =>
      s.selected.includes(item.id) &&
      ["rect", "ellipse", "polygon", "path"].includes(item.kind),
  );
  const groupInFrame = () => {
    const items = s.nodes.filter((item) => s.selected.includes(item.id));
    if (!items.length) return;
    const left = Math.min(...items.map((item) => item.x));
    const top = Math.min(...items.map((item) => item.y));
    const right = Math.max(...items.map((item) => item.x + item.width));
    const bottom = Math.max(...items.map((item) => item.y + item.height));
    const frameId = s.addNode("frame", left - 24, top - 44);
    s.updateNode(frameId, {
      width: right - left + 48,
      height: bottom - top + 68,
      name: "容器 Frame",
    });
    items.forEach((item) => s.updateNode(item.id, { parentId: frameId }));
    s.setSelected([frameId]);
  };
  const colorField = n.kind === "text" ? "stroke" : "fill";
  const parsedColor = parseColor(
    n.kind === "text"
      ? (!n.stroke || n.stroke === "transparent" ? "#181818" : n.stroke)
      : (n.fill === "transparent" ? "#ffffff" : n.fill),
  );
  return (
    <div className="absolute right-[380px] top-16 z-30 flex items-center gap-2 rounded-xl p-2 glass">
      <input
        aria-label="填充颜色"
        type="color"
        value={parsedColor.color}
        onChange={(e) => s.updateNode(n.id, { [colorField]: withAlpha(e.target.value, parsedColor.alpha === 0 ? 1 : parsedColor.alpha) })}
        className="h-7 w-7 rounded border-0 bg-transparent"
      />
      <input
        aria-label="不透明度"
        title="不透明度"
        type="range"
        min={0}
        max={100}
        value={Math.round(parsedColor.alpha * 100)}
        onChange={(e) => s.updateNode(n.id, { [colorField]: withAlpha(parsedColor.color, Number(e.target.value) / 100) })}
        className="w-16"
      />
      <span className="border-l border-(--line) pl-2 text-xs text-(--muted)">
        {Math.round(n.width)} × {Math.round(n.height)}
      </span>
      <button className="icon-btn !h-8 !w-8" onClick={s.duplicate}>
        <Copy size={15} />
      </button>
      {s.selected.length > 1 && (
        <>
          <button
            title="放入 Frame"
            className="icon-btn !h-8 !w-8"
            onClick={groupInFrame}
          >
            <Frame size={15} />
          </button>
          {vectorNodes.length >= 2 && (
            <>
              <span className="mx-0.5 h-4 w-px bg-(--line)" />
              <button
                title="并集 / 联集 (Union)"
                className="icon-btn !h-8 !w-8"
                onClick={() => runBooleanOp(s, "unite")}
              >
                <UnionIcon size={15} />
              </button>
              <button
                title="减去顶层 / 差集 (Subtract)"
                className="icon-btn !h-8 !w-8"
                onClick={() => runBooleanOp(s, "subtract")}
              >
                <SubtractIcon size={15} />
              </button>
              <button
                title="交集 (Intersect)"
                className="icon-btn !h-8 !w-8"
                onClick={() => runBooleanOp(s, "intersect")}
              >
                <IntersectIcon size={15} />
              </button>
              <button
                title="排除重叠 (Exclude)"
                className="icon-btn !h-8 !w-8"
                onClick={() => runBooleanOp(s, "exclude")}
              >
                <ExcludeIcon size={15} />
              </button>
            </>
          )}
        </>
      )}
      <button
        className="icon-btn !h-8 !w-8 hover:!bg-red-500"
        onClick={s.removeSelected}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
function Assistant({projectId}:{projectId:string}) {
  const s = useCanvas();
  const open = useAssistantUI((ui) => ui.open),
    setOpen = useAssistantUI((ui) => ui.setOpen),
    storyboardNodeId = useAssistantUI((ui) => ui.storyboard?.seq);
  const [value, setValue] = useState(""),
    [autoSend,setAutoSend]=useState(false),
    [busy, setBusy] = useState(false),
    [session,setSession]=useState<string|null>(null),
    [sessions,setSessions]=useState<{id:string;title:string}[]>([]),
    [showSessions,setShowSessions]=useState(false),
    [messages, setMessages] = useState<
      { role: "user" | "assistant"; text: string }[]
    >([
      {
        role: "assistant",
        text: "你好，我是你的 G5.6 Luna 画布助手。选中画布元素后告诉我想怎么修改，或者直接描述要创建的内容。",
      },
    ]);
  useEffect(()=>{fetch(`/api/projects/${projectId}/chats`).then(r=>r.json()).then(data=>setSessions(data.sessions||[])).catch(()=>{});const starter=sessionStorage.getItem(`mini-canvas-prompt:${projectId}`);if(starter){setValue(starter);setAutoSend(true);sessionStorage.removeItem(`mini-canvas-prompt:${projectId}`)}},[projectId]);
  const newSession=useCallback(async()=>{
    const response=await fetch(`/api/projects/${projectId}/chats`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({title:"新对话"})});const data=await response.json();if(!response.ok)throw new Error(data.error||"新建对话失败");setSession(data.id);setSessions(items=>[{id:data.id,title:"新对话"},...items]);setMessages([]);setShowSessions(false);return data.id as string;
  },[projectId]);
  const openSession=async(id:string)=>{setSession(id);setShowSessions(false);const response=await fetch(`/api/chats/${id}/messages`);const data=await response.json();setMessages((data.messages||[]).map((m:{role:"user"|"assistant";content:{text:string}})=>({role:m.role,text:m.content?.text||""})));};
  const saveMessage=useCallback(async(id:string,role:"user"|"assistant",text:string)=>{const response=await fetch(`/api/chats/${id}/messages`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({role,text})});if(!response.ok){const data=await response.json();throw new Error(data.error||"消息保存失败")}},[]);
  const note=useCallback((text:string)=>{
    setMessages((m)=>[...m,{role:"assistant",text}]);
    if(session)void saveMessage(session,"assistant",text).catch(()=>{});
  },[session,saveMessage]);
  useEffect(()=>{
    if(!storyboardNodeId)return;
    const script=useAssistantUI.getState().storyboard?.script||"";
    const userText=`拆解分镜：${script.length>80?`${script.slice(0,80)}…`:script}`;
    const assistantText="好的，我先分析脚本，然后向你确认几个关键设置（风格、比例、生图/生视频模型等），确认后我会生成分镜草稿供你编辑，确定无误再添加到画布。";
    void(async()=>{
      try{
        const sessionId=session||await newSession();
        setMessages((m)=>[...m,{role:"user",text:userText},{role:"assistant",text:assistantText}]);
        await saveMessage(sessionId,"user",userText);
        await saveMessage(sessionId,"assistant",assistantText);
      }catch{
        setMessages((m)=>[...m,{role:"user",text:userText},{role:"assistant",text:assistantText}]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[storyboardNodeId]);
  const send = useCallback(async () => {
    if (!value.trim() || busy) return;
    const prompt = value.trim();
    if (!(await ensureLogin(() => void send()))) return;
    setValue("");
    setBusy(true);
    try {
      const sessionId=session||await newSession();
      setMessages((m) => [...m, { role: "user", text: prompt }]);
      await saveMessage(sessionId,"user",prompt);
      const res = await authFetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          projectId,
          selected: s.nodes.filter((n) => s.selected.includes(n.id)),
        }),
      }, () => void send());
      const data = await res.json();
      if(!res.ok)throw new Error(data.error||"助手请求失败");
      if (data.commands)
        for (const c of data.commands) {
          if (c.type === "update" && s.selected[0])
            s.updateNode(s.selected[0], c.patch);
          if (c.type === "create") s.addNode(c.kind, c.x, c.y);
        }
      setMessages((m) => [...m, { role: "assistant", text: data.message }]);
      await saveMessage(sessionId,"assistant",data.message);
    } catch (error) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: error instanceof Error ? error.message : "暂时无法连接助手" },
      ]);
    } finally {
      setBusy(false);
    }
  },[value,busy,session,projectId,s,newSession,saveMessage]);
  useEffect(()=>{if(autoSend&&value.trim()){setAutoSend(false);void send()}},[autoSend,value,send]);
  if (!open)
    return (
      <button
        className="absolute right-5 top-16 z-40 rounded-xl p-2 glass"
        onClick={() => setOpen(true)}
      >
        <PanelRightOpen size={18} />
      </button>
    );
  return (
    <aside className="assistant-panel relative z-40 flex w-[360px] shrink-0 flex-col border-l border-(--line) bg-white">
      <header className="flex h-14 items-center justify-between border-b border-(--accent-tint) px-4">
        <div>
          <b className="text-sm">创作助手</b>
          <span className="ml-2 text-[10px] text-(--muted)">G5.6 Luna</span>
        </div>
        <div className="flex gap-1"><button title="对话记录" className="icon-btn !h-8 !w-8" onClick={()=>setShowSessions(!showSessions)}><MessageCircle size={16}/></button><button title="新建对话" className="icon-btn !h-8 !w-8" onClick={()=>newSession().catch(e=>setMessages([{role:"assistant",text:e.message}]))}><Plus size={16}/></button><button className="icon-btn !h-8 !w-8" onClick={() => setOpen(false)}>
          <PanelRightClose size={17} />
        </button></div>
      </header>
      {showSessions&&<div className="max-h-44 overflow-auto border-b p-2">{sessions.map(item=><button key={item.id} className="block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-(--accent-tint)" onClick={()=>openSession(item.id)}>{item.title}</button>)}</div>}
      <div className="scrollbar flex-1 space-y-4 overflow-auto p-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[90%] rounded-2xl px-3 py-2.5 text-sm leading-6 ${m.role === "user" ? "ml-auto bg-(--btn) text-white" : "bg-(--bg)"}`}
          >
            {m.text}
          </div>
        ))}
        {busy && (
          <div className="w-fit rounded-2xl bg-(--bg) px-4 py-3 text-xs text-(--muted)">
            正在理解画布…
          </div>
        )}
        <StoryboardFlow projectId={projectId} onNote={note} />
      </div>
      <div className="border-t border-(--accent-tint) p-3">
        {s.selected.length > 0 && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-(--accent-tint) px-2 py-1.5 text-[11px] text-(--accent)">
            <MousePointer2 size={12} />
            已选择 {s.selected.length} 个元素
            <button className="ml-auto" onClick={() => s.setSelected([])}>
              <X size={12} />
            </button>
          </div>
        )}
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="描述你的设计需求…"
          className="field min-h-24 resize-none text-sm"
        />
        <div className="mt-2 flex items-center justify-between">
          <div className="flex gap-1">
            <button className="icon-btn !h-8 !w-8">
              <Plus size={17} />
            </button>
            <button className="icon-btn !h-8 !w-8">
              <ImageIcon size={17} />
            </button>
          </div>
          <button
            onClick={send}
            className="grid h-9 w-9 place-items-center rounded-full bg-(--btn) text-white"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}
export function CanvasEditor({ projectId }: { projectId: string }) {
  const s = useCanvas();
  const [projectName,setProjectName]=useState("项目"),[saveError,setSaveError]=useState("");
  const [modelCatalog,setModelCatalog]=useState<CatalogModel[]>([]);
  const [voiceProfiles,setVoiceProfiles]=useState<VoiceProfile[]>([]);
  const [isAppAdmin,setIsAppAdmin]=useState(false);
  const [connecting, setConnecting] = useState<{id:string;dir:"out"|"in"} | null>(null),
    [inviteOpen,setInviteOpen]=useState(false),[inviteEmail,setInviteEmail]=useState(""),[inviteLink,setInviteLink]=useState(""),[inviteError,setInviteError]=useState(""),
    [linkPoint, setLinkPoint] = useState<{x:number;y:number} | null>(null),
    [linkMenu, setLinkMenu] = useState<{x:number;y:number;from:string;dir:"out"|"in"} | null>(null),
    [penPoints,setPenPoints]=useState<PenPoint[]>([]),[penCursor,setPenCursor]=useState<{x:number;y:number}|null>(null),
    [context, setContext] = useState<{id:string|null;x:number;y:number} | null>(null),
    [addMenu, setAddMenu] = useState<{x:number;y:number;cx:number;cy:number} | null>(null),
    [commentTarget,setCommentTarget]=useState<{x:number;y:number;id?:string;objectId?:string}|null>(null),
    [commentText,setCommentText]=useState(""),[commentError,setCommentError]=useState(""),[commentBusy,setCommentBusy]=useState(false),[commentColor,setCommentColor]=useState("#ff7262"),[currentUserId,setCurrentUserId]=useState(""),[currentUserRole,setCurrentUserRole]=useState<string|null>(null),[draggingComment,setDraggingComment]=useState<string|null>(null),
    [menu, setMenu] = useState(false),
    [dropTarget, setDropTarget] = useState<string | null>(null),
    [bg, setBg] = useState("#f2f2f0"),
    [peers, setPeers] = useState<Record<string, { name: string; x?: number; y?: number; selection?: string[] }>>({}),
    [sceneReady, setSceneReady] = useState(false),
    [collabSynced, setCollabSynced] = useState(false),
    [loadError, setLoadError] = useState(""),
    [members, setMembers] = useState<{ userId: string; role: string; name: string; email: string }[]>([]),
    [me, setMe] = useState<{ id: string; role: string; name: string } | null>(null),
    [memberActionError, setMemberActionError] = useState(""),
    [membersOpen, setMembersOpen] = useState(false),
    [checkedMembers, setCheckedMembers] = useState<string[]>([]),
    [memberBusy, setMemberBusy] = useState(false),
    [renaming, setRenaming] = useState(false),
    [nameDraft, setNameDraft] = useState(""),
    [historyOpen, setHistoryOpen] = useState(false),
    [historyList, setHistoryList] = useState<{ version: number; createdAt: string; author: string }[]>([]),
    [historyError, setHistoryError] = useState(""),
    [historyBusy, setHistoryBusy] = useState(false),
    [marquee, setMarquee] = useState<{
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      shiftKey: boolean;
      initialSelected: string[];
    } | null>(null),
    dragPan = useRef<{ x: number; y: number; px: number; py: number } | null>(
      null,
    );
  const penDrag = useRef<number | null>(null);
  const commentDrag = useRef<{id:string;sx:number;sy:number;ox:number;oy:number;moved:boolean;lastSent?:number} | null>(null);
  const penEditDrag = useRef<{index:number;part:"anchor"|"in"|"out";sx:number;sy:number;moved:boolean} | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const canvasSurfaceRef = useRef<HTMLDivElement | null>(null);
  const connectingRef = useRef<{id:string;dir:"out"|"in"} | null>(null);
  const justConnectedRef = useRef(false);
  const isMarqueeDraggingRef = useRef(false);
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCursorRef = useRef<{ x: number; y: number } | null>(null);
  const onVoiceSaved=useCallback((voice:VoiceProfile)=>{
    setVoiceProfiles(items=>[voice,...items.filter(item=>item.id!==voice.id&&item.voiceId!==voice.voiceId)].sort((a,b)=>a.projectName.localeCompare(b.projectName,"zh-CN")||a.name.localeCompare(b.name,"zh-CN")));
  },[]);
  const renameVoice=useCallback(async(voice:VoiceProfile,name:string)=>{
    const response=await authFetch(`/api/voices/${encodeURIComponent(voice.voiceId)}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({name})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"重命名失败");
    onVoiceSaved(data.voice);
  },[onVoiceSaved]);
  const deleteVoice=useCallback(async(voice:VoiceProfile)=>{
    const response=await authFetch(`/api/voices/${encodeURIComponent(voice.voiceId)}`,{method:"DELETE"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"删除失败");
    setVoiceProfiles(items=>items.filter(item=>item.id!==voice.id));
  },[]);
  const onVoiceUsed=useCallback((voiceId:string)=>{
    const usedAt=new Date().toISOString();
    setVoiceProfiles(items=>items.map(item=>item.voiceId===voiceId?{...item,lastUsedAt:usedAt}:item));
  },[]);
  const [doodleNode,setDoodleNode]=useState<CanvasNode|null>(null);
  const [doodleBusy,setDoodleBusy]=useState(false);
  const [doodleError,setDoodleError]=useState("");
  const [doodleFontSize]=usePersistentValue<number>(PROMPT_FONT_KEY,12,raw=>{const v=Number(raw);return Number.isFinite(v)&&v>=10&&v<=24?v:12;});
  const createDoodleEdit=async(source:CanvasNode,blob:Blob,prompt:string)=>{
    setDoodleBusy(true);setDoodleError("");
    try{
      const uploaded=await uploadImageBlob(projectId,blob,"doodle.png");
      const rects=()=>useCanvas.getState().nodes.map(item=>({x:item.x,y:item.y,width:item.width,height:item.height}));
      const doodlePos=nearbyFreePosition(rects(),{x:source.x+source.width+64,y:source.y},{width:480,height:320},36);
      const state=useCanvas.getState();
      const doodleId=state.addNode("image",doodlePos.x,doodlePos.y);
      state.updateNode(doodleId,{name:"涂鸦标记",src:uploaded.src,srcPath:uploaded.srcPath,assetId:uploaded.assetId},false);
      void probeMediaSize("image",uploaded.src).then(size=>{if(size)useCanvas.getState().updateNode(doodleId,size,false);});
      const genPos=nearbyFreePosition(rects(),{x:doodlePos.x+544,y:doodlePos.y},{width:480,height:320},36);
      const genId=useCanvas.getState().addNode("image-gen",genPos.x,genPos.y);
      const compatible=compatibleCatalog(modelCatalog,"image",{image:2,video:0,audio:0});
      useCanvas.getState().updateNode(genId,{name:"涂鸦编辑",content:prompt,model:compatible[0]?.model_id??"seedream-v5-pro-t2i"},false);
      useCanvas.getState().addEdge(source.id,genId);
      useCanvas.getState().addEdge(doodleId,genId);
      useCanvas.getState().setSelected([genId]);
      setDoodleNode(null);
    }catch(error){
      setDoodleError(error instanceof Error?error.message:"创建编辑任务失败");
    }
    finally{setDoodleBusy(false);}
  };
  useEffect(() => {
    let active = true;
    fetch("/api/models/catalog")
      .then(async (response) => response.ok ? response.json() : Promise.reject(new Error("模型目录加载失败")))
      .then((data) => { if (active && Array.isArray(data.models)) setModelCatalog(data.models); })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  useEffect(()=>{
    let active=true;
    fetch("/api/voices",{cache:"no-store"}).then(async response=>response.ok?response.json():Promise.reject()).then(data=>{if(active&&Array.isArray(data.voices))setVoiceProfiles(data.voices)}).catch(()=>{});
    return()=>{active=false};
  },[]);
  useEffect(() => {
    let active = true;
    fetch("/api/me", { cache: "no-store" }).then((response)=>response.ok?response.json():null).then((data)=>{if(active)setIsAppAdmin(data?.user?.role==="admin")}).catch(()=>{});
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const el = canvasSurfaceRef.current;
    if (!el) return;
    let panFrame=0,panDeltaX=0,panDeltaY=0;
    const queuePan=(deltaX:number,deltaY:number)=>{
      panDeltaX+=deltaX;panDeltaY+=deltaY;
      if(panFrame)return;
      panFrame=requestAnimationFrame(()=>{
        const store=useCanvas.getState(),dx=panDeltaX,dy=panDeltaY;
        panFrame=0;panDeltaX=0;panDeltaY=0;
        store.setPan({x:store.pan.x-dx,y:store.pan.y-dy});
      });
    };
    const nearestScrollable = (target: EventTarget | null) => {
      let node = target instanceof Element ? target : null;
      while (node && node !== el) {
        const style = getComputedStyle(node);
        const overflowY = style.overflowY;
        const overflowX = style.overflowX;
        const scrollableY = (overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1;
        const scrollableX = (overflowX === "auto" || overflowX === "scroll") && node.scrollWidth > node.clientWidth + 1;
        if (scrollableY || scrollableX) return { node, scrollableY, scrollableX };
        node = node.parentElement;
      }
      return null;
    };
    const onWheel = (e: WheelEvent) => {
      const gesture=classifyWheelGesture({ctrlKey:e.ctrlKey,metaKey:e.metaKey,deltaMode:e.deltaMode,deltaX:e.deltaX,deltaY:e.deltaY,platform:navigator.platform});
      const isZoomKey=e.ctrlKey||e.metaKey;
      if (!isZoomKey) {
        const scroller = nearestScrollable(e.target);
        if (scroller) {
          const absY = Math.abs(e.deltaY), absX = Math.abs(e.deltaX);
          const dominantY = absY >= absX;
          const canScrollY = dominantY && scroller.scrollableY &&
            (e.deltaY > 0 ? scroller.node.scrollTop + scroller.node.clientHeight < scroller.node.scrollHeight - 1 : scroller.node.scrollTop > 1);
          const canScrollX = !dominantY && scroller.scrollableX &&
            (e.deltaX > 0 ? scroller.node.scrollLeft + scroller.node.clientWidth < scroller.node.scrollWidth - 1 : scroller.node.scrollLeft > 1);
          if (canScrollY || canScrollX) return;
        }
      }
      e.preventDefault();
      const store = useCanvas.getState();
      if (gesture === "pan") {
        queuePan(e.deltaX,e.deltaY);
        return;
      }
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      // 捏合用连续缩放，鼠标滚轮保持离散步进
      const factor = isZoomKey
        ? Math.exp(-e.deltaY * 0.015)
        : e.deltaY > 0 ? 0.9 : 1.1;
      const zoom = Math.max(0.25, Math.min(2, store.zoom * factor));
      if (zoom === store.zoom) return;
      const scale = zoom / store.zoom;
      store.setZoom(zoom);
      store.setPan({
        x: mx - (mx - store.pan.x) * scale,
        y: my - (my - store.pan.y) * scale,
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {el.removeEventListener("wheel", onWheel);if(panFrame)cancelAnimationFrame(panFrame);};
  }, []);
  const selectedSet = useMemo(() => new Set(s.selected), [s.selected]);
  const vectorNodes = useMemo(
    () =>
      s.nodes.filter(
        (item) =>
          s.selected.includes(item.id) &&
          ["rect", "ellipse", "polygon", "path"].includes(item.kind),
      ),
    [s.nodes, s.selected],
  );
  useEffect(()=>{
    let active=true;
    fetch(`/api/projects/${projectId}/scene`).then(r=>{if(r.status===401){requireLogin();return null}return r.json()}).then(data=>{
      if(!data||!active)return;
      if(data.project){
        setProjectName(data.project.name);setBg(data.project.background||"#f2f2f0");
        const viewport=data.viewport as {x?:unknown;y?:unknown;zoom?:unknown}|null;
        useCanvas.setState({nodes:data.scene?.nodes||[],edges:data.scene?.edges||[],selected:[],history:[],future:[],
          ...(typeof viewport?.x==="number"&&typeof viewport?.y==="number"?{pan:{x:viewport.x,y:viewport.y}}:{}),
          ...(typeof viewport?.zoom==="number"&&viewport.zoom>=0.25&&viewport.zoom<=2?{zoom:viewport.zoom}:{})});
        setSceneReady(true);
      }
      else if(data.demo)setSceneReady(true);
      else setLoadError(data.error||"项目加载失败");
    }).catch(()=>{if(active)setLoadError("项目加载失败")});
    return()=>{active=false};
  },[projectId]);
  // 镜头位置/缩放变化后防抖保存到服务器，下次打开恢复
  useEffect(()=>{
    if(!sceneReady)return;
    const timer=setTimeout(()=>{
      void fetch(`/api/projects/${projectId}/viewport`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({x:s.pan.x,y:s.pan.y,zoom:s.zoom})});
    },800);
    return()=>clearTimeout(timer);
  },[sceneReady,projectId,s.pan.x,s.pan.y,s.zoom]);
  const peerLocks = useMemo(() => {
    const map = new globalThis.Map<string, { by: string; color: string }>();
    for (const [id, peer] of Object.entries(peers))
      for (const nodeId of peer.selection || [])
        if (!map.has(nodeId)) map.set(nodeId, { by: peer.name, color: peerColor(id) });
    return map;
  }, [peers]);
  useEffect(()=>{
    if(!sceneReady||!collabSynced)return;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const unsub=useCanvas.subscribe((next,prev)=>{
      if(next.nodes===prev.nodes&&next.edges===prev.edges)return;
      clearTimeout(timer);
      timer=setTimeout(async()=>{
        try{const scene=useCanvas.getState();const response=await fetch(`/api/projects/${projectId}/scene`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({nodes:scene.nodes,edges:scene.edges})});if(response.status===401){requireLogin();return}const result=await response.json();if(!response.ok)throw new Error(result.error||"保存失败");setSaveError("");}catch(error){setSaveError(error instanceof Error?error.message:"保存失败");}
      },700);
    });
    return()=>{clearTimeout(timer);unsub()};
  },[projectId,sceneReady,collabSynced]);
  const loadMembers=useCallback(async()=>{
    try{
      const response=await fetch(`/api/projects/${projectId}/members`);
      if(response.status===401){requireLogin();return}
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"成员加载失败");
      setMembers(data.members||[]);
      setMe(current=>current||data.me||null);
    }catch{
      setMe(current=>current||{id:`guest-${Math.random().toString(36).slice(2,8)}`,role:"editor",name:"访客"});
    }
  },[projectId]);
  useEffect(()=>{Promise.resolve().then(loadMembers)},[loadMembers]);
  const removeMembers=async(ids:string[])=>{
    if(!ids.length||memberBusy)return;
    setMemberBusy(true);setMemberActionError("");
    try{
      const response=await fetch(`/api/projects/${projectId}/members`,{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify(ids.length===1?{userId:ids[0]}:{userIds:ids})});
      if(response.status===401){requireLogin();return}
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||"移除失败");
      setMembers(current=>current.filter(m=>!ids.includes(m.userId)));
      setCheckedMembers(current=>current.filter(id=>!ids.includes(id)));
    }catch(error){setMemberActionError(error instanceof Error?error.message:"移除失败")}
    finally{setMemberBusy(false)}
  };
  const submitRename=async()=>{
    const name=nameDraft.trim();
    setRenaming(false);
    if(!name||name===projectName)return;
    try{
      const response=await fetch(`/api/projects/${projectId}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({name})});
      if(response.status===401){requireLogin();return}
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"重命名失败");
      setProjectName(data.name);
      setVoiceProfiles(items=>items.map(item=>item.projectId===projectId?{...item,projectName:data.name}:item).sort((a,b)=>a.projectName.localeCompare(b.projectName,"zh-CN")||a.name.localeCompare(b.name,"zh-CN")));
    }catch(error){setSaveError(error instanceof Error?error.message:"重命名失败")}
  };
  const openHistory=async()=>{
    setMenu(false);setHistoryOpen(true);setHistoryError("");setHistoryBusy(true);
    try{
      const response=await fetch(`/api/projects/${projectId}/history`);
      if(response.status===401){requireLogin();return}
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"历史加载失败");
      setHistoryList(data.history||[]);
    }catch(error){setHistoryError(error instanceof Error?error.message:"历史加载失败")}
    finally{setHistoryBusy(false)}
  };
  const restoreHistory=async(version:number)=>{
    if(!window.confirm(`确定将画布恢复到版本 ${version} 吗？当前内容会被覆盖（恢复后会另存为新版本）。`))return;
    setHistoryError("");setHistoryBusy(true);
    try{
      const response=await fetch(`/api/projects/${projectId}/history?version=${version}`);
      if(response.status===401){requireLogin();return}
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"恢复失败");
      useCanvas.setState({nodes:data.scene?.nodes||[],edges:data.scene?.edges||[],selected:[],history:[],future:[]});
      setHistoryOpen(false);
    }catch(error){setHistoryError(error instanceof Error?error.message:"恢复失败")}
    finally{setHistoryBusy(false)}
  };
  useEffect(()=>{
    let active=true;
    fetch(`/api/projects/${projectId}/comments`).then(async response=>{if(response.status===401){requireLogin();return null}const data=await response.json();if(!response.ok)throw new Error(data.error||"评论加载失败");return data}).then(data=>{if(active&&data){useCanvas.getState().setComments(data.comments||[]);setCurrentUserId(data.userId);setCurrentUserRole(data.role)}}).catch(error=>{if(active)setCommentError(error instanceof Error?error.message:"评论加载失败")});
    return()=>{active=false};
  },[projectId]);
  const submitComment=useCallback(async()=>{
    if(!commentTarget||!commentText.trim()||commentBusy)return;
    setCommentBusy(true);setCommentError("");
    try{
      const isReply=Boolean(commentTarget.id);
      const url=isReply?`/api/projects/${projectId}/comments/${commentTarget.id}/replies`:`/api/projects/${projectId}/comments`;
      const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(isReply?{body:commentText.trim()}:{x:commentTarget.x,y:commentTarget.y,body:commentText.trim(),color:commentColor,objectId:commentTarget.objectId??null})});
      if(response.status===401){requireLogin();return}
      const data=await response.json();if(!response.ok)throw new Error(data.error||"评论保存失败");
      if(isReply){s.addReply(commentTarget.id!,data.reply);broadcastComment({action:"reply",commentId:commentTarget.id,reply:data.reply});}
      else{s.addComment(data.comment as CanvasComment);setCommentTarget({x:commentTarget.x,y:commentTarget.y,id:data.comment.id,objectId:commentTarget.objectId});broadcastComment({action:"add",comment:data.comment});}
      setCommentText("");
    }catch(error){setCommentError(error instanceof Error?error.message:"评论保存失败")}finally{setCommentBusy(false)}
  },[commentTarget,commentText,commentBusy,projectId,commentColor,s]);
  const deleteComment=useCallback(async(id:string)=>{
    if(commentBusy)return;setCommentBusy(true);setCommentError("");
    try{const response=await fetch(`/api/projects/${projectId}/comments/${id}`,{method:"DELETE"});if(response.status===401){requireLogin();return}const data=await response.json();if(!response.ok)throw new Error(data.error||"删除失败");s.removeComment(id);broadcastComment({action:"remove",id});setCommentTarget(null);setCommentText("");}catch(error){setCommentError(error instanceof Error?error.message:"删除失败")}finally{setCommentBusy(false)}
  },[commentBusy,projectId,s]);
  const nodeAtPoint=(x:number,y:number)=>{
    const hit=(n:CanvasNode)=>n.visible&&x>=n.x&&x<=n.x+n.width&&y>=n.y&&y<=n.y+n.height;
    return [...s.nodes].reverse().find(n=>n.kind!=="frame"&&hit(n))||[...s.nodes].reverse().find(n=>n.kind==="frame"&&hit(n))||null;
  };
  const commentAbs=(c:CanvasComment)=>{
    if(c.objectId){const node=s.nodes.find(n=>n.id===c.objectId);if(node)return{x:node.x+c.x,y:node.y+c.y};}
    return{x:c.x,y:c.y};
  };
  const persistCommentPosition=async(id:string,x:number,y:number,objectId:string|null)=>{
    try{const response=await fetch(`/api/projects/${projectId}/comments/${id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({x,y,objectId})});if(response.status===401){requireLogin();return}if(!response.ok){const data=await response.json();throw new Error(data.error||"位置保存失败")}broadcastComment({action:"move",id,x,y,objectId});}catch(error){setCommentError(error instanceof Error?error.message:"位置保存失败")}
  };
  const startCommentDrag=(e:React.PointerEvent,c:CanvasComment)=>{
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const abs=commentAbs(c);
    commentDrag.current={id:c.id,sx:e.clientX,sy:e.clientY,ox:abs.x,oy:abs.y,moved:false};
    setDraggingComment(c.id);
  };
  const moveCommentDrag=(e:React.PointerEvent)=>{
    const drag=commentDrag.current;
    if(!drag)return;
    e.stopPropagation();
    const dx=(e.clientX-drag.sx)/s.zoom,dy=(e.clientY-drag.sy)/s.zoom;
    if(Math.abs(dx)>3/s.zoom||Math.abs(dy)>3/s.zoom)drag.moved=true;
    if(drag.moved){
      const nx=drag.ox+dx,ny=drag.oy+dy,node=nodeAtPoint(nx,ny);
      if(node)s.moveComment(drag.id,nx-node.x,ny-node.y,node.id);
      else s.moveComment(drag.id,nx,ny,null);
      const now=e.timeStamp;
      if(now-(drag.lastSent||0)>40){
        drag.lastSent=now;
        const comment=useCanvas.getState().comments.find(item=>item.id===drag.id);
        if(comment)broadcastComment({action:"move",id:drag.id,x:comment.x,y:comment.y,objectId:comment.objectId??null});
      }
    }
  };
  const endCommentDrag=(e:React.PointerEvent)=>{
    const drag=commentDrag.current;
    if(!drag)return;
    e.stopPropagation();
    commentDrag.current=null;
    setDraggingComment(null);
    const comment=s.comments.find(item=>item.id===drag.id);
    if(drag.moved){if(comment)void persistCommentPosition(drag.id,comment.x,comment.y,comment.objectId??null);}
    else if(comment){setCommentTarget({x:comment.x,y:comment.y,id:comment.id,objectId:comment.objectId});setCommentText("");setCommentError("");}
  };
  const finishConnection = (to: string) => {
    const conn = connectingRef.current;
    const target = s.nodes.find((n) => n.id === to);
    if (conn && target && conn.id !== to) {
      if (conn.dir === "out" && GEN_KINDS.includes(target.kind)) s.addEdge(conn.id, to);
      if (conn.dir === "in" && GENERATION_INPUT_KINDS.includes(target.kind)) s.addEdge(to, conn.id);
    }
    connectingRef.current = null;
    setConnecting(null);
    setLinkPoint(null);
    setLinkMenu(null);
  };
  const invite=async()=>{setInviteError("");const response=await fetch(`/api/projects/${projectId}/invites`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:inviteEmail,role:"editor"})});if(response.status===401){requireLogin();return}const data=await response.json();if(!response.ok){setInviteError(data.error||"邀请失败");return}setInviteLink(data.url);};
  const startConnection = (id: string, e: React.PointerEvent, dir: "out" | "in" = "out") => {
    e.preventDefault(); e.stopPropagation();
    connectingRef.current = { id, dir }; setConnecting({ id, dir }); setLinkMenu(null);
    setLinkPoint({x:e.clientX,y:e.clientY});
  };
  const finishPen=(closed=false)=>{
    if(penPoints.length>=2){
      const normalized=normalizePenPath(penPoints);
      const id=s.addNode("path",normalized.x,normalized.y);
      s.updateNode(id,{name:"钢笔路径",width:normalized.width,height:normalized.height,pathViewWidth:normalized.width,pathViewHeight:normalized.height,pathPoints:normalized.points,pathClosed:closed,pathData:penPath(normalized.points,closed),fill:closed?"#ffffff":"transparent",stroke:"#252525"});
    }
    setPenPoints([]);setPenCursor(null);penDrag.current=null;penEditDrag.current=null;
    s.setTool("select");
  };
  const startPenEdit = (e: React.PointerEvent, index: number, part: "anchor" | "in" | "out") => {
    e.preventDefault(); e.stopPropagation();
    setPenCursor(null);
    const rect = document.querySelector<HTMLElement>(".canvas-grid")?.getBoundingClientRect();
    const sx = rect ? (e.clientX - rect.left - s.pan.x) / s.zoom : 0;
    const sy = rect ? (e.clientY - rect.top - s.pan.y) / s.zoom : 0;
    penEditDrag.current = { index, part, sx, sy, moved: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {if(connectingRef.current) setLinkPoint({x:e.clientX,y:e.clientY});};
    const up = (e: PointerEvent) => {
      const conn = connectingRef.current;
      if (!conn) return;
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId;
      const targetNode = target ? useCanvas.getState().nodes.find((n) => n.id === target) : null;
      const validTarget = targetNode && targetNode.id !== conn.id &&
        (conn.dir === "out" ? GEN_KINDS.includes(targetNode.kind) : GENERATION_INPUT_KINDS.includes(targetNode.kind));
      if (validTarget) {
        useCanvas.getState().addEdge(conn.dir === "out" ? conn.id : targetNode.id, conn.dir === "out" ? targetNode.id : conn.id);
      } else {
        setLinkMenu({ from: conn.id, dir: conn.dir, x: e.clientX, y: e.clientY });
        justConnectedRef.current = true;
        setTimeout(() => { justConnectedRef.current = false; }, 300);
      }
      connectingRef.current = null;
      setConnecting(null);
      setLinkPoint(null);
    };
    window.addEventListener("pointermove",move);window.addEventListener("pointerup",up);
    return()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);};
  },[]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const k = e.key?.toLowerCase?.() ?? "";
      if ((e.ctrlKey || e.metaKey) && k === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if ((e.ctrlKey || e.metaKey) && k === "d") {
        e.preventDefault();
        s.duplicate();
      } else if(s.tool==="pen"&&e.key==="Enter"){
        e.preventDefault();finishPen();
      } else if(s.tool==="pen"&&e.key==="Escape"){
        e.preventDefault();setPenPoints([]);setPenCursor(null);penDrag.current=null;penEditDrag.current=null;s.setTool("select");
      } else if(e.key==="Escape"&&addMenu){
        e.preventDefault();setAddMenu(null);
      }
      if (
        ["Delete", "Backspace"].includes(e.key || "") &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        const allowed = s.selected.filter((id) => !peerLocks.has(id));
        if (allowed.length < s.selected.length) s.setSelected(allowed);
        if (allowed.length) s.removeSelected();
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [s,penPoints,peerLocks,addMenu]);
  useEffect(() => {
    if (!addMenu) return;
    const close = (e: PointerEvent) => {
      const el = e.target as Element | null;
      if (el?.closest("[data-add-menu]")) return;
      setAddMenu(null);
    };
    // capture：节点/工具条的 React stopPropagation 会拦掉冒泡到 window 的原生事件
    const timer = window.setTimeout(() => addEventListener("pointerdown", close, true), 0);
    return () => { clearTimeout(timer); removeEventListener("pointerdown", close, true); };
  }, [addMenu]);
  useEffect(() => {
    if (!sceneReady || !me) return;
    const url =
      process.env.NEXT_PUBLIC_COLLABORATION_URL || "ws://localhost:8787";
    let ws: WebSocket | undefined;
    let projectVersion = 0;
    let inFlight = false;
    let synced = false;
    let syncTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let connectTimer: ReturnType<typeof setTimeout> | undefined;
    let pongTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectAttempt=0,disposed=false,hiddenAt=0;
    Promise.resolve().then(()=>{if(!disposed)setCollabSynced(false)});
    let activeScene: { nodes: CanvasNode[]; edges: CanvasEdge[] } | null =
      null;
    let applyingRemote = false;
    let queuedScene: { nodes: CanvasNode[]; edges: CanvasEdge[] } | null =
      null;
    // 场景快照合帧：快照是累积语义，积压时按顺序只应用到最新一帧（帧同步式加速追赶）
    let pendingSceneOps: { version: number; nodes: CanvasNode[]; edges: CanvasEdge[] }[] = [];
    let sceneFrame: number | undefined;
    const drainSceneOps = () => {
      sceneFrame = undefined;
      const latest = pendingSceneOps.at(-1);
      pendingSceneOps = [];
      if (!latest) return;
      projectVersion = latest.version;
      applyingRemote = true;
      useCanvas.setState({ nodes: latest.nodes, edges: latest.edges });
      applyingRemote = false;
    };
    const markSynced = () => {
      if (synced) return;
      synced = true;
      clearTimeout(syncTimer);
      setCollabSynced(true);
      flush();
    };
    const flush = () => {
      if (!synced || !ws || ws.readyState !== WebSocket.OPEN || inFlight || !queuedScene)
        return;
      const scene = queuedScene;
      queuedScene = null;
      activeScene = scene;
      inFlight = true;
      ws.send(
        JSON.stringify({
          type: "operation",
          operationId: crypto.randomUUID(),
          expectedVersion: projectVersion,
          command: { action: "scene", ...scene },
        }),
      );
    };
    // 发送端帧同步节拍：高频本地变更（拖动缩放/滑杆/连续输入）按 tick 合并，只发最新快照
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleFlush = () => {
      if (flushTimer) return;
      flushTimer = setTimeout(() => { flushTimer = undefined; flush(); }, 40);
    };
    let connect=()=>{};
    const clearPong=()=>{clearTimeout(pongTimer);pongTimer=undefined;};
    const ping=(socket:WebSocket)=>{
      if(socket.readyState!==WebSocket.OPEN)return;
      clearPong();
      socket.send(JSON.stringify({type:"ping",nonce:crypto.randomUUID()}));
      pongTimer=setTimeout(()=>{if(ws===socket)socket.close(4001,"heartbeat timeout");},4000);
    };
    const scheduleReconnect=()=>{
      if(disposed||reconnectTimer)return;
      const delay=Math.min(10_000,500*2**Math.min(reconnectAttempt++,5));
      reconnectTimer=setTimeout(()=>{reconnectTimer=undefined;connect();},delay);
    };
    connect=()=>{
      if(disposed||ws?.readyState===WebSocket.OPEN||ws?.readyState===WebSocket.CONNECTING)return;
      synced=false;clearTimeout(syncTimer);syncTimer=undefined;
      try {
      const socket = new WebSocket(`${url}?project=${projectId}&user=${encodeURIComponent(me.id)}&name=${encodeURIComponent(me.name)}`);
      ws=socket;wsRef.current=socket;commentBus=socket;
      connectTimer=setTimeout(()=>{if(ws===socket&&socket.readyState===WebSocket.CONNECTING)socket.close();},8000);
      socket.onopen = () => {clearTimeout(connectTimer);connectTimer=undefined;reconnectAttempt=0;ping(socket);};
      socket.onerror = () => {try{socket.close();}catch{}};
      socket.onclose = () => {
        if(ws!==socket)return;
        clearTimeout(connectTimer);connectTimer=undefined;clearPong();
        if(activeScene)queuedScene={nodes:useCanvas.getState().nodes,edges:useCanvas.getState().edges};
        activeScene=null;inFlight=false;synced=false;ws=undefined;
        wsRef.current=null;if(commentBus===socket)commentBus=null;
        setPeers({});setCollabSynced(true);scheduleReconnect();
      };
      socket.onmessage = (event) => {
        if(ws!==socket)return;
        const message = JSON.parse(String(event.data));
        if(message.type==="pong"){clearPong();return;}
        if (message.type === "ready") {
          projectVersion = message.version;
          if (!message.peers) markSynced();
          else syncTimer = setTimeout(markSynced, 3000);
        }
        if (message.type === "presence") {
          if (message.event === "roster")
            setPeers(Object.fromEntries(((message.users || []) as { id: string; name: string; selection?: string[] }[]).map((u) => [u.id, { name: u.name, selection: u.selection || [] }])));
          if (message.event === "join" && message.user?.id)
            setPeers((current) => ({ ...current, [message.user.id]: { name: message.user.name || "成员" } }));
          if (message.event === "leave")
            setPeers((current) => {
              const next = { ...current };
              delete next[message.user];
              return next;
            });
        }
        if (message.type === "selection" && message.user)
          setPeers((current) => current[message.user]
            ? { ...current, [message.user]: { ...current[message.user], selection: Array.isArray(message.nodes) ? message.nodes : [] } }
            : current);
        if (message.type === "comment") {
          const st = useCanvas.getState();
          if (message.action === "add" && message.comment && !st.comments.some((c) => c.id === message.comment.id)) st.addComment(message.comment);
          if (message.action === "remove" && message.id) st.removeComment(message.id);
          if (message.action === "move" && message.id) st.moveComment(message.id, message.x, message.y, message.objectId ?? null);
          if (message.action === "reply" && message.commentId && message.reply) st.addReply(message.commentId, message.reply);
        }
        if (message.type === "cursor" && message.user)
          setPeers((current) => ({
            ...current,
            [message.user]: { name: message.name || current[message.user]?.name || "成员", x: message.x, y: message.y },
          }));
        if (message.type === "sync-request" && ws?.readyState === WebSocket.OPEN) {
          const state = useCanvas.getState();
          ws.send(JSON.stringify({ type: "sync-response", to: message.from, version: projectVersion, nodes: state.nodes, edges: state.edges }));
        }
        if (message.type === "sync-response") {
          const localPending=queuedScene;
          projectVersion = message.version || projectVersion;
          pendingSceneOps = [];
          applyingRemote = true;
          useCanvas.setState({ nodes: message.nodes, edges: message.edges });
          applyingRemote = false;
          queuedScene = localPending;
          activeScene = null;
          inFlight = false;
          markSynced();
        }
        if (
          message.type === "operation" &&
          message.command?.action === "scene"
        ) {
          pendingSceneOps.push({ version: message.version, nodes: message.command.nodes, edges: message.command.edges });
          sceneFrame ??= requestAnimationFrame(drainSceneOps);
        }
        if (message.type === "ack") {
          projectVersion = message.version;
          inFlight = false;
          activeScene = null;
          scheduleFlush();
        }
        if (message.type === "conflict") {
          projectVersion = message.currentVersion;
          inFlight = false;
          queuedScene ??= activeScene;
          activeScene = null;
          flush();
        }
      };
    } catch {
      ws=undefined;setCollabSynced(true);scheduleReconnect();
    }
    };
    connect();
    const probeConnection=()=>{
      if(disposed)return;
      if(ws?.readyState===WebSocket.OPEN)ping(ws);
      else {if(ws?.readyState===WebSocket.CLOSING)ws=undefined;connect();}
    };
    const onVisibilityChange=()=>{
      if(document.visibilityState==="hidden"){hiddenAt=Date.now();return;}
      if(hiddenAt&&Date.now()-hiddenAt>5000&&ws?.readyState===WebSocket.OPEN)ws.close(4000,"page resumed");
      else probeConnection();
      hiddenAt=0;
    };
    const onOnline=()=>{if(ws?.readyState===WebSocket.OPEN)ws.close(4000,"network restored");else probeConnection();};
    document.addEventListener("visibilitychange",onVisibilityChange);
    window.addEventListener("focus",probeConnection);
    window.addEventListener("online",onOnline);
    const heartbeatTimer=setInterval(()=>{if(document.visibilityState==="visible"&&ws?.readyState===WebSocket.OPEN)ping(ws);},20_000);
    const unsubscribe = useCanvas.subscribe((next, previous) => {
      if (
        !applyingRemote &&
        (next.nodes !== previous.nodes || next.edges !== previous.edges)
      ) {
        queuedScene = { nodes: next.nodes, edges: next.edges };
        scheduleFlush();
      }
    });
    const unsubscribeSelection = useCanvas.subscribe((next, previous) => {
      if (next.selected === previous.selected) return;
      if (ws?.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "selection", nodes: next.selected }));
    });
    return () => {
      disposed=true;
      unsubscribe();
      unsubscribeSelection();
      clearTimeout(syncTimer);
      clearTimeout(flushTimer);
      clearTimeout(reconnectTimer);
      clearTimeout(connectTimer);
      clearTimeout(pongTimer);
      clearInterval(heartbeatTimer);
      document.removeEventListener("visibilitychange",onVisibilityChange);
      window.removeEventListener("focus",probeConnection);
      window.removeEventListener("online",onOnline);
      if (sceneFrame !== undefined) cancelAnimationFrame(sceneFrame);
      wsRef.current = null;
      commentBus = null;
      ws?.close();
    };
  }, [projectId, sceneReady, me]);
  const canvasClick = (e: React.MouseEvent) => {
    if (justConnectedRef.current || isMarqueeDraggingRef.current) return;
    if (s.tool === "pen") return;
    if (e.detail >= 2) return;
    if (isNodeKind(s.tool)) {
      const r = e.currentTarget.getBoundingClientRect();
      s.addNode(
        s.tool,
        (e.clientX - r.left - s.pan.x) / s.zoom,
        (e.clientY - r.top - s.pan.y) / s.zoom,
      );
    } else if (s.tool === "comment") {
      const r = e.currentTarget.getBoundingClientRect();
      const ax = (e.clientX - r.left - s.pan.x) / s.zoom, ay = (e.clientY - r.top - s.pan.y) / s.zoom;
      const node = nodeAtPoint(ax, ay);
      if (node) setCommentTarget({ x: ax - node.x, y: ay - node.y, objectId: node.id });
      else setCommentTarget({ x: ax, y: ay });
      setCommentText("");
      setCommentError("");
      s.setTool("select");
    } else {
      if (e.target instanceof Element && e.target.closest("[data-node-id]")) {
        setAddMenu(null);
        return;
      }
      s.setSelected([]);
      setLinkMenu(null);
      setContext(null);
      setAddMenu(null);
    }
  };
  const canvasDoubleClick = (e: React.MouseEvent) => {
    if (s.tool === "pen" || s.tool === "comment") return;
    if (e.target instanceof Element && e.target.closest("[data-node-id],button,input,textarea,select,label,[role='button'],.glass")) return;
    const r = e.currentTarget.getBoundingClientRect();
    const cx = (e.clientX - r.left - s.pan.x) / s.zoom;
    const cy = (e.clientY - r.top - s.pan.y) / s.zoom;
    setAddMenu({ x: e.clientX - r.left, y: e.clientY - r.top, cx, cy });
    s.setTool("select");
  };
  const panDown = (e: React.PointerEvent) => {
    if (s.tool === "pen" && e.button === 0) {
      if (e.target instanceof Element && e.target.closest("button,input,textarea,select,label,[role='button'],.glass,[data-node-id]")) return;
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left - s.pan.x) / s.zoom, y = (e.clientY - rect.top - s.pan.y) / s.zoom;
      if (penPoints.length > 2 && Math.hypot(x - penPoints[0].x, y - penPoints[0].y) < 12 / s.zoom) { finishPen(true); return; }
      if (e.detail >= 2 && penPoints.length >= 2) { finishPen(); return; }
      penDrag.current = penPoints.length;
      setPenPoints([...penPoints, { x, y, inX: x, inY: y, outX: x, outY: y }]);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    if (s.tool === "hand" || e.button === 1) {
      if (e.target instanceof Element && e.target.closest("button,input,textarea,select,label,[role='button'],.glass,[data-node-id]")) return;
      dragPan.current = {
        x: e.clientX,
        y: e.clientY,
        px: s.pan.x,
        py: s.pan.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    if (s.tool === "select" && e.button === 0) {
      if (e.target instanceof Element && e.target.closest("button,input,textarea,select,label,[role='button'],.glass,[data-node-id]")) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const startX = (e.clientX - rect.left - s.pan.x) / s.zoom;
      const startY = (e.clientY - rect.top - s.pan.y) / s.zoom;
      setMarquee({
        startX,
        startY,
        currentX: startX,
        currentY: startY,
        shiftKey: e.shiftKey,
        initialSelected: e.shiftKey ? [...s.selected] : [],
      });
      isMarqueeDraggingRef.current = false;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };
  const panMove = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (s.tool === "pen") {
      const x = (e.clientX - rect.left - s.pan.x) / s.zoom, y = (e.clientY - rect.top - s.pan.y) / s.zoom;
      const edit = penEditDrag.current;
      if (edit) {
        if (Math.hypot(x - edit.sx, y - edit.sy) > 3 / s.zoom) edit.moved = true;
        setPenPoints(current => current.map((p, i) => {
          if (i !== edit.index) return p;
          if (edit.part === "anchor") { const dx = x - p.x, dy = y - p.y; return { ...p, x, y, inX: p.inX + dx, inY: p.inY + dy, outX: p.outX + dx, outY: p.outY + dy }; }
          if (edit.part === "out") return { ...p, outX: x, outY: y, ...(e.altKey ? {} : { inX: 2 * p.x - x, inY: 2 * p.y - y }) };
          return { ...p, inX: x, inY: y, ...(e.altKey ? {} : { outX: 2 * p.x - x, outY: 2 * p.y - y }) };
        }));
      } else {
        setPenCursor({ x, y });
        if (penDrag.current !== null) { const idx = penDrag.current; setPenPoints(current => current.map((p, i) => i === idx ? { ...p, inX: 2 * p.x - x, inY: 2 * p.y - y, outX: x, outY: y } : p)); }
      }
    }
    lastCursorRef.current = {
      x: (e.clientX - rect.left - s.pan.x) / s.zoom,
      y: (e.clientY - rect.top - s.pan.y) / s.zoom,
    };
    if (!cursorTimerRef.current) {
      cursorTimerRef.current = setTimeout(() => {
        cursorTimerRef.current = null;
        const pos = lastCursorRef.current;
        if (pos && wsRef.current?.readyState === WebSocket.OPEN)
          wsRef.current.send(JSON.stringify({ type: "cursor", ...pos }));
      }, 40);
    }
    if (dragPan.current)
      s.setPan({
        x: dragPan.current.px + e.clientX - dragPan.current.x,
        y: dragPan.current.py + e.clientY - dragPan.current.y,
      });
    if (marquee) {
      const currentX = (e.clientX - rect.left - s.pan.x) / s.zoom;
      const currentY = (e.clientY - rect.top - s.pan.y) / s.zoom;
      if (!isMarqueeDraggingRef.current && Math.hypot(currentX - marquee.startX, currentY - marquee.startY) > 3) {
        isMarqueeDraggingRef.current = true;
      }
      setMarquee(prev => prev ? { ...prev, currentX, currentY } : null);
      if (isMarqueeDraggingRef.current) {
        const minX = Math.min(marquee.startX, currentX);
        const maxX = Math.max(marquee.startX, currentX);
        const minY = Math.min(marquee.startY, currentY);
        const maxY = Math.max(marquee.startY, currentY);
        const intersected = s.nodes.filter(n => {
          if (!n.visible || peerLocks.has(n.id)) return false;
          return n.x < maxX && n.x + n.width > minX && n.y < maxY && n.y + n.height > minY;
        }).map(n => n.id);
        const next = marquee.shiftKey
          ? Array.from(new Set([...marquee.initialSelected, ...intersected]))
          : intersected;
        s.setSelected(next);
      }
    }
  };
  const exportSvg = () => {
    const escape = (value: string) =>
      value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
    const shapes = s.nodes
      .filter((n) => n.visible)
      .map((n) => {
        const transform = `transform="rotate(${n.rotation} ${n.x + n.width / 2} ${n.y + n.height / 2})"`;
        if (n.kind === "ellipse")
          return `<ellipse cx="${n.x + n.width / 2}" cy="${n.y + n.height / 2}" rx="${n.width / 2}" ry="${n.height / 2}" fill="${n.fill}" stroke="${n.stroke}" ${transform}/>`;
        if (n.kind === "text")
          return `<text x="${n.x}" y="${n.y + 28}" font-size="24" fill="#181818" ${transform}>${escape(n.content || "")}</text>`;
        if (n.kind === "path")
          return `<path d="${escape(n.pathData || "")}" transform="translate(${n.x} ${n.y})" fill="${n.fill}" stroke="${n.stroke}"/>`;
        if (n.src)
          return `<image href="${escape(n.src)}" x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" preserveAspectRatio="xMidYMid slice" ${transform}/>`;
        return `<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="${n.kind === "frame" ? 0 : 10}" fill="${n.fill}" stroke="${n.stroke}" ${transform}/>`;
      })
      .join("");
    const blob = new Blob(
      [
        `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1200" viewBox="0 0 1800 1200">${shapes}</svg>`,
      ],
      { type: "image/svg+xml" },
    );
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "mini-canvas.svg";
    link.click();
    URL.revokeObjectURL(href);
  };
  return (
    <main className="flex h-screen min-w-0 overflow-hidden bg-white">
      <section className="relative flex min-w-0 flex-1 flex-col">
        <header className="relative z-50 flex h-14 shrink-0 items-center justify-between border-b border-(--line) bg-white px-4">
          <div className="flex items-center gap-2">
            <Link href="/" className="icon-btn !h-8 !w-8">
              <ArrowLeft size={16} />
            </Link>
            {renaming?(
              <input
                autoFocus
                aria-label="项目名称"
                className="field !h-8 !w-52 !py-1 text-sm font-semibold"
                value={nameDraft}
                onChange={(e)=>setNameDraft(e.target.value)}
                onBlur={()=>void submitRename()}
                onKeyDown={(e)=>{if(e.key==="Enter")void submitRename();if(e.key==="Escape")setRenaming(false);}}
              />
            ):(
            <button
              onClick={() => setMenu(!menu)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold hover:bg-(--bg)"
            >
              {projectName} <ChevronDown size={14} />
            </button>
            )}
            {menu && (
              <div className="absolute left-12 top-12 w-56 rounded-xl p-2 text-sm glass">
                <Link
                  href="/"
                  className="block rounded-lg px-3 py-2 hover:bg-(--bg)"
                >
                  主页
                </Link>
                <button
                  className="w-full rounded-lg px-3 py-2 text-left hover:bg-(--bg)"
                  onClick={()=>{setNameDraft(projectName);setRenaming(true);setMenu(false);}}
                >
                  重命名
                </button>
                <button className="w-full rounded-lg px-3 py-2 text-left hover:bg-(--bg)">
                  项目库
                </button>
                <hr className="my-1 border-(--accent-tint)" />
                <button className="w-full rounded-lg px-3 py-2 text-left hover:bg-(--bg)">
                  新建项目
                </button>
                <button
                  className="w-full rounded-lg px-3 py-2 text-left hover:bg-(--bg)"
                  onClick={()=>void openHistory()}
                >
                  画布历史
                </button>
                <button className="w-full rounded-lg px-3 py-2 text-left hover:bg-(--bg)">
                  导入图片
                </button>
              </div>
            )}
            {saveError&&<span role="status" className="max-w-48 truncate text-xs text-red-600" title={saveError}>{saveError}</span>}
          </div>
          {vectorNodes.length >= 2 && (
            <div className="flex items-center gap-1 rounded-xl border border-(--line) bg-(--bg) px-2 py-1 shadow-xs animate-in fade-in zoom-in-95 duration-150">
              <span className="mr-1 text-xs font-semibold text-(--muted)">布尔运算</span>
              <button
                title="并集 / 联集 (Union Selection)"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-(--ink) hover:bg-white hover:shadow-xs active:scale-95 transition"
                onClick={() => runBooleanOp(s, "unite")}
              >
                <UnionIcon size={15} />
              </button>
              <button
                title="减去顶层 / 差集 (Subtract Selection)"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-(--ink) hover:bg-white hover:shadow-xs active:scale-95 transition"
                onClick={() => runBooleanOp(s, "subtract")}
              >
                <SubtractIcon size={15} />
              </button>
              <button
                title="交集 (Intersect Selection)"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-(--ink) hover:bg-white hover:shadow-xs active:scale-95 transition"
                onClick={() => runBooleanOp(s, "intersect")}
              >
                <IntersectIcon size={15} />
              </button>
              <button
                title="排除重叠 / 差集异或 (Exclude Selection)"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-(--ink) hover:bg-white hover:shadow-xs active:scale-95 transition"
                onClick={() => runBooleanOp(s, "exclude")}
              >
                <ExcludeIcon size={15} />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                title="成员管理"
                className="flex items-center -space-x-1.5 rounded-full px-1 py-0.5 transition hover:bg-(--bg)"
                onClick={()=>{const open=!membersOpen;setMembersOpen(open);if(open)void loadMembers();}}
              >
                {me&&<AvatarBubble id={me.id} name={me.name} email={members.find(m=>m.userId===me.id)?.email} isMe online/>}
                {Object.entries(peers).slice(0,5).map(([id,peer])=>(
                  <AvatarBubble key={id} id={id} name={peer.name} email={members.find(m=>m.userId===id)?.email} online/>
                ))}
                {Object.keys(peers).length>5&&<span className="grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-(--bg) text-[10px] font-medium text-(--muted)">+{Object.keys(peers).length-5}</span>}
              </button>
              {membersOpen&&(
                <>
                  <div className="fixed inset-0 z-[90]" onClick={()=>setMembersOpen(false)}/>
                  <div className="absolute right-0 top-full z-[95] mt-2 w-80 rounded-2xl border border-(--line) bg-white p-4 text-sm shadow-xl">
                    <div className="flex items-center justify-between">
                      <b>成员管理（{members.length}）</b>
                      <button aria-label="关闭成员管理" className="icon-btn !h-7 !w-7" onClick={()=>setMembersOpen(false)}><X size={15}/></button>
                    </div>
                    <div className="mt-3 max-h-64 space-y-0.5 overflow-auto">
                      {members.map(m=>(
                        <div key={m.userId} className="flex items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-(--bg)">
                          {me?.role==="owner"&&m.role!=="owner"&&(
                            <input
                              type="checkbox"
                              aria-label={`选择成员 ${m.name}`}
                              className="h-3.5 w-3.5 shrink-0 accent-(--accent)"
                              checked={checkedMembers.includes(m.userId)}
                              onChange={(e)=>setCheckedMembers(current=>e.target.checked?[...current,m.userId]:current.filter(id=>id!==m.userId))}
                            />
                          )}
                          <span className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-white text-[11px] font-bold text-white shadow" style={{background:peerColor(m.userId)}}>
                            {m.name.slice(0,1)}
                            {peers[m.userId]&&<span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-green-500"/>}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium">{m.name}{m.userId===me?.id?"（我）":""}</span>
                            <span className="block truncate text-[10px] text-(--muted)">{m.email||"—"}</span>
                          </span>
                          <span className="shrink-0 text-[10px] text-(--muted)">{m.role==="owner"?"所有者":m.role==="editor"?"可编辑":"可评论"}</span>
                          {me?.role==="owner"&&m.role!=="owner"&&(
                            <button
                              disabled={memberBusy}
                              className="shrink-0 rounded-md border border-(--line) px-2 py-1 text-[10px] text-red-600 hover:bg-red-50 disabled:opacity-50"
                              onClick={()=>void removeMembers([m.userId])}
                            >移除</button>
                          )}
                        </div>
                      ))}
                    </div>
                    {me?.role==="owner"&&members.some(m=>m.role!=="owner")&&(
                      <div className="mt-3 flex items-center justify-between border-t border-(--line) pt-3">
                        <label className="flex items-center gap-1.5 text-[11px] text-(--muted)">
                          <input
                            type="checkbox"
                            aria-label="全选可移除成员"
                            className="h-3.5 w-3.5 accent-(--accent)"
                            checked={checkedMembers.length>0&&checkedMembers.length===members.filter(m=>m.role!=="owner").length}
                            onChange={(e)=>setCheckedMembers(e.target.checked?members.filter(m=>m.role!=="owner").map(m=>m.userId):[])}
                          />
                          已选 {checkedMembers.length} 人
                        </label>
                        <button
                          disabled={!checkedMembers.length||memberBusy}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-[11px] text-white disabled:opacity-40"
                          onClick={()=>void removeMembers(checkedMembers)}
                        >{memberBusy?"移除中…":`批量移除${checkedMembers.length?`（${checkedMembers.length}）`:""}`}</button>
                      </div>
                    )}
                    {memberActionError&&<p role="alert" className="mt-2 text-xs text-red-600">{memberActionError}</p>}
                  </div>
                </>
              )}
            </div>
            <button className="subtle-btn !py-2 text-xs" onClick={()=>{setInviteOpen(true);void loadMembers()}}>
              <Users size={14} className="mr-1 inline" />
              邀请协作
            </button>
            <ThemeToggle />
            {isAppAdmin&&<Link href="/admin" className="subtle-btn !py-2 text-xs"><Settings size={14} className="mr-1 inline"/>模型管理</Link>}
            <button title="导出 SVG" className="icon-btn" onClick={exportSvg}>
              <Download size={16} />
            </button>
          </div>
        </header>
        {inviteOpen&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30" onClick={()=>setInviteOpen(false)}><div className="w-96 rounded-2xl bg-white p-5 shadow-xl" onClick={e=>e.stopPropagation()}><div className="flex justify-between"><h2 className="font-semibold">邀请协作</h2><button onClick={()=>setInviteOpen(false)}><X size={18}/></button></div><p className="mt-2 text-xs text-(--muted)">输入协作者邮箱，生成有效期 7 天的邀请链接。</p><input type="email" className="field mt-4 w-full" placeholder="name@example.com" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)}/><button className="mt-3 rounded-lg bg-black px-4 py-2 text-sm text-white" onClick={invite}>创建邀请</button>{inviteError&&<p role="alert" className="mt-2 text-xs text-red-600">{inviteError}</p>}{inviteLink&&<div className="mt-3 flex gap-2"><input readOnly className="field min-w-0 flex-1 text-xs" value={inviteLink}/><button className="rounded-lg border px-2 text-xs" onClick={()=>navigator.clipboard.writeText(inviteLink)}>复制</button></div>}
        <p className="mt-4 border-t border-(--line) pt-3 text-[11px] text-(--muted)">管理已加入的成员（单个 / 批量移除），请点击右上角的头像。</p>
        </div></div>}
        {historyOpen&&(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30" onClick={()=>setHistoryOpen(false)}>
            <div className="w-[26rem] rounded-2xl bg-white p-5 shadow-xl" onClick={e=>e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">画布历史</h2>
                <button aria-label="关闭画布历史" onClick={()=>setHistoryOpen(false)}><X size={18}/></button>
              </div>
              <p className="mt-1 text-xs text-(--muted)">最近 50 个自动保存的版本，可恢复到任意版本（恢复会另存为新版本）。</p>
              {historyError&&<p role="alert" className="mt-2 text-xs text-red-600">{historyError}</p>}
              <div className="scrollbar mt-3 max-h-80 space-y-1 overflow-auto">
                {historyBusy&&!historyList.length&&<p className="py-6 text-center text-xs text-(--muted)">加载中…</p>}
                {!historyBusy&&!historyList.length&&!historyError&&<p className="py-6 text-center text-xs text-(--muted)">暂无历史版本</p>}
                {historyList.map((item,index)=>(
                  <div key={item.version} className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs hover:bg-(--bg)">
                    <span className="w-14 shrink-0 font-semibold">v{item.version}</span>
                    <span className="min-w-0 flex-1 truncate text-(--muted)">{item.author} · {new Date(item.createdAt).toLocaleString("zh-CN")}</span>
                    {index===0&&<span className="shrink-0 rounded bg-(--accent-tint) px-1.5 py-0.5 text-[10px] text-(--accent)">当前</span>}
                    <button
                      disabled={historyBusy}
                      className="shrink-0 rounded-md border border-(--line) px-2 py-1 text-[10px] hover:bg-white disabled:opacity-50"
                      onClick={()=>void restoreHistory(item.version)}
                    >恢复</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        <div
          ref={canvasSurfaceRef}
          className="relative min-h-0 flex-1 overflow-hidden canvas-grid"
          style={{ backgroundColor: bg }}
          onClick={canvasClick}
          onDoubleClick={canvasDoubleClick}
          onContextMenu={(e)=>{if(e.target===e.currentTarget){e.preventDefault();setContext({id:null,x:e.clientX,y:e.clientY});}}}
          onPointerDown={panDown}
          onPointerMove={panMove}
          onPointerUp={() => {
            dragPan.current = null;
            penDrag.current = null;
            const edit = penEditDrag.current;
            penEditDrag.current = null;
            if (s.tool === "pen" && edit && edit.part === "anchor" && edit.index === 0 && !edit.moved && penPoints.length > 2) finishPen(true);
            setMarquee(null);
            setTimeout(() => { isMarqueeDraggingRef.current = false; }, 50);
          }}
        >
          <div
            className="absolute left-0 top-0 h-[1200px] w-[1800px] origin-top-left"
            style={{
              transform: `translate(${s.pan.x}px,${s.pan.y}px) scale(${s.zoom})`,
            }}
          >
            <svg className="absolute inset-0 h-full w-full overflow-visible">
              {s.edges.map((e) => {
                const a = s.nodes.find((n) => n.id === e.from),
                  b = s.nodes.find((n) => n.id === e.to);
                if (!a || !b) return null;
                const active = selectedSet.has(a.id) || selectedSet.has(b.id);
                if (
                  (s.selected.length && !active) ||
                  (!s.connections && !active)
                )
                  return null;
                return (
                  <Curve
                    key={e.id}
                    from={a}
                    to={b}
                    active={active}
                    onDelete={() => s.removeEdge(e.id)}
                  />
                );
              })}
            </svg>
            {penPoints.length>0&&<svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"><path d={penPath(penPoints)} fill="none" stroke="var(--accent)" strokeWidth="2"/>{penCursor&&(()=>{const last=penPoints.at(-1)!;return <path d={`M ${last.x} ${last.y} C ${last.outX} ${last.outY} ${penCursor.x} ${penCursor.y} ${penCursor.x} ${penCursor.y}`} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="5 4"/>})()}{penPoints.map((p,i)=><g key={i}>{p.outX!==p.x||p.outY!==p.y?<><path d={`M ${p.inX} ${p.inY} L ${p.x} ${p.y} L ${p.outX} ${p.outY}`} fill="none" stroke="var(--accent)" strokeWidth="1"/><circle cx={p.inX} cy={p.inY} r="5" fill="white" stroke="var(--accent)" strokeWidth="1.5" style={{pointerEvents:"auto",cursor:"crosshair"}} onPointerDown={e=>startPenEdit(e,i,"in")}/><circle cx={p.outX} cy={p.outY} r="5" fill="white" stroke="var(--accent)" strokeWidth="1.5" style={{pointerEvents:"auto",cursor:"crosshair"}} onPointerDown={e=>startPenEdit(e,i,"out")}/></>:null}<circle cx={p.x} cy={p.y} r="6" fill="white" stroke="var(--accent)" strokeWidth="2" style={{pointerEvents:"auto",cursor:"move"}} onPointerDown={e=>startPenEdit(e,i,"anchor")}/></g>)}</svg>}
            {s.nodes.map((n) => (
              <NodeView
                key={n.id}
                node={n}
                projectId={projectId}
                modelCatalog={modelCatalog}
                voiceProfiles={voiceProfiles}
                onVoiceSaved={onVoiceSaved}
                onVoiceUsed={onVoiceUsed}
                onDoodle={n=>{setDoodleError("");setDoodleNode(n);}}
                connecting={connecting?.dir === "out" ? connecting.id : null}
                startConnection={startConnection}
                finishConnection={finishConnection}
                openContext={(id,x,y)=>setContext({id,x,y})}
                dropTarget={dropTarget}
                setDropTarget={setDropTarget}
                peerLock={peerLocks.get(n.id) || null}
              />
            ))}
            {s.comments.map((c) => {
                const color=c.color||"#ff7262";
                const preview=c.text.length>10?`${c.text.slice(0,10)}…`:c.text;
                const abs=commentAbs(c);
                return (
                <div
                  key={c.id}
                  className="group absolute z-20 flex items-start"
                  style={{ left: abs.x, top: abs.y }}
                  onPointerDown={e=>e.stopPropagation()}
                >
                  <button
                    aria-label={`查看评论：${c.text}`}
                    className="grid h-7 w-7 shrink-0 cursor-grab touch-none place-items-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow active:cursor-grabbing"
                    style={{ background: color }}
                    onPointerDown={e=>startCommentDrag(e,c)}
                    onPointerMove={moveCommentDrag}
                    onPointerUp={endCommentDrag}
                    onPointerCancel={endCommentDrag}
                  >
                    {c.avatar}
                  </button>
                  <span className="ml-1 mt-1 whitespace-nowrap rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{preview}</span>
                  <div className={`pointer-events-none absolute left-0 top-8 z-30 hidden w-64 rounded-xl border border-(--line) bg-white p-3 text-xs shadow-xl ${draggingComment===c.id?"":"group-hover:block"}`}>
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className="grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold text-white" style={{ background: color }}>{c.avatar}</span>
                      <b className="text-(--ink)">{c.author}</b>
                      <time className="ml-auto text-[10px] text-(--muted)">{new Date(c.createdAt).toLocaleString("zh-CN")}</time>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-(--ink)">{c.text}</p>
                  </div>
                </div>
                );
              })}
            {Object.entries(peers).map(([id, peer]) => (peer.x===undefined||peer.y===undefined?null:(
              <div
                key={id}
                className="pointer-events-none absolute z-50 flex items-start gap-1 text-xs font-medium"
                style={{ left: peer.x, top: peer.y }}
              >
                <MousePointer2 size={18} fill={peerColor(id)} color={peerColor(id)} />
                <span className="rounded px-1.5 py-0.5 text-white" style={{ background: peerColor(id) }}>
                  {peer.name.slice(0, 8)}
                </span>
              </div>
            )))}
          </div>
          {commentTarget&&(()=>{
            const selectedComment=commentTarget.id?s.comments.find(c=>c.id===commentTarget.id):null;
            const anchorNode=commentTarget.objectId?s.nodes.find(n=>n.id===commentTarget.objectId):null;
            const anchorX=anchorNode?anchorNode.x+commentTarget.x:commentTarget.x,anchorY=anchorNode?anchorNode.y+commentTarget.y:commentTarget.y;
            const rect=typeof document!=="undefined"?document.querySelector<HTMLElement>(".canvas-grid")?.getBoundingClientRect():null;
            const left=Math.max(12,Math.min(s.pan.x+(anchorX+34)*s.zoom,(rect?.width||1000)-336));
            const top=Math.max(12,Math.min(s.pan.y+anchorY*s.zoom,(rect?.height||700)-350));
            return <div className="absolute z-[90] w-80 max-w-[calc(100%-24px)] max-h-[min(440px,calc(100%-24px))] overflow-y-auto rounded-2xl border border-(--line) bg-white p-4 text-sm shadow-xl" style={{left,top}} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between"><strong>{selectedComment?"评论":"添加评论"}</strong><button aria-label="关闭评论" className="icon-btn !h-7 !w-7" onClick={()=>{setCommentTarget(null);setCommentText("");setCommentError("")}}><X size={15}/></button></div>
              {selectedComment&&<><div className="rounded-xl bg-(--bg) p-3"><div className="mb-1 flex items-center justify-between"><span className="font-medium">{selectedComment.author}</span><time className="text-xs text-(--muted)">{new Date(selectedComment.createdAt).toLocaleString("zh-CN")}</time></div><p className="whitespace-pre-wrap break-words">{selectedComment.text}</p></div>{selectedComment.replies.map(reply=><div key={reply.id} className="mt-2 border-l-2 border-(--accent-tint) pl-3"><div className="flex items-center justify-between"><span className="font-medium">{reply.author}</span><time className="text-xs text-(--muted)">{new Date(reply.createdAt).toLocaleString("zh-CN")}</time></div><p className="mt-1 whitespace-pre-wrap break-words">{reply.text}</p></div>)}</>}
              <textarea aria-label={selectedComment?"回复评论":"评论内容"} className="field mt-3 min-h-20 w-full resize-y" placeholder={selectedComment?"输入回复…":"输入评论…"} value={commentText} onChange={e=>setCommentText(e.target.value)} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){e.preventDefault();void submitComment()}}}/>
              {commentError&&<p role="alert" className="mt-2 text-xs text-red-600">{commentError}</p>}
              {!selectedComment&&(()=>{const parsed=parseColor(commentColor);return <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-xs text-(--muted)">颜色</span>{["#ff7262","#f5a623","#4a90d9","#7ed321","#bd10e0","#417505"].map(preset=><button key={preset} type="button" aria-label={`选择颜色 ${preset}`} className={`h-5 w-5 rounded-full border-2 ${parsed.color===preset?"border-(--ink) scale-110":"border-white"} shadow transition`} style={{background:preset}} onClick={()=>setCommentColor(withAlpha(preset,parsed.alpha))}/>)}<input type="color" aria-label="自定义颜色" className="h-6 w-8 cursor-pointer rounded border border-(--line) bg-white p-0.5" value={parsed.color} onChange={e=>setCommentColor(withAlpha(e.target.value,parsed.alpha===0?1:parsed.alpha))}/><input type="range" min={0} max={100} aria-label="颜色透明度" title="透明度" className="w-20" value={Math.round(parsed.alpha*100)} onChange={e=>setCommentColor(withAlpha(parsed.color,Number(e.target.value)/100))}/><span className="w-8 text-right text-[10px] text-(--muted)">{Math.round(parsed.alpha*100)}%</span></div>})()}
              <div className="mt-3 flex items-center justify-between">{selectedComment&&(selectedComment.authorId===currentUserId||currentUserRole==="owner"||currentUserRole==="editor")?<button disabled={commentBusy} className="text-xs text-red-600 disabled:opacity-50" onClick={()=>void deleteComment(selectedComment.id)}>删除评论</button>:<span/>}<button disabled={commentBusy||!commentText.trim()} className="rounded-lg bg-(--btn) px-4 py-2 text-xs text-white disabled:opacity-40" onClick={()=>void submitComment()}>{commentBusy?"请稍候":selectedComment?"回复":"发布评论"}</button></div>
            </div>;
          })()}
          {marquee && Math.hypot(marquee.currentX - marquee.startX, marquee.currentY - marquee.startY) > 3 && (() => {
            const left = Math.min(marquee.startX, marquee.currentX);
            const top = Math.min(marquee.startY, marquee.currentY);
            const width = Math.abs(marquee.currentX - marquee.startX);
            const height = Math.abs(marquee.currentY - marquee.startY);
            return (
              <div
                className="pointer-events-none absolute z-30 rounded-xs border border-(--accent) bg-(--accent)/15"
                style={{
                  left: left * s.zoom + s.pan.x,
                  top: top * s.zoom + s.pan.y,
                  width: width * s.zoom,
                  height: height * s.zoom,
                }}
              />
            );
          })()}
          {connecting && linkPoint && (()=>{const n=s.nodes.find(item=>item.id===connecting.id);const rect=document.querySelector<HTMLElement>(".canvas-grid")?.getBoundingClientRect();if(!n||!rect)return null;const cx=(linkPoint.x-rect.left-s.pan.x)/s.zoom,cy=(linkPoint.y-rect.top-s.pan.y)/s.zoom;const px=connecting.dir==="out"?n.x+n.width:n.x,py=n.y+n.height/2;const x1=connecting.dir==="out"?px:cx,y1=connecting.dir==="out"?py:cy,x2=connecting.dir==="out"?cx:px,y2=connecting.dir==="out"?cy:py;const c=Math.max(60,Math.abs(x2-x1)*0.45);return <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{zIndex:25}}><path d={`M ${x1*s.zoom+s.pan.x} ${y1*s.zoom+s.pan.y} C ${(x1+c)*s.zoom+s.pan.x} ${y1*s.zoom+s.pan.y}, ${(x2-c)*s.zoom+s.pan.x} ${y2*s.zoom+s.pan.y}, ${x2*s.zoom+s.pan.x} ${y2*s.zoom+s.pan.y}`} fill="none" stroke="var(--accent)" strokeWidth="2"/></svg>})()}
          {addMenu && (() => {
            const rect=document.querySelector<HTMLElement>(".canvas-grid")?.getBoundingClientRect();
            const menuW=280,menuH=320;
            const left=Math.max(12,Math.min(addMenu.x,(rect?.width||800)-menuW-12));
            const top=Math.max(12,Math.min(addMenu.y,(rect?.height||600)-menuH-12));
            const create=(kind:NodeKind)=>{s.addNode(kind,addMenu.cx,addMenu.cy);setAddMenu(null);};
            const groups:{title:string;items:{kind:NodeKind;label:string;desc:string;icon:React.ReactNode;tint:string;fg:string}[]}[]=[
              {title:"素材",items:[
                {kind:"image",label:"上传图片",desc:"本地图片素材",icon:<ImageIcon size={15}/>,tint:"#dbeafe",fg:"#2563eb"},
                {kind:"video",label:"上传视频",desc:"本地视频素材",icon:<Video size={15}/>,tint:"#d1fae5",fg:"#059669"},
                {kind:"audio",label:"上传音频",desc:"本地音频素材",icon:<AudioLines size={15}/>,tint:"#f3e8ff",fg:"#9333ea"},
              ]},
              {title:"AI 生成",items:[
                {kind:"scene",label:"场景生成",desc:"人物站位与镜头设计",icon:<Waypoints size={15}/>,tint:"#e0e7ff",fg:"#4f46e5"},
                {kind:"image-gen",label:"图片生成",desc:"文本生图",icon:<Sparkles size={15}/>,tint:"#ede9fe",fg:"#7c3aed"},
                {kind:"video-gen",label:"视频生成",desc:"文本生视频",icon:<Film size={15}/>,tint:"#fce7f3",fg:"#db2777"},
                {kind:"audio-gen",label:"音频生成",desc:"语音、音乐与 BGM",icon:<AudioLines size={15}/>,tint:"#f3e8ff",fg:"#9333ea"},
              ]},
              {title:"基础图形",items:[
                {kind:"rect",label:"矩形",desc:"",icon:<Square size={15}/>,tint:"#f1f5f9",fg:"#475569"},
                {kind:"ellipse",label:"椭圆",desc:"",icon:<Circle size={15}/>,tint:"#f1f5f9",fg:"#475569"},
                {kind:"polygon",label:"多边形",desc:"",icon:<Shapes size={15}/>,tint:"#f1f5f9",fg:"#475569"},
                {kind:"text",label:"文本",desc:"",icon:<Type size={15}/>,tint:"#f1f5f9",fg:"#475569"},
                {kind:"frame",label:"Frame",desc:"",icon:<Frame size={15}/>,tint:"#f1f5f9",fg:"#475569"},
              ]},
            ];
            return (
              <div
                role="menu"
                aria-label="添加节点"
                className="absolute z-[80] w-[280px] rounded-2xl border border-(--line) bg-white/95 p-3 shadow-2xl backdrop-blur-md"
                data-add-menu=""
                style={{left,top}}
                onPointerDown={e=>e.stopPropagation()}
                onClick={e=>e.stopPropagation()}
                onDoubleClick={e=>e.stopPropagation()}
              >
                <div className="mb-2 flex items-center justify-between border-b border-(--line) pb-2">
                  <h3 className="text-xs font-semibold text-(--ink)">添加节点</h3>
                  <button className="grid h-6 w-6 place-items-center rounded-full text-(--muted) hover:bg-(--bg) hover:text-(--ink)" onClick={()=>setAddMenu(null)} title="关闭">
                    <X size={13}/>
                  </button>
                </div>
                <div className="max-h-[280px] space-y-2 overflow-y-auto">
                  {groups.map(group=>(
                    <div key={group.title}>
                      <div className="mb-1 px-1 text-[10px] font-semibold text-(--muted)">{group.title}</div>
                      <div className="grid grid-cols-2 gap-1">
                        {group.items.map(item=>(
                          <button
                            key={item.kind}
                            role="menuitem"
                            className="group flex items-center gap-2 rounded-xl p-2 text-left transition hover:bg-(--bg)"
                            onClick={()=>create(item.kind)}
                          >
                            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg transition group-hover:scale-105" style={{background:item.tint,color:item.fg}}>
                              {item.icon}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-[11px] font-medium text-(--ink)">{item.label}</div>
                              {item.desc&&<div className="truncate text-[9px] text-(--muted)">{item.desc}</div>}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
          {linkMenu && (() => {
            const rect = typeof document !== "undefined" ? document.querySelector<HTMLElement>(".canvas-grid")?.getBoundingClientRect() : null;
            const left = Math.max(16, Math.min(linkMenu.x - (rect?.left || 0), (rect?.width || 800) - 270));
            const top = Math.max(16, Math.min(linkMenu.y - (rect?.top || 0), (rect?.height || 600) - 360));
            const fromNode = s.nodes.find((n) => n.id === linkMenu.from);
            const isInput = linkMenu.dir === "in";
            const targetWorkflowNodes = s.nodes.filter(
              (n) =>
                n.visible &&
                (isInput ? GENERATION_INPUT_KINDS : GEN_KINDS).includes(n.kind) &&
                n.id !== linkMenu.from &&
                !s.edges.some((e) => isInput ? (e.from === n.id && e.to === linkMenu.from) : (e.from === linkMenu.from && e.to === n.id))
            );
            const createAndConnect = (kind: NodeKind) => {
              const canvasX = Math.round((linkMenu.x - (rect?.left || 0) - s.pan.x) / s.zoom);
              const canvasY = Math.round((linkMenu.y - (rect?.top || 0) - s.pan.y) / s.zoom - 50);
              const newId = s.addNode(kind, canvasX, canvasY);
              s.addEdge(isInput ? newId : linkMenu.from, isInput ? linkMenu.from : newId);
              s.setSelected([newId]);
              setLinkMenu(null);
            };
            return (
              <div
                role="menu"
                aria-label={isInput ? "创建并连接输入节点" : "创建并连接节点"}
                className="absolute z-[80] w-64 rounded-2xl border border-(--line) bg-white/95 p-3 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
                style={{ left, top }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-2 flex items-center justify-between border-b border-(--line) pb-2">
                  <div>
                    <h3 className="text-xs font-semibold text-(--ink)">{isInput ? "创建并连接输入节点" : "创建并连接节点"}</h3>
                    <p className="max-w-[170px] truncate text-[10px] text-(--muted)">{isInput ? "目标" : "源"}: {fromNode?.name || "节点"}</p>
                  </div>
                  <button
                    className="grid h-6 w-6 place-items-center rounded-full text-(--muted) hover:bg-(--bg) hover:text-(--ink)"
                    onClick={() => setLinkMenu(null)}
                    title="关闭"
                  >
                    <X size={13} />
                  </button>
                </div>
                <div className="space-y-1">
                  {isInput ? (
                    <>
                      <button
                        className="group flex w-full items-center gap-2.5 rounded-xl p-2 text-left hover:bg-[#eff6ff] transition"
                        onClick={() => createAndConnect("image")}
                      >
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#dbeafe] text-[#2563eb] group-hover:scale-105 transition">
                          <ImageIcon size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-(--ink)">图片素材</div>
                          <div className="text-[10px] text-(--muted)">本地图片上传节点</div>
                        </div>
                      </button>
                      <button
                        className="group flex w-full items-center gap-2.5 rounded-xl p-2 text-left hover:bg-[#ecfdf5] transition"
                        onClick={() => createAndConnect("video")}
                      >
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#d1fae5] text-[#059669] group-hover:scale-105 transition">
                          <Video size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-(--ink)">视频素材</div>
                          <div className="text-[10px] text-(--muted)">本地视频上传节点</div>
                        </div>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="group flex w-full items-center gap-2.5 rounded-xl p-2 text-left hover:bg-[#f5f3ff] transition"
                        onClick={() => createAndConnect("image-gen")}
                      >
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#ede9fe] text-[#7c3aed] group-hover:scale-105 transition">
                          <Sparkles size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-(--ink)">AI 图片生成</div>
                          <div className="text-[10px] text-(--muted)">Seedream 5 · 文本生图</div>
                        </div>
                      </button>
                      <button
                        className="group flex w-full items-center gap-2.5 rounded-xl p-2 text-left hover:bg-[#fdf2f8] transition"
                        onClick={() => createAndConnect("video-gen")}
                      >
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#fce7f3] text-[#db2777] group-hover:scale-105 transition">
                          <Film size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-(--ink)">AI 视频生成</div>
                          <div className="text-[10px] text-(--muted)">Seedance 2.5 · 视频生成</div>
                        </div>
                      </button>
                      <button
                        className="group flex w-full items-center gap-2.5 rounded-xl p-2 text-left hover:bg-[#faf5ff] transition"
                        onClick={() => createAndConnect("audio-gen")}
                      >
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#f3e8ff] text-[#9333ea] group-hover:scale-105 transition">
                          <AudioLines size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-(--ink)">AI 音频生成</div>
                          <div className="text-[10px] text-(--muted)">语音、音乐与 BGM</div>
                        </div>
                      </button>
                    </>
                  )}
                </div>
                {targetWorkflowNodes.length > 0 && (
                  <div className="mt-2.5 border-t border-(--line) pt-2">
                    <div className="px-1 pb-1 text-[10px] font-medium text-(--muted)">{isInput ? "连接已有输入" : "连接到已有节点"}</div>
                    <div className="max-h-28 space-y-0.5 overflow-y-auto">
                      {targetWorkflowNodes.map((n) => (
                        <button
                          key={n.id}
                          className="flex w-full items-center gap-2 truncate rounded-lg px-2 py-1.5 text-left text-xs hover:bg-(--accent-tint) transition"
                          onClick={() => {
                            s.addEdge(isInput ? n.id : linkMenu.from, isInput ? linkMenu.from : n.id);
                            setLinkMenu(null);
                          }}
                        >
                          {n.kind.includes("video") ? (
                            <Film size={12} className="shrink-0 text-[#ec4899]" />
                          ) : n.kind.includes("audio") ? (
                            <AudioLines size={12} className="shrink-0 text-[#9333ea]" />
                          ) : (
                            <ImageIcon size={12} className="shrink-0 text-[#8b5cf6]" />
                          )}
                          <span className="truncate">{n.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          {s.tool==="pen"&&<div className="absolute left-1/2 top-4 z-40 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs shadow"><span>点击添加锚点，按住拖动拉出曲线手柄；可随时拖动锚点或手柄微调，Alt 独立调整；点首点闭合，Enter 完成</span><button className="font-semibold text-(--accent-strong)" onClick={e=>{e.stopPropagation();finishPen()}}>完成路径</button><button onClick={e=>{e.stopPropagation();setPenPoints([]);s.setTool("select")}}>取消</button></div>}
          {doodleNode?.src&&(
            <DoodleEditModal src={doodleNode.src} initialPrompt={doodleNode.kind==="image-gen"?doodleNode.content||"":""} fontSize={doodleFontSize} busy={doodleBusy} error={doodleError} onCreate={(blob,prompt)=>void createDoodleEdit(doodleNode,blob,prompt)} onClose={()=>{if(!doodleBusy)setDoodleNode(null);}}/>
          )}
          {context && context.id===null && (
            <div
              className="fixed z-[80] w-48 rounded-xl p-2 glass shadow-xl"
              style={{ left: context.x, top: context.y }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-(--accent-tint)"
                onClick={() => {
                  const updates=organizeMediaPositions(s.nodes);
                  if(updates)s.moveNodes(updates);
                  setContext(null);
                }}
              >
                <LayoutGrid size={14} /> 整理素材布局
              </button>
            </div>
          )}
          {context && context.id!==null && (
            <div
              className="fixed z-[80] w-44 rounded-xl p-2 glass shadow-xl"
              style={{ left: context.x, top: context.y }}
              onClick={(e) => e.stopPropagation()}
            >
              {[
                ["复制", () => s.duplicate()],
                ["锁定 / 解锁", () => s.toggleNode(context.id!, "locked")],
                ["删除", () => s.removeSelected()],
              ].map(([label, action]) => (
                <button
                  key={String(label)}
                  className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-(--accent-tint)"
                  onClick={() => {
                    (action as () => void)();
                    setContext(null);
                  }}
                >
                  {String(label)}
                </button>
              ))}
              {(()=>{const ctxNode=s.nodes.find(n=>n.id===context.id);if(!ctxNode||ctxNode.kind!=="text")return null;return (
                <button
                  className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-(--accent-tint)"
                  disabled={ctxNode.status==="running"}
                  onClick={()=>{void breakdownStoryboardNode(s,ctxNode,projectId,()=>{});setContext(null);}}
                >
                  拆解分镜
                </button>
              );})()}
              {(()=>{const ctxNode=s.nodes.find(n=>n.id===context.id);if(!ctxNode||!MEDIA_KINDS.includes(ctxNode.kind)||!ctxNode.src)return null;return (
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-(--accent-tint)"
                  onClick={()=>{void downloadNode(ctxNode);setContext(null);}}
                >
                  <Download size={14} /> 下载
                </button>
              );})()}
              {(()=>{const ctxNode=s.nodes.find(n=>n.id===context.id);if(!ctxNode||ctxNode.kind!=="image-gen"||!ctxNode.src)return null;return (
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-(--accent-tint)"
                  onClick={()=>{extractImageNode(s,ctxNode);setContext(null);}}
                >
                  <ImagePlus size={14} /> 转为独立图片节点
                </button>
              );})()}
              {(()=>{const ctxNode=s.nodes.find(n=>n.id===context.id);if(!ctxNode||!["image","image-gen"].includes(ctxNode.kind)||!ctxNode.src)return null;return (
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-(--accent-tint)"
                  onClick={()=>{setDoodleError("");setDoodleNode(ctxNode);setContext(null);}}
                >
                  <Brush size={14} /> 涂鸦编辑
                </button>
              );})()}
              {(()=>{const ctxNode=s.nodes.find(n=>n.id===context.id);if(!ctxNode||!ctxNode.kind.includes("video")||!ctxNode.src)return null;return (
                <>
                  <hr className="my-1 border-(--accent-tint)" />
                  <button
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-(--accent-tint)"
                    onClick={()=>{void extractAudioTrackNode(projectId,ctxNode,setSaveError);setContext(null);}}
                  >
                    <AudioLines size={14} /> 提取音轨为新节点
                  </button>
                  <div className="px-2 py-1 text-[10px] font-semibold text-(--muted)">提取视频帧</div>
                  {(["first","last","current"] as const).map(at=>(
                    <button
                      key={at}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-(--accent-tint)"
                      onClick={()=>{void extractVideoFrameNode(projectId,ctxNode,at,setSaveError);setContext(null);}}
                    >
                      <Camera size={14} /> 提取{FRAME_LABEL[at]}
                    </button>
                  ))}
                </>
              );})()}
              {(()=>{const ctxNode=s.nodes.find(n=>n.id===context.id);if(!ctxNode?.operands?.length)return null;return (
                <>
                  <hr className="my-1 border-(--accent-tint)" />
                  <button
                    className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-(--accent-tint)"
                    onClick={()=>{s.releaseBoolean(ctxNode.id);setContext(null);}}
                  >
                    解除布尔运算(还原原始图形)
                  </button>
                </>
              );})()}
              {vectorNodes.length >= 2 && (
                <>
                  <hr className="my-1 border-(--accent-tint)" />
                  <div className="px-2 py-1 text-[10px] font-semibold text-(--muted)">布尔运算</div>
                  <button
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-(--accent-tint)"
                    onClick={() => {
                      runBooleanOp(s, "unite");
                      setContext(null);
                    }}
                  >
                    <UnionIcon size={14} /> 并集 (Union)
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-(--accent-tint)"
                    onClick={() => {
                      runBooleanOp(s, "subtract");
                      setContext(null);
                    }}
                  >
                    <SubtractIcon size={14} /> 减去顶层 (Subtract)
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-(--accent-tint)"
                    onClick={() => {
                      runBooleanOp(s, "intersect");
                      setContext(null);
                    }}
                  >
                    <IntersectIcon size={14} /> 交集 (Intersect)
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-(--accent-tint)"
                    onClick={() => {
                      runBooleanOp(s, "exclude");
                      setContext(null);
                    }}
                  >
                    <ExcludeIcon size={14} /> 排除重叠 (Exclude)
                  </button>
                </>
              )}
            </div>
          )}
          <Inspector />
          {s.panel === "layers" && <LayersPanel />}
          {s.panel === "assets" && <AssetsPanel />}
          {s.panel === "voices" && <VoicesPanel voices={voiceProfiles} onRename={renameVoice} onDelete={deleteVoice} />}
          {s.panel === "minimap" && <MiniMap />}
          <div className="absolute bottom-5 left-5 z-30 flex items-center gap-1 rounded-xl p-1 glass" onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
            <button
              title="图层"
              className={`icon-btn ${s.panel === "layers" ? "active" : ""}`}
              onClick={() => s.setPanel(s.panel === "layers" ? null : "layers")}
            >
              <Layers3 size={17} />
            </button>
            <label title="背景颜色" className="icon-btn relative">
              <Palette size={17} />
              <input
                type="color"
                value={bg}
                onChange={(e) => setBg(e.target.value)}
                className="absolute inset-0 opacity-0"
              />
            </label>
            <button
              title="AI 资产"
              className={`icon-btn ${s.panel === "assets" ? "active" : ""}`}
              onClick={() => s.setPanel(s.panel === "assets" ? null : "assets")}
            >
              <ImageIcon size={17} />
            </button>
            <button
              title="音色管理"
              className={`icon-btn ${s.panel === "voices" ? "active" : ""}`}
              onClick={() => s.setPanel(s.panel === "voices" ? null : "voices")}
            >
              <Mic size={17} />
            </button>
            <button
              title="连线"
              className={`icon-btn ${s.connections ? "active" : ""}`}
              onClick={s.toggleConnections}
            >
              <Waypoints size={17} />
            </button>
            <button
              title="小地图"
              className={`icon-btn ${s.panel === "minimap" ? "active" : ""}`}
              onClick={() =>
                s.setPanel(s.panel === "minimap" ? null : "minimap")
              }
            >
              <Map size={17} />
            </button>
            <span className="px-2 text-xs text-(--muted)">
              {Math.round(s.zoom * 100)}%
            </span>
          </div>
          <div className="absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-2xl p-1.5 glass" onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
            {toolItems.map((t) => (
              <button
                key={t.id}
                title={t.label}
                className={`icon-btn ${s.tool === t.id ? "active" : ""}`}
                onClick={() => s.setTool(t.id)}
              >
                {t.icon}
              </button>
            ))}
            <span className="mx-1 h-6 w-px bg-(--line)" />
            <button title="撤销" className="icon-btn" onClick={s.undo}>
              <Undo2 size={17} />
            </button>
            <button title="重做" className="icon-btn" onClick={s.redo}>
              <Redo2 size={17} />
            </button>
          </div>
        </div>
        {!sceneReady&&(
          <div className="absolute inset-0 z-[85] grid place-items-center" style={{background:bg}}>
            {loadError
              ?<p role="alert" className="text-sm text-red-600">{loadError}</p>
              :<p className="text-sm text-(--muted)">正在加载画布…</p>}
          </div>
        )}
      </section>
      <Assistant projectId={projectId} />
    </main>
  );
}
