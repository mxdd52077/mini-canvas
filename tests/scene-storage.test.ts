import assert from "node:assert/strict";
import test from "node:test";
import { hydrateSceneImageUrls,stripSceneImageUrls } from "../src/lib/scene-storage";

const node={id:"scene-node",sceneData:{version:1,entities:[{id:"plane",type:"image",imagePath:"project-1/background.png",imageUrl:"signed-old"},{id:"box",type:"box"}]}};

test("场景保存时移除图片面片的临时签名地址",()=>{
  const stripped=stripSceneImageUrls(node);
  const entities=(stripped.sceneData as {entities:Record<string,unknown>[]}).entities;
  assert.equal(entities[0].imageUrl,undefined);
  assert.equal(entities[0].imagePath,"project-1/background.png");
  assert.equal(entities[1].type,"box");
});

test("场景读取时重新签发图片面片地址",async()=>{
  const hydrated=await hydrateSceneImageUrls(stripSceneImageUrls(node),"project-1",async path=>`signed:${path}`);
  const entities=(hydrated.sceneData as {entities:Record<string,unknown>[]}).entities;
  assert.equal(entities[0].imageUrl,"signed:project-1/background.png");
});
