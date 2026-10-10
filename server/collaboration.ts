import { WebSocketServer, WebSocket } from "ws";

type Client = WebSocket & { project?: string; user?: string; name?: string; selection?: string[]; isAlive?: boolean };

const port = Number(process.env.COLLABORATION_PORT || 8787);
const wss = new WebSocketServer({ port });
const versions = new Map<string, number>();

const modelSyncUrl = process.env.MODEL_SYNC_URL;
const modelSyncKey = process.env.SUPABASE_SECRET_KEY;
const modelSyncInterval = Number(process.env.MODEL_SYNC_INTERVAL_MS || 86_400_000);

async function syncModels() {
  if (!modelSyncUrl || !modelSyncKey) return false;
  try {
    const response = await fetch(modelSyncUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${modelSyncKey}` },
      signal: AbortSignal.timeout(60_000),
    });
    const result = await response.text();
    if (!response.ok) throw new Error(`${response.status} ${result.slice(0, 300)}`);
    console.log(`[model-sync] ${result}`);
    return true;
  } catch (error) {
    console.error("[model-sync] failed", error);
    return false;
  }
}

if (modelSyncUrl && modelSyncKey) {
  const runModelSync = async () => {
    const succeeded = await syncModels();
    setTimeout(runModelSync, succeeded ? Math.max(modelSyncInterval, 60_000) : 300_000);
  };
  setTimeout(runModelSync, 15_000);
}

const send = (ws: WebSocket, data: unknown) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
};
const peers = (project: string, except?: WebSocket) =>
  [...(wss.clients as Set<Client>)].filter((c) => c !== except && c.project === project);
const broadcast = (project: string, data: unknown, except?: WebSocket) => {
  for (const client of peers(project, except)) send(client, data);
};

wss.on("connection", (ws: Client, req) => {
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
  const url = new URL(req.url || "/", "http://localhost");
  ws.project = url.searchParams.get("project") || "demo";
  ws.user = url.searchParams.get("user") || `guest-${Math.random().toString(36).slice(2, 6)}`;
  ws.name = url.searchParams.get("name") || "访客";

  const others = peers(ws.project, ws);
  send(ws, { type: "ready", version: versions.get(ws.project) || 0, peers: others.length });
  send(ws, {
    type: "presence",
    event: "roster",
    users: others.map((c) => ({ id: c.user, name: c.name, selection: c.selection || [] })),
  });
  // 已有协作者时，请最先连接的对端把实时画布同步给新加入者，
  // 避免新加入者把本地旧画布广播覆盖其他人。
  if (others.length) send(others[0], { type: "sync-request", from: ws.user });
  broadcast(ws.project, { type: "presence", event: "join", user: { id: ws.user, name: ws.name } }, ws);

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(String(raw));
      if (msg.type === "ping") return send(ws, { type: "pong", nonce: msg.nonce });
      if (msg.type === "cursor")
        return broadcast(ws.project!, { ...msg, user: ws.user, name: ws.name }, ws);
      if (msg.type === "selection") {
        ws.selection = Array.isArray(msg.nodes) ? msg.nodes.filter((id: unknown) => typeof id === "string") : [];
        return broadcast(ws.project!, { ...msg, user: ws.user, name: ws.name }, ws);
      }
      if (msg.type === "comment")
        return broadcast(ws.project!, { ...msg, user: ws.user }, ws);
      if (msg.type === "sync-response" && msg.to) {
        const target = peers(ws.project!).find((c) => c.user === msg.to);
        if (target)
          send(target, { type: "sync-response", version: msg.version, nodes: msg.nodes, edges: msg.edges });
        return;
      }
      if (msg.type === "operation") {
        const current = versions.get(ws.project!) || 0;
        if (msg.expectedVersion !== current)
          return send(ws, { type: "conflict", currentVersion: current, operationId: msg.operationId });
        const version = current + 1;
        versions.set(ws.project!, version);
        broadcast(ws.project!, { ...msg, type: "operation", version, user: ws.user });
        send(ws, { type: "ack", version, operationId: msg.operationId });
      }
    } catch {
      send(ws, { type: "error", message: "消息格式无效" });
    }
  });

  ws.on("close", () => {
    // 同一用户可能开了多个标签页，全部断开后才广播离开
    if (!peers(ws.project!, ws).some((c) => c.user === ws.user))
      broadcast(ws.project!, { type: "presence", event: "leave", user: ws.user });
  });
});

const heartbeat=setInterval(()=>{
  for(const ws of wss.clients as Set<Client>){
    if(ws.isAlive===false){ws.terminate();continue;}
    ws.isAlive=false;ws.ping();
  }
},30_000);
wss.on("close",()=>clearInterval(heartbeat));

console.log(`[collaboration] ws://localhost:${port}`);
