import assert from "node:assert/strict";
import test from "node:test";
import { classifyWheelGesture } from "../src/lib/wheel-gesture";

test("Mac 触摸板纯垂直整数增量仍判定为平移",()=>{
  assert.equal(classifyWheelGesture({ctrlKey:false,metaKey:false,deltaMode:0,deltaX:0,deltaY:12,platform:"MacIntel"}),"pan");
});

test("触摸板捏合产生的 ctrl wheel 判定为缩放",()=>{
  assert.equal(classifyWheelGesture({ctrlKey:true,metaKey:false,deltaMode:0,deltaX:0,deltaY:.8,platform:"MacIntel"}),"zoom");
});

test("非 Mac 的传统滚轮大步进保持缩放",()=>{
  assert.equal(classifyWheelGesture({ctrlKey:false,metaKey:false,deltaMode:0,deltaX:0,deltaY:100,platform:"Win32"}),"zoom");
});
