import{NextResponse}from"next/server";import{z}from"zod";import{canEditProject}from"@/lib/project-access";import{chatCompletionText}from"@/lib/chat-completion";
const input=z.object({projectId:z.uuid(),prompt:z.string().min(1).max(8000)});
export async function POST(req:Request){try{
  const data=input.parse(await req.json());
  if(!await canEditProject(data.projectId))return NextResponse.json({error:"无权编辑此项目"},{status:403});
  const apiKey=process.env.KIMI_API_KEY||process.env.SEEDANCE_API_KEY,baseUrl=process.env.KIMI_BASE_URL||"https://api.seedance.nz/v1",model=process.env.KIMI_MODEL_ID||"zhenzhen/g5.6-luna";
  if(!apiKey)return NextResponse.json({error:"文本生成尚未配置 API Key(KIMI_API_KEY 或 SEEDANCE_API_KEY)"},{status:503});
  const text=(await chatCompletionText({baseUrl,apiKey,model,system:"你是画布上的文本生成助手。根据用户的要求生成文本，直接输出结果内容，不要解释，不要用引号包裹。",prompt:data.prompt})).trim();
  if(!text)return NextResponse.json({error:"模型没有返回内容"},{status:502});
  return NextResponse.json({text});
}catch(error){
  if(error instanceof z.ZodError||error instanceof SyntaxError)return NextResponse.json({error:"请求参数无效"},{status:400});
  console.error("[text-generation]",error);
  return NextResponse.json({error:`模型服务连接失败，请重试(${error instanceof Error?error.message:"未知错误"})`},{status:502});
}}
