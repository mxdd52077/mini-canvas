export type SceneVector=[number,number,number];

export type SceneCharacter={
  id:string;
  type:"character";
  name:string;
  position:SceneVector;
  rotation:SceneVector;
  scale:SceneVector;
  color:string;
};

export type ScenePrimitive={
  id:string;
  type:"box"|"sphere"|"cylinder";
  name:string;
  position:SceneVector;
  rotation:SceneVector;
  scale:SceneVector;
  color:string;
};

export type SceneImagePlane={
  id:string;
  type:"image";
  name:string;
  position:SceneVector;
  rotation:SceneVector;
  scale:SceneVector;
  color:string;
  imageUrl?:string;
  imagePath:string;
  assetId:string;
  aspectRatio:number;
};

export type SceneEntity=SceneCharacter|ScenePrimitive|SceneImagePlane;

export type ThreeSceneData={
  version:1;
  background:string;
  groundColor:string;
  entities:SceneEntity[];
  camera:{position:SceneVector;target:SceneVector;fov:number};
};

const sceneId=()=>`scene_${Math.random().toString(36).slice(2,10)}`;

export const defaultThreeScene=():ThreeSceneData=>({
  version:1,
  background:"#dce8f3",
  groundColor:"#d9dde2",
  entities:[{
    id:sceneId(),type:"character",name:"角色 1",position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],color:"#9ca3af",
  }],
  camera:{position:[7,5,9],target:[0,1,0],fov:45},
});

export const newSceneEntity=(type:Exclude<SceneEntity["type"],"image">,index:number):SceneEntity=>({
  id:sceneId(),
  type,
  name:type==="character"?`角色 ${index}`:type==="box"?`方块 ${index}`:type==="sphere"?`球体 ${index}`:`圆柱 ${index}`,
  position:[(index-1)%4*1.5,0,Math.floor((index-1)/4)*1.5],
  rotation:[0,0,0],
  scale:[1,1,1],
  color:type==="character"?"#9ca3af":"#8b9dc3",
});
