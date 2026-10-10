import test from"node:test";import assert from"node:assert/strict";import{nearbyFreePosition,wouldCreateCycle,organizeMediaPositions}from"../src/lib/graph";
test("rejects self, duplicate paths, and cycles",()=>{const edges=[{from:"a",to:"b"},{from:"b",to:"c"}];assert.equal(wouldCreateCycle(edges,"c","a"),true);assert.equal(wouldCreateCycle(edges,"a","a"),true);assert.equal(wouldCreateCycle(edges,"c","d"),false)});
test("places a generated node outside occupied bounds",()=>{const p=nearbyFreePosition([{x:0,y:0,width:200,height:200}],{x:0,y:0},{width:200,height:200});assert.ok(p.x>=228||p.y>=228||p.x<=-228||p.y<=-228)});
test("organizes media into image/audio/video regions with 4-column waterfall",()=>{
  const node=(id:string,kind:string,x:number,y:number,width:number,height:number,parentId?:string)=>({id,kind,x,y,width,height,parentId});
  const nodes=[node("i1","image",100,50,200,150),node("i2","image",400,90,200,300),node("a1","audio",900,60,260,120),node("v1","video",1300,80,320,180),node("t1","text",0,0,100,50),node("f1","image",10,10,200,100,"frame1")];
  const updates=organizeMediaPositions(nodes);
  assert.ok(updates);
  assert.equal(updates.has("t1"),false,"非媒体节点不整理");
  assert.equal(updates.has("f1"),false,"画框内子节点不整理");
  const i1=updates.get("i1")!,i2=updates.get("i2")!,a1=updates.get("a1")!,v1=updates.get("v1")!;
  assert.deepEqual([i1.x,i1.y],[100,50],"从素材包围盒左上角开始");
  assert.deepEqual([i2.x,i2.y],[100+200+24,50],"同区域依次放入最短列");
  assert.ok(a1.x>=100+4*200+3*24+120,"音频区域在图片区域右侧");
  assert.ok(v1.x>=a1.x+4*260+3*24+120,"视频区域在音频区域右侧");
  const tall=organizeMediaPositions([node("p1","image",0,0,200,100),node("p2","image",0,0,200,300),node("p3","image",0,0,200,200)])!;
  assert.equal(tall.get("p3")!.y,0,"第三张进第三列而非堆在第一列");
  assert.equal(tall.get("p3")!.x,2*(200+24));
});
