export type WheelGestureInput={
  ctrlKey:boolean;
  metaKey:boolean;
  deltaMode:number;
  deltaX:number;
  deltaY:number;
  platform:string;
};

export const classifyWheelGesture=(event:WheelGestureInput):"pan"|"zoom"=>{
  if(event.ctrlKey||event.metaKey)return "zoom";
  if(event.deltaMode!==0)return "zoom";
  const isApple=/Mac|iPhone|iPad|iPod/i.test(event.platform);
  const fineDelta=Math.abs(event.deltaX)>0||!Number.isInteger(event.deltaY)||Math.abs(event.deltaY)<40;
  return isApple||fineDelta?"pan":"zoom";
};
