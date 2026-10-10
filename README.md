# Mini Canvas

在线访问：[Mini Canvas](https://mini-canvas.mxdd52077.workers.dev)。

Mini Canvas 是一个面向 AI 图片、视频、音频与分镜创作的无限画布。项目使用 vinext 在 Cloudflare Workers 运行 Next.js / React 应用，D1 保存数据，R2 存放素材，Durable Objects 提供实时协作，并适配 Seedance NZ / 火山方舟生成接口。

## 功能

- 无限画布、缩放平移、图层、编组、矢量图形、钢笔路径与评论
- 图片、视频和音频上传，视频抽帧、音频截取与波形编辑
- 图片、视频、语音、音乐、BGM 等模型节点与异步任务轮询
- Midjourney 四宫格、放大、变体、重抽和扩图操作
- 个人音色库、语音克隆与跨项目音色选择
- Three.js 场景节点：预设人偶、几何体、图片面片、相机摆放、AI 场景编辑与镜头截图
- 多人光标、选区、画布快照同步、断线重连与心跳检测
- Seedance 模型目录和价格定时同步
- 项目成员、邀请、历史版本、积分和管理员模型开关

## 画布功能特性

### 自由布局与矢量编辑

- **无限工作区**：通过缩放和平移浏览画布，将脚本、参考素材、生成节点和创作结果放在同一个空间中。
- **元素操作**：支持框选、多选、拖动、缩放、旋转、复制、删除，以及撤销和重做。
- **图层与编组**：通过图层面板管理元素，调整层级、显示或隐藏、锁定或解锁；使用画框组织相关内容。
- **矢量与文字**：创建矩形、椭圆、多边形、文本和钢笔路径，编辑填充、描边、文字样式及路径锚点；支持图形布尔运算与还原。

### 多媒体素材与生成工作流

- **素材处理**：上传图片、视频和音频，在画布中预览；支持图片涂鸦编辑、视频抽帧为图片节点，以及音频波形编辑与截取。
- **节点连线**：将素材或生成结果连接到生成节点，作为后续任务的输入或参考，组织连续的创作流程。可用输入类型由具体模型决定。
- **AI 生成**：在图片、视频和音频生成节点中配置提示词、模型及适用参数，查看排队、生成中、完成或失败状态，并下载生成结果。
- **图片与声音扩展**：支持 Midjourney 四宫格及放大、变体、重抽、扩图操作；支持语音、音乐、BGM 生成，以及个人音色克隆与跨项目选择。

### 创作助手、分镜与 3D 场景

- **画布助手**：通过自然语言描述要创建或修改的内容，结合选中元素进行创作，并保留项目内的对话记录。
- **分镜拆解**：从文本脚本发起分镜规划，选择风格、比例和生成模型；编辑资产与镜头草稿，或通过反馈重新生成，确认后添加到画布。
- **3D 场景节点**：使用预设人偶、几何体和图片面片搭建场景，调整相机，通过 AI 编辑场景，并将镜头截图用于后续创作。

### 协作、保存与导出

- **实时协作**：展示在线成员、多人光标和选区，同步画布快照；协作服务提供心跳检测与断线重连。
- **画布评论**：在画布位置添加评论并回复，用于标记修改意见和讨论创作内容。
- **自动保存与历史恢复**：保存画布内容及视口位置，重新打开项目时恢复；可查看最近 50 个自动保存的版本，恢复操作会另存为新版本。
- **导出与下载**：支持 SVG 导出及媒体资源下载。当前 SVG 使用固定的 `1800 × 1200` 视口，媒体以资源链接引用，适合基础布局与矢量内容导出。

登录、云端保存、素材上传和历史记录由 Cloudflare 提供；AI 助手与生成能力需要对应模型服务密钥。

## 技术栈

| 部分 | 技术 |
| --- | --- |
| Web | Next.js 16 API、vinext、React 19、TypeScript、Tailwind CSS |
| 状态与 3D | Zustand、Three.js |
| 应用运行 | Cloudflare Workers |
| 数据与登录 | D1、服务端项目权限校验、HttpOnly 会话 Cookie |
| 素材 | R2 私有桶、限时签名地址 |
| 实时协作 | Durable Objects、WebSocket Hibernation |
| AI 助手 | Pi Agent Core、OpenAI 兼容对话接口 |

## 本地运行

需要 Node.js 22.19+、npm 10+。vinext 仍处于 beta 阶段。

```bash
git clone https://github.com/mxdd52077/mini-canvas.git
cd mini-canvas
npm ci
cp .env.example .dev.vars
```

在 `.dev.vars` 填入随机的 `ASSET_SIGNING_KEY`（至少 32 字节）和模型密钥。不要提交真实密钥。D1、R2 和 Durable Objects 在本地由 Workers 模拟器提供。

```bash
npm run db:local
npm run dev
```

打开 http://localhost:3001。也可以验证生产构建：

```bash
npm run build
npm start
npm run test:cloudflare
```

冒烟测试仅允许本地地址，会创建临时测试用户和项目。

## Cloudflare 部署

1. 执行 `npx wrangler login` 并在浏览器完成授权。
2. 在控制台启用 R2；创建数据库与素材桶：

```bash
npx wrangler d1 create mini-canvas
npx wrangler r2 bucket create mini-canvas-assets
```

3. 将 `wrangler.jsonc` 的 `account_id`、`database_id` 改为自己的值。已有资源可直接复用。
4. 执行 `npm run db:remote` 初始化数据库。
5. 将 `wrangler.jsonc` 的 `SITE_URL` 设置为实际 HTTPS 访问地址。
6. 写入服务端密钥并发布：

```bash
npx wrangler secret put ASSET_SIGNING_KEY
npx wrangler secret put SEEDANCE_API_KEY
npm run deploy
```

Web、API、素材访问与协作共用站点域名，无需额外 WebSocket 服务或 Supabase / Vercel 项目。R2 桶保持私有。

## 环境变量

唯一模板为 [`.env.example`](.env.example)，本地复制为 `.dev.vars`。生产密钥使用 `wrangler secret put`，普通配置写入 `wrangler.jsonc` 的 `vars`。

| 变量 | 用途 |
| --- | --- |
| `ASSET_SIGNING_KEY` | 素材签名密钥，必填 |
| `SITE_URL` | 站点公开地址，用于素材与邀请链接 |
| `SEEDANCE_API_KEY` | Seedance 图片、视频、音频、模型目录与默认助手 |
| `KIMI_API_KEY` | 可选；助手单独使用的 API Key，留空复用 Seedance Key |
| `KIMI_BASE_URL` | 助手接口地址，默认 `https://api.seedance.nz/v1` |
| `KIMI_MODEL_ID` | 助手模型，默认 `zhenzhen/g5.6-luna` |
| `SEEDANCE_SCENE_MODEL` | 3D 场景编辑模型 |
| `VOLCENGINE_API_KEY` / `VOLCENGINE_ENDPOINT` | 可选火山方舟直连配置 |

## 当前边界

- 邮箱密码注册、登录、退出和会话撤销已迁至 D1；没有配置邮件服务，暂不支持找回密码和自动邮箱验证。接受项目邀请需要已验证邮箱。
- 注册用户默认是普通用户，不会自动获得管理员权限；管理员需由数据库维护者指定。
- 素材上传上限为 90 MB；单次画布快照 JSON 上限为 900 KB。超限请求会显示错误。
- 旧版 Docker、独立协作服务和 `supabase/` SQL 保留作历史参考；当前 Cloudflare 运行路径不使用它们。
- 模型接口调用会消耗所配置服务账户的额度；生成能力需要有效模型密钥。

## 验证

```bash
npm run typecheck
npm run lint
npm test
npm run build
# 本地 Worker 启动后：
npm run test:cloudflare
```
