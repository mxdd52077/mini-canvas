"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import type { SceneEntity, SceneVector, ThreeSceneData } from "@/lib/scene-types";
import { newSceneEntity } from "@/lib/scene-types";

const cloneData=(value:ThreeSceneData):ThreeSceneData=>structuredClone(value);
const rad=(degrees:number)=>degrees*Math.PI/180;
const deg=(radians:number)=>Math.round(radians*180/Math.PI);

const labelSprite=(text:string,owner?:THREE.Object3D,top=2.45)=>{
  const display=text.trim().slice(0,18)||"未命名";
  const canvas=document.createElement("canvas");
  canvas.height=96;
  const measure=canvas.getContext("2d")!;measure.font="600 42px sans-serif";
  canvas.width=Math.ceil(Math.min(620,Math.max(116,measure.measureText(display).width+52)));
  const ctx=canvas.getContext("2d")!;
  ctx.fillStyle="rgba(55,65,81,.88)";ctx.roundRect(4,4,canvas.width-8,canvas.height-8,22);ctx.fill();
  ctx.fillStyle="#fff";ctx.font="600 42px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(display,canvas.width/2,canvas.height/2);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));
  const labelHeight=.48,labelWidth=labelHeight*canvas.width/canvas.height;
  const place=()=>{const sx=Math.max(.001,Math.abs(owner?.scale.x||1)),sy=Math.max(.001,Math.abs(owner?.scale.y||1));sprite.scale.set(labelWidth/sx,labelHeight/sy,1);sprite.position.set(0,top+.3/sy,0);};
  place();sprite.onBeforeRender=place;sprite.renderOrder=20;
  return sprite;
};

const material=(color:string)=>new THREE.MeshStandardMaterial({color,roughness:.72,metalness:.04});

const characterObject=(entity:SceneEntity)=>{
  const root=new THREE.Group(),mat=material(entity.color);
  const mesh=(geometry:THREE.BufferGeometry,position:SceneVector)=>{const item=new THREE.Mesh(geometry,mat);item.position.set(...position);item.castShadow=true;item.receiveShadow=true;root.add(item);};
  mesh(new THREE.CapsuleGeometry(.32,.72,5,10),[0,1.25,0]);
  mesh(new THREE.SphereGeometry(.27,20,14),[0,2.03,0]);
  mesh(new THREE.CapsuleGeometry(.11,.72,4,8),[-.48,1.24,0]);
  mesh(new THREE.CapsuleGeometry(.11,.72,4,8),[.48,1.24,0]);
  mesh(new THREE.CapsuleGeometry(.13,.82,4,8),[-.2,.44,0]);
  mesh(new THREE.CapsuleGeometry(.13,.82,4,8),[.2,.44,0]);
  const faceMaterial=new THREE.MeshStandardMaterial({color:"#111827",roughness:.65}),whiteMaterial=new THREE.MeshStandardMaterial({color:"#f8fafc",roughness:.7});
  for(const x of [-.1,.1]){
    const eye=new THREE.Mesh(new THREE.SphereGeometry(.06,12,8),whiteMaterial);eye.position.set(x,2.08,.245);root.add(eye);
    const pupil=new THREE.Mesh(new THREE.SphereGeometry(.027,10,6),faceMaterial);pupil.position.set(x,2.08,.296);root.add(pupil);
  }
  const nose=new THREE.Mesh(new THREE.ConeGeometry(.045,.13,12),faceMaterial);nose.position.set(0,2,.29);nose.rotation.x=Math.PI/2;root.add(nose);
  const chest=new THREE.Mesh(new THREE.CircleGeometry(.13,20),whiteMaterial);
  chest.position.set(0,1.43,.326);root.add(chest);
  const direction=new THREE.Mesh(new THREE.ConeGeometry(.065,.18,3),faceMaterial);direction.position.set(0,1.43,.337);direction.rotation.x=Math.PI/2;root.add(direction);
  root.add(labelSprite(entity.name,root));
  return root;
};

const entityObject=(entity:SceneEntity)=>{
  let root:THREE.Object3D;
  if(entity.type==="character")root=characterObject(entity);
  else if(entity.type==="image"){
    root=new THREE.Group();
    const geometry=new THREE.PlaneGeometry(Math.max(.1,entity.aspectRatio||1),1);
    const planeMaterial=new THREE.MeshStandardMaterial({color:entity.color,roughness:1,side:THREE.DoubleSide,transparent:true});
    const mesh=new THREE.Mesh(geometry,planeMaterial);mesh.receiveShadow=true;root.add(mesh);
    root.add(labelSprite(entity.name,root,.5));
    const imageUrl=entity.imageUrl;
    if(imageUrl)new THREE.TextureLoader().load(imageUrl,texture=>{
      if(!root.parent){texture.dispose();return;}
      texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
      planeMaterial.map=texture;planeMaterial.needsUpdate=true;
    },undefined,()=>{planeMaterial.color.set("#f1f5f9");});
  }
  else{
    const geometry=entity.type==="box"?new THREE.BoxGeometry(1,1,1):entity.type==="sphere"?new THREE.SphereGeometry(.55,24,16):new THREE.CylinderGeometry(.5,.5,1,24);
    const mesh=new THREE.Mesh(geometry,material(entity.color));mesh.position.y=.5;mesh.castShadow=true;mesh.receiveShadow=true;
    root=new THREE.Group();root.add(mesh);root.add(labelSprite(entity.name,root,1));
  }
  root.position.set(...entity.position);root.rotation.set(...entity.rotation);root.scale.set(...entity.scale);root.userData.entityId=entity.id;
  root.traverse(child=>{child.userData.entityId=entity.id;});
  return root;
};

const disposeObject=(object:THREE.Object3D)=>object.traverse(child=>{if(child instanceof THREE.Mesh){child.geometry.dispose();const mats=Array.isArray(child.material)?child.material:[child.material];mats.forEach(item=>{const mapped=item as THREE.Material&{map?:THREE.Texture|null};mapped.map?.dispose();item.dispose();});}if(child instanceof THREE.Sprite){child.material.map?.dispose();child.material.dispose();}});

const thumbnail=(source:HTMLCanvasElement)=>{
  const canvas=document.createElement("canvas");canvas.width=420;canvas.height=280;
  canvas.getContext("2d")!.drawImage(source,0,0,canvas.width,canvas.height);
  return canvas.toDataURL("image/jpeg",.72);
};

const imageDataUrl=async(file:File)=>{
  const bitmap=await createImageBitmap(file);
  const max=1280,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  canvas.getContext("2d")!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  return canvas.toDataURL("image/jpeg",.82);
};

export function ThreeSceneEditor({projectId,initial,onClose,onSave,onCapture,onUploadImage}:{
  projectId:string;
  initial:ThreeSceneData;
  onClose:()=>void;
  onSave:(data:ThreeSceneData,thumbnail:string)=>void;
  onCapture:(data:ThreeSceneData,blob:Blob)=>Promise<void>;
  onUploadImage:(file:File)=>Promise<{src:string;srcPath:string;assetId:string;aspectRatio:number}>;
}){
  const [data,setData]=useState(()=>cloneData(initial));
  const [selectedId,setSelectedId]=useState<string|null>(data.entities[0]?.id||null);
  const [mode,setMode]=useState<"translate"|"rotate"|"scale">("translate");
  const [prompt,setPrompt]=useState("");
  const [reference,setReference]=useState<string|null>(null);
  const [busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[error,setError]=useState("");
  const initialRef=useRef(data);
  const mountRef=useRef<HTMLDivElement|null>(null),rendererRef=useRef<THREE.WebGLRenderer|null>(null),sceneRef=useRef<THREE.Scene|null>(null),groundRef=useRef<THREE.Mesh|null>(null),cameraRef=useRef<THREE.PerspectiveCamera|null>(null),orbitRef=useRef<OrbitControls|null>(null),transformRef=useRef<TransformControls|null>(null),entityRootRef=useRef<THREE.Group|null>(null);
  const selected=data.entities.find(item=>item.id===selectedId)||null;
  const currentData=()=>{
    const next=cloneData(data),camera=cameraRef.current,orbit=orbitRef.current;
    if(camera&&orbit)next.camera={position:[camera.position.x,camera.position.y,camera.position.z],target:[orbit.target.x,orbit.target.y,orbit.target.z],fov:camera.fov};
    return next;
  };

  useEffect(()=>{
    const mount=mountRef.current;if(!mount)return;
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.domElement.style.cssText="display:block;width:100%;height:100%";mount.appendChild(renderer.domElement);rendererRef.current=renderer;
    const initialScene=initialRef.current;
    const scene=new THREE.Scene();scene.background=new THREE.Color(initialScene.background);sceneRef.current=scene;
    const camera=new THREE.PerspectiveCamera(initialScene.camera.fov,1,.05,500);camera.position.set(...initialScene.camera.position);cameraRef.current=camera;
    const orbit=new OrbitControls(camera,renderer.domElement);orbit.target.set(...initialScene.camera.target);orbit.enableDamping=true;orbitRef.current=orbit;
    scene.add(new THREE.HemisphereLight(0xffffff,0x667085,2.1));const sun=new THREE.DirectionalLight(0xffffff,2.8);sun.position.set(6,10,5);sun.castShadow=true;scene.add(sun);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshStandardMaterial({color:initialScene.groundColor,roughness:1}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;groundRef.current=ground;scene.add(ground,new THREE.GridHelper(40,40,0x64748b,0x94a3b8));
    const entityRoot=new THREE.Group();scene.add(entityRoot);entityRootRef.current=entityRoot;
    const transform=new TransformControls(camera,renderer.domElement);transform.setMode("translate");transform.addEventListener("dragging-changed",event=>{orbit.enabled=!event.value;});transform.addEventListener("mouseUp",()=>{const object=transform.object;if(!object)return;const id=String(object.userData.entityId||"");setData(current=>({...current,entities:current.entities.map(item=>item.id===id?{...item,position:[object.position.x,object.position.y,object.position.z],rotation:[object.rotation.x,object.rotation.y,object.rotation.z],scale:[object.scale.x,object.scale.y,object.scale.z]}:item)}));});scene.add(transform.getHelper());transformRef.current=transform;
    const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
    const pick=(event:PointerEvent)=>{if(transform.dragging)return;const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-((event.clientY-rect.top)/rect.height)*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(entityRoot.children,true)[0];setSelectedId(hit?String(hit.object.userData.entityId):null);};renderer.domElement.addEventListener("pointerdown",pick);
    const resize=()=>{const w=Math.max(1,mount.clientWidth),h=Math.max(1,mount.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/Math.max(1,h);camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(mount);resize();
    let frame=0;const animate=()=>{orbit.update();renderer.render(scene,camera);frame=requestAnimationFrame(animate)};animate();
    return()=>{cancelAnimationFrame(frame);observer.disconnect();renderer.domElement.removeEventListener("pointerdown",pick);transform.dispose();orbit.dispose();disposeObject(entityRoot);ground.geometry.dispose();(ground.material as THREE.Material).dispose();renderer.dispose();renderer.domElement.remove();};
  },[]);

  useEffect(()=>{transformRef.current?.setMode(mode);},[mode]);
  useEffect(()=>{const scene=sceneRef.current,ground=groundRef.current;if(scene)scene.background=new THREE.Color(data.background);if(ground)(ground.material as THREE.MeshStandardMaterial).color.set(data.groundColor);},[data.background,data.groundColor]);
  useEffect(()=>{const camera=cameraRef.current,orbit=orbitRef.current;if(!camera||!orbit)return;camera.position.set(...data.camera.position);camera.fov=data.camera.fov;camera.updateProjectionMatrix();orbit.target.set(...data.camera.target);orbit.update();},[data.camera]);
  useEffect(()=>{
    const root=entityRootRef.current,transform=transformRef.current;if(!root||!transform)return;
    transform.detach();for(const child of [...root.children]){root.remove(child);disposeObject(child);}
    for(const entity of data.entities)root.add(entityObject(entity));
    const selectedObject=root.children.find(item=>item.userData.entityId===selectedId);if(selectedObject)transform.attach(selectedObject);
  },[data.entities,selectedId]);

  const updateSelected=(patch:Partial<SceneEntity>)=>{if(!selectedId)return;setData(current=>({...current,entities:current.entities.map(item=>item.id===selectedId?{...item,...patch} as SceneEntity:item)}));};
  const updateVector=(key:"position"|"rotation"|"scale",index:number,value:number)=>{if(!selected)return;const vector=[...selected[key]] as SceneVector;vector[index]=key==="rotation"?rad(value):value;updateSelected({[key]:vector} as Partial<SceneEntity>);};
  const add=(type:Exclude<SceneEntity["type"],"image">)=>{const entity=newSceneEntity(type,data.entities.length+1);setData(current=>({...current,entities:[...current.entities,entity]}));setSelectedId(entity.id);};
  const addImage=async(file:File)=>{setUploading(true);setError("");try{const uploaded=await onUploadImage(file);const entity:SceneEntity={id:`scene_${crypto.randomUUID()}`,type:"image",name:file.name.replace(/\.[^.]+$/,"")||`图片 ${data.entities.length+1}`,position:[0,1.5,0],rotation:[0,0,0],scale:[3,3,1],color:"#ffffff",imageUrl:uploaded.src,imagePath:uploaded.srcPath,assetId:uploaded.assetId,aspectRatio:uploaded.aspectRatio};setData(current=>({...current,entities:[...current.entities,entity]}));setSelectedId(entity.id);}catch(value){setError(value instanceof Error?value.message:"图片上传失败");}finally{setUploading(false);}};
  const remove=()=>{if(!selectedId)return;setData(current=>({...current,entities:current.entities.filter(item=>item.id!==selectedId)}));setSelectedId(null);};
  const capture=async()=>{const renderer=rendererRef.current;if(!renderer)return;setBusy(true);setError("");try{const next=currentData();await new Promise<void>((resolve,reject)=>renderer.domElement.toBlob(blob=>blob?void onCapture(next,blob).then(resolve,reject):reject(new Error("截图失败")),"image/png"));}catch(value){setError(value instanceof Error?value.message:"截图失败");}finally{setBusy(false);}};
  const save=()=>{const renderer=rendererRef.current;if(!renderer)return;onSave(currentData(),thumbnail(renderer.domElement));};
  const aiEdit=async()=>{if(!prompt.trim()||busy)return;setBusy(true);setError("");try{const response=await fetch("/api/scene-generation",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({projectId,prompt,scene:currentData(),image:reference})});const result=await response.json();if(!response.ok)throw new Error(result.error||"AI 场景编辑失败");setData(result.scene);setSelectedId(result.scene.entities[0]?.id||null);}catch(value){setError(value instanceof Error?value.message:"AI 场景编辑失败");}finally{setBusy(false);}};
  const grouped=useMemo(()=>data.entities,[data.entities]);

  return <div className="fixed inset-0 z-[200] flex bg-black/55 p-2 sm:p-4 backdrop-blur-sm" onPointerDown={event=>event.stopPropagation()}>
    <div className="m-auto grid h-full max-h-[900px] w-full max-w-[1500px] min-h-0 min-w-0 grid-cols-2 grid-rows-[minmax(180px,1fr)_minmax(0,1fr)] overflow-hidden lg:grid-cols-[240px_minmax(0,1fr)_288px] lg:grid-rows-1 rounded-2xl bg-[#10141b] text-white shadow-2xl">
      <aside className="flex min-h-0 min-w-0 flex-col overflow-y-auto border-r border-white/10 bg-[#171c25] p-3">
        <div className="flex items-center justify-between"><b>场景对象</b><button className="rounded-lg px-2 py-1 text-white/60 hover:bg-white/10" onClick={onClose}>关闭</button></div>
        <div className="mt-3 grid grid-cols-2 gap-2"><button className="rounded-lg bg-violet-600 px-2 py-2 text-xs" onClick={()=>add("character")}>＋ 预设人偶</button><label className="flex cursor-pointer items-center justify-center rounded-lg bg-sky-600 px-2 py-2 text-xs"><span>{uploading?"上传中…":"＋ 图片面片"}</span><input type="file" accept="image/*" disabled={uploading} className="hidden" onChange={event=>{const file=event.target.files?.[0];if(file)void addImage(file);event.currentTarget.value="";}}/></label><button className="rounded-lg bg-white/10 px-2 py-2 text-xs" onClick={()=>add("box")}>＋ 方块</button><button className="rounded-lg bg-white/10 px-2 py-2 text-xs" onClick={()=>add("sphere")}>＋ 球体</button><button className="rounded-lg bg-white/10 px-2 py-2 text-xs" onClick={()=>add("cylinder")}>＋ 圆柱</button></div>
        <div className="mt-3 max-h-48 shrink-0 space-y-1 overflow-auto">{grouped.map(item=><button key={item.id} className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs ${item.id===selectedId?"bg-violet-600":"bg-white/5 hover:bg-white/10"}`} onClick={()=>setSelectedId(item.id)}><span>{item.type==="character"?"人":item.type==="image"?"▧":item.type==="box"?"□":item.type==="sphere"?"○":"▱"}</span><span className="truncate">{item.name}</span></button>)}</div>
        {selected&&<div className="mt-3 space-y-2 border-t border-white/10 pt-3 text-xs"><input aria-label="对象名称" className="w-full rounded-lg bg-white/10 px-3 py-2 outline-none focus:ring-1 focus:ring-violet-400" value={selected.name} onChange={event=>updateSelected({name:event.target.value})}/><label className="flex items-center justify-between">颜色<input type="color" value={selected.color} onChange={event=>updateSelected({color:event.target.value})}/></label>{(["position","rotation","scale"] as const).map(key=><div key={key}><span className="mb-1 block text-white/55">{key==="position"?"位置":key==="rotation"?"旋转（度）":"缩放"}</span><div className="grid grid-cols-3 gap-1">{[0,1,2].map(index=><input key={index} aria-label={`${key}-${index}`} type="number" step={key==="rotation"?5:.1} className="min-w-0 rounded bg-white/10 px-1.5 py-1" value={key==="rotation"?deg(selected[key][index]):Number(selected[key][index].toFixed(2))} onChange={event=>updateVector(key,index,Number(event.target.value))}/>)}</div></div>)}<button className="w-full rounded-lg bg-red-500/20 py-2 text-red-300" onClick={remove}>删除对象</button></div>}
      </aside>
      <section className="relative order-first col-span-2 min-h-0 min-w-0 overflow-hidden lg:order-none lg:col-span-1"><div ref={mountRef} className="absolute inset-0"/><div className="absolute left-3 top-3 flex gap-1 rounded-xl bg-black/55 p-1 backdrop-blur">{(["translate","rotate","scale"] as const).map(value=><button key={value} className={`rounded-lg px-3 py-1.5 text-xs ${mode===value?"bg-violet-600":"hover:bg-white/10"}`} onClick={()=>setMode(value)}>{value==="translate"?"移动":value==="rotate"?"旋转":"缩放"}</button>)}</div><div className="absolute bottom-3 left-3 right-3 w-fit rounded-lg bg-black/55 px-2 py-1 text-[10px] text-white/85">左键选择 · 拖动控件编辑 · 右键旋转镜头 · 滚轮缩放 · 所有对象名称显示在上方</div></section>
      <aside className="flex min-h-0 min-w-0 flex-col overflow-y-auto border-l border-white/10 bg-[#171c25] p-3"><b>AI 场景编辑</b><p className="mt-1 text-[11px] leading-4 text-white/55">描述人物站位、镜头和几何环境；可附参考图还原空间关系。</p><textarea className="mt-3 min-h-28 shrink-0 resize-y rounded-xl bg-white/10 p-3 text-xs outline-none focus:ring-1 focus:ring-violet-400" value={prompt} onChange={event=>setPrompt(event.target.value)} placeholder="例如：两个人面对面站立，左侧有一张长桌，镜头在人物腰部高度…"/><label className="mt-2 flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-white/25 p-3 text-xs text-white/65 hover:bg-white/5">{reference?"已添加参考图 · 点击替换":"＋ 添加空间参考图"}<input type="file" accept="image/*" className="hidden" onChange={event=>{const file=event.target.files?.[0];if(file)void imageDataUrl(file).then(setReference);event.currentTarget.value="";}}/></label>{reference&&<div className="relative mt-2 overflow-hidden rounded-xl"><Image src={reference} alt="场景参考" width={320} height={144} unoptimized className="max-h-36 w-full object-cover"/><button className="absolute right-2 top-2 rounded bg-black/60 px-2 py-1 text-[10px]" onClick={()=>setReference(null)}>移除</button></div>}<button disabled={busy||!prompt.trim()} className="mt-3 rounded-xl bg-violet-600 px-3 py-2.5 text-sm disabled:opacity-45" onClick={()=>void aiEdit()}>{busy?"正在编辑场景…":"用 AI 编辑场景"}</button>{error&&<p className="mt-2 text-xs text-red-300">{error}</p>}<div className="mt-auto grid gap-2 pt-4"><button disabled={busy} className="rounded-xl border border-white/15 px-3 py-2.5 text-sm hover:bg-white/5 disabled:opacity-45" onClick={()=>void capture()}>截取当前镜头为图片节点</button><button className="rounded-xl bg-white px-3 py-2.5 text-sm font-medium text-black" onClick={save}>保存场景</button></div></aside>
    </div>
  </div>;
}
