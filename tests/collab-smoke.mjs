import { spawn } from "node:child_process";
import WebSocket from "ws";

const PORT = 8900 + Math.floor(Math.random() * 500);
const server = spawn("npx", ["tsx", "server/collaboration.ts"], {
  env: { ...process.env, COLLABORATION_PORT: String(PORT) }, shell: true,
  stdio: "ignore",
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const nextMsg = (ws, pred, seen, label) =>
  new Promise((resolve, reject) => {
    const hit = seen.find(pred);
    if (hit) return resolve(hit);
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${label}; seen=${JSON.stringify(seen)}`)), 4000);
    ws.on("message", function on(raw) {
      const m = JSON.parse(String(raw));
      seen.push(m);
      if (pred(m)) {
        clearTimeout(timer);
        ws.off("message", on);
        resolve(m);
      }
    });
  });

try {
  await wait(1500);
  const seenA = [], seenB = [];
  const a = new WebSocket(`ws://localhost:${PORT}/?project=p1&user=u1&name=Alice`);
  a.on("message", (raw) => seenA.push(JSON.parse(String(raw))));
  const readyA = await nextMsg(a, (m) => m.type === "ready", seenA, "readyA");
  console.assert(readyA.peers === 0, "A should see 0 peers");

  const b = new WebSocket(`ws://localhost:${PORT}/?project=p1&user=u2&name=Bob`);
  b.on("message", (raw) => seenB.push(JSON.parse(String(raw))));
  const readyB = await nextMsg(b, (m) => m.type === "ready", seenB, "readyB");
  console.assert(readyB.peers === 1, `B should see 1 peer, got ${readyB.peers}`);
  const roster = await nextMsg(b, (m) => m.type === "presence" && m.event === "roster", seenB, "roster");
  console.assert(roster.users[0]?.id === "u1" && roster.users[0]?.name === "Alice", "roster should contain Alice");
  const join = await nextMsg(a, (m) => m.type === "presence" && m.event === "join", seenA, "join");
  console.assert(join.user?.id === "u2" && join.user?.name === "Bob", "A should see Bob join");
  const syncReq = await nextMsg(a, (m) => m.type === "sync-request", seenA, "sync-request");
  console.assert(syncReq.from === "u2", "sync-request should be for u2");

  a.send(JSON.stringify({ type: "sync-response", to: "u2", version: 3, nodes: [{ id: "n1" }], edges: [] }));
  const syncResp = await nextMsg(b, (m) => m.type === "sync-response", seenB, "sync-response");
  console.assert(syncResp.nodes?.[0]?.id === "n1" && syncResp.version === 3, "B should receive scene");

  b.send(JSON.stringify({ type: "cursor", x: 10, y: 20 }));
  const cursor = await nextMsg(a, (m) => m.type === "cursor", seenA, "cursor");
  console.assert(cursor.user === "u2" && cursor.name === "Bob" && cursor.x === 10, "cursor relay with identity");

  // operation version + broadcast
  b.send(JSON.stringify({ type: "operation", operationId: "op1", expectedVersion: 0, command: { action: "scene", nodes: [], edges: [] } }));
  const op = await nextMsg(a, (m) => m.type === "operation", seenA, "operation");
  console.assert(op.version === 1 && op.user === "u2", "operation broadcast");
  await nextMsg(b, (m) => m.type === "ack", seenB, "ack");

  // selection relay + roster persistence
  b.send(JSON.stringify({ type: "selection", nodes: ["n1", "n2"] }));
  const sel = await nextMsg(a, (m) => m.type === "selection", seenA, "selection");
  console.assert(sel.user === "u2" && sel.nodes?.length === 2, "selection relay with identity");

  const seenC = [];
  const c = new WebSocket(`ws://localhost:${PORT}/?project=p1&user=u3&name=Carol`);
  c.on("message", (raw) => seenC.push(JSON.parse(String(raw))));
  const rosterC = await nextMsg(c, (m) => m.type === "presence" && m.event === "roster", seenC, "rosterC");
  const bob = rosterC.users.find((u) => u.id === "u2");
  console.assert(bob?.selection?.length === 2, "roster should include Bob's selection");
  c.close();
  const leaveC = await nextMsg(a, (m) => m.type === "presence" && m.event === "leave" && m.user === "u3", seenA, "leaveC");
  console.assert(leaveC.user === "u3", "A should see Carol leave");

  // comment relay
  a.send(JSON.stringify({ type: "comment", action: "add", comment: { id: "c1", text: "hi" } }));
  const cm = await nextMsg(b, (m) => m.type === "comment", seenB, "comment");
  console.assert(cm.action === "add" && cm.comment?.id === "c1" && cm.user === "u1", "comment relay");

  b.close();
  const leave = await nextMsg(a, (m) => m.type === "presence" && m.event === "leave" && m.user === "u2", seenA, "leave");
  console.assert(leave.user === "u2", "A should see Bob leave");

  console.log("ALL COLLABORATION PROTOCOL CHECKS PASSED");
} finally {
  server.kill();
}
process.exit(0);
