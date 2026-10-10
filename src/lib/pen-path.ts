export type PenPoint={x:number;y:number;inX:number;inY:number;outX:number;outY:number};
const round=(value:number)=>Math.round(value*10)/10;
export function penPath(points:PenPoint[],closed=false){
  if(!points.length)return "";
  const commands=[`M ${round(points[0].x)} ${round(points[0].y)}`];
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    commands.push(`C ${round(a.outX)} ${round(a.outY)} ${round(b.inX)} ${round(b.inY)} ${round(b.x)} ${round(b.y)}`);
  }
  if(closed&&points.length>2){const a=points.at(-1)!,b=points[0];commands.push(`C ${round(a.outX)} ${round(a.outY)} ${round(b.inX)} ${round(b.inY)} ${round(b.x)} ${round(b.y)} Z`)}
  return commands.join(" ");
}
export function normalizePenPath(points:PenPoint[]){
  const xs=points.flatMap(p=>[p.x,p.inX,p.outX]),ys=points.flatMap(p=>[p.y,p.inY,p.outY]);
  const x=Math.min(...xs)-8,y=Math.min(...ys)-8,width=Math.max(40,Math.max(...xs)-x+8),height=Math.max(40,Math.max(...ys)-y+8);
  return {x,y,width,height,points:points.map(p=>({x:p.x-x,y:p.y-y,inX:p.inX-x,inY:p.inY-y,outX:p.outX-x,outY:p.outY-y}))};
}
