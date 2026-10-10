import { NextResponse } from "next/server";
import { z } from "zod";
import { canEditProject } from "@/lib/project-access";
import { chatCompletionText } from "@/lib/chat-completion";

const vector=z.tuple([z.number().finite().min(-100).max(100),z.number().finite().min(-100).max(100),z.number().finite().min(-100).max(100)]);
const entityBase=z.object({
  id:z.string().min(1).max(80),
  name:z.string().min(1).max(80),
  position:vector,
  rotation:vector,
  scale:z.tuple([z.number().positive().max(30),z.number().positive().max(30),z.number().positive().max(30)]),
  color:z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
const entity=z.discriminatedUnion("type",[
  entityBase.extend({type:z.enum(["character","box","sphere","cylinder"])}),
  entityBase.extend({type:z.literal("image"),imageUrl:z.url().optional(),imagePath:z.string().min(1).max(500),assetId:z.string().min(1).max(100),aspectRatio:z.number().positive().max(10)}),
]);
const sceneSchema=z.object({
  version:z.literal(1),
  background:z.string().regex(/^#[0-9a-fA-F]{6}$/),
  groundColor:z.string().regex(/^#[0-9a-fA-F]{6}$/),
  entities:z.array(entity).max(80),
  camera:z.object({position:vector,target:vector,fov:z.number().min(15).max(100)}),
});
const input=z.object({projectId:z.uuid(),prompt:z.string().trim().min(1).max(4000),scene:sceneSchema,image:z.string().max(8_000_000).regex(/^data:image\/(jpeg|png|webp);base64,/).nullable().optional()});

const extractJson=(text:string)=>{
  const cleaned=text.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"").trim();
  const start=cleaned.indexOf("{"),end=cleaned.lastIndexOf("}");
  if(start<0||end<=start)throw new Error("模型没有返回场景 JSON");
  return JSON.parse(cleaned.slice(start,end+1));
};

export async function POST(request:Request){
  const parsed=input.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"场景参数无效"},{status:400});
  if(!await canEditProject(parsed.data.projectId))return NextResponse.json({error:"无权编辑此项目"},{status:403});
  const apiKey=process.env.SEEDANCE_API_KEY;
  if(!apiKey)return NextResponse.json({error:"Seedance NZ 密钥未配置"},{status:503});
  try{
    const current=JSON.stringify(parsed.data.scene);
    const prompt=`用户要求：${parsed.data.prompt}\n\n当前 Three.js 场景 JSON：${current}\n\n请输出修改后的完整 JSON。人物使用 character；环境只使用 box、sphere、cylinder。已有 image 是用户上传的图片面片，只能调整其 name、position、rotation、scale，必须原样保留 id、imageUrl、imagePath、assetId、aspectRatio，不能自行新增 image。保持合理比例，人物脚底 y=0，站立人物通常高约 2 个单位。根据文字${parsed.data.image?"和参考图":""}推断空间位置、朝向、镜头位置和简单几何环境。所有 id 必须唯一；保留无需修改的已有对象。`;
    const text=await chatCompletionText({
      baseUrl:"https://api.seedance.nz/v1",
      apiKey,
      model:process.env.SEEDANCE_SCENE_MODEL||"zhenzhen/g5.6-luna",
      system:"你是 Three.js 场景布局程序。只返回一个 JSON 对象，不要 Markdown。结构必须严格为 {version:1,background:'#RRGGBB',groundColor:'#RRGGBB',entities:[{id,type,name,position:[x,y,z],rotation:[x,y,z],scale:[x,y,z],color:'#RRGGBB'}],camera:{position:[x,y,z],target:[x,y,z],fov:number}}。image 类型还必须保留 imageUrl、imagePath、assetId、aspectRatio。rotation 使用弧度。",
      prompt,
      imageDataUrl:parsed.data.image||undefined,
      maxTokens:5000,
    });
    const generated=sceneSchema.parse(extractJson(text));
    const existingImages=new Map(parsed.data.scene.entities.filter(item=>item.type==="image").map(item=>[item.id,item]));
    const entities:z.infer<typeof entity>[]=[];
    for(const item of generated.entities){
      if(item.type!=="image"){entities.push(item);continue;}
      const existing=existingImages.get(item.id);
      if(existing)entities.push({...item,...existing,name:item.name,position:item.position,rotation:item.rotation,scale:item.scale});
    }
    const scene={...generated,entities};
    return NextResponse.json({scene});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"AI 场景编辑失败"},{status:502});
  }
}
