export type DirectedEdge={from:string;to:string};
export function wouldCreateCycle(edges:DirectedEdge[],from:string,to:string){if(from===to)return true;const seen=new Set<string>();const visit=(id:string):boolean=>{if(id===from)return true;if(seen.has(id))return false;seen.add(id);return edges.some(edge=>edge.from===id&&visit(edge.to))};return visit(to)}
export function nearbyFreePosition(rects:{x:number;y:number;width:number;height:number}[],origin:{x:number;y:number},size:{width:number;height:number},gap=28){const overlaps=(x:number,y:number)=>rects.some(r=>x<r.x+r.width+gap&&x+size.width+gap>r.x&&y<r.y+r.height+gap&&y+size.height+gap>r.y);for(let ring=0;ring<30;ring++)for(let side=0;side<8;side++){const angle=side*Math.PI/4,x=origin.x+Math.cos(angle)*ring*(size.width/2+gap),y=origin.y+Math.sin(angle)*ring*(size.height/2+gap);if(!overlaps(x,y))return{x,y}}return{x:origin.x+size.width+gap,y:origin.y}}
const ORGANIZE_GAP=24;
const ORGANIZE_REGION_GAP=120;
const ORGANIZE_COLS=4;
// 整理素材：图片/音频/视频从左到右三个区域，每区域 4 列瀑布流、相同间隔
export function organizeMediaPositions<T extends {id:string;kind:string;x:number;y:number;width:number;height:number;parentId?:string}>(nodes:T[]){
  const media=nodes.filter(n=>!n.parentId&&(n.kind.includes("image")||n.kind.includes("audio")||n.kind.includes("video")));
  if(!media.length)return null;
  const originX=Math.min(...media.map(n=>n.x)),originY=Math.min(...media.map(n=>n.y));
  const updates=new Map<string,{x:number;y:number}>();
  let regionX=originX;
  for(const kind of ["image","audio","video"]){
    const group=media.filter(n=>n.kind.includes(kind));
    if(!group.length)continue;
    const colWidth=Math.max(...group.map(n=>n.width));
    const colHeights=[0,0,0,0];
    for(const n of group){
      let col=0;
      for(let i=1;i<ORGANIZE_COLS;i++)if(colHeights[i]<colHeights[col])col=i;
      updates.set(n.id,{x:regionX+col*(colWidth+ORGANIZE_GAP),y:originY+colHeights[col]});
      colHeights[col]+=n.height+ORGANIZE_GAP;
    }
    regionX+=ORGANIZE_COLS*colWidth+(ORGANIZE_COLS-1)*ORGANIZE_GAP+ORGANIZE_REGION_GAP;
  }
  return updates;
}
