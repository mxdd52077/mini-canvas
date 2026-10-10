type JsonObject=Record<string,unknown>;

const isObject=(value:unknown):value is JsonObject=>Boolean(value)&&typeof value==="object"&&!Array.isArray(value);

export const stripSceneImageUrls=(node:JsonObject):JsonObject=>{
  const sceneData=node.sceneData;
  if(!isObject(sceneData)||!Array.isArray(sceneData.entities))return node;
  return {...node,sceneData:{...sceneData,entities:sceneData.entities.map(entity=>isObject(entity)&&entity.type==="image"&&typeof entity.imagePath==="string"?{...entity,imageUrl:undefined}:entity)}};
};

export const hydrateSceneImageUrls=async(node:JsonObject,projectId:string,sign:(path:string)=>Promise<string|undefined>):Promise<JsonObject>=>{
  const sceneData=node.sceneData;
  if(!isObject(sceneData)||!Array.isArray(sceneData.entities))return node;
  const entities=await Promise.all(sceneData.entities.map(async entity=>{
    if(!isObject(entity)||entity.type!=="image"||typeof entity.imagePath!=="string"||!entity.imagePath.startsWith(`${projectId}/`))return entity;
    const imageUrl=await sign(entity.imagePath);
    return imageUrl?{...entity,imageUrl}:entity;
  }));
  return {...node,sceneData:{...sceneData,entities}};
};
