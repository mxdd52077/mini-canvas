# Mini Canvas

Mini Canvas 是一个面向 AI 图片、视频、音频与分镜创作的无限画布。项目包含 Next.js Web 应用、Supabase 数据层、独立 WebSocket 协作服务，以及 Seedance NZ / 火山方舟生成接口适配。

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

登录、云端保存、素材上传和历史记录依赖 Supabase；多人实时协作需要 WebSocket 服务；AI 助手与生成能力需要对应模型服务配置，实际可用模型和参数以模型目录为准。

## 技术栈

| 部分 | 技术 |
| --- | --- |
| Web | Next.js 16、React 19、TypeScript、Tailwind CSS |
| 状态 | Zustand |
| 数据与认证 | Supabase Auth、Postgres、Storage、RLS |
| 实时协作 | Node.js、`ws` WebSocket 服务 |
| 3D 场景 | Three.js |
| AI 助手 | Pi Agent Core、OpenAI 兼容对话接口 |
| 部署 | Docker Compose；可选完整自托管 Supabase |

## 运行要求

- Node.js 22.19 或更高版本
- npm 10 或更高版本
- 可选：Docker Desktop / Docker Engine 与 Compose v2
- 可选：Supabase 项目
- 可选：Seedance NZ 或火山方舟 API Key

## 快速开始

```bash
git clone <YOUR_REPOSITORY_URL>
cd mini-canvas
npm install
```

复制唯一的环境变量模板：

```bash
# macOS / Linux
cp .env.example .env.local

# Windows PowerShell
Copy-Item .env.example .env.local
```

不配置 Supabase 和模型密钥也可以启动演示界面；登录、持久化、上传和 AI 生成需要对应服务。

```bash
npm run dev
```

打开 <http://localhost:3000>。开发命令会同时启动：

- Next.js：`http://localhost:3000`
- 协作服务：`ws://localhost:8787`

## 环境变量

仓库只提供一个 [`.env.example`](.env.example)。真实配置请写入 `.env.local` 或 `.env`；这两个文件已被 Git 忽略。

### Supabase

| 变量 | 用途 | 是否必填 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 浏览器可访问的 Supabase Project URL | 使用登录和持久化时必填 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 浏览器 Publishable Key；受 RLS 约束 | 使用 Supabase 时必填 |
| `SUPABASE_SECRET_KEY` | 服务端 Secret Key；可绕过 RLS | 邀请、模型同步等服务端功能必填 |
| `SUPABASE_INTERNAL_URL` | 服务端访问 Supabase 的内网 URL | Docker 自托管时使用 |

获取方法：

1. 在 [Supabase Dashboard](https://supabase.com/dashboard) 创建项目。
2. 打开项目的 **Connect** 对话框，复制 Project URL 与 Publishable Key。
3. 在 **Settings → API Keys** 创建或复制 Secret Key。
4. Publishable Key 可以进入浏览器包；Secret Key 只能放在服务端环境变量中。详见 [Supabase API Keys 文档](https://supabase.com/docs/guides/getting-started/api-keys)。

### Seedance NZ

| 变量 | 用途 | 默认值 |
| --- | --- | --- |
| `SEEDANCE_API_KEY` | 图片、视频、音频、音乐、Midjourney、模型目录同步 | 无 |
| `KIMI_BASE_URL` | 画布助手、文本生成与分镜接口地址 | `https://api.seedance.nz/v1` |
| `KIMI_API_KEY` | OpenAI 兼容对话 Key；留空时复用 `SEEDANCE_API_KEY` | 空 |
| `KIMI_MODEL_ID` | 画布助手与文本生成模型 | `zhenzhen/g5.6-luna` |
| `SEEDANCE_SCENE_MODEL` | Three.js 场景自然语言编辑模型 | `zhenzhen/g5.6-luna` |

获取方法：

1. 登录 [Seedance NZ API 令牌页面](https://api.seedance.nz/keys)。
2. 新建令牌并复制 API Key 到 `SEEDANCE_API_KEY`。
3. 接口使用 Bearer Token，完整模型、参数与计费说明见 [Seedance NZ API 文档](https://api.seedance.nz/docs/)。

API Key 代表账户调用额度，请勿加入 `NEXT_PUBLIC_` 前缀，也不要提交到仓库。

### 火山方舟（可选）

| 变量 | 用途 |
| --- | --- |
| `VOLCENGINE_API_KEY` | 火山方舟服务端鉴权 Key |
| `VOLCENGINE_ENDPOINT` | 当前模型对应的完整提交接口地址 |

在 [火山方舟 API Key 管理](https://docs.volcengine.com/docs/ark/api-key?lang=zh) 创建 Key；自定义推理服务还需要在方舟控制台创建接入点并取得 Endpoint ID。参考 [在线推理文档](https://docs.volcengine.com/docs/ark/online-inference-standard?lang=zh)。当前画布主要按 Seedance NZ 返回结构进行轮询，火山直连适配属于可选能力，接入新端点时应确认提交与查询响应格式。

### 站点与协作

| 变量 | 说明 | 本地默认值 |
| --- | --- | --- |
| `SITE_URL` | Web 对外地址，用于邀请链接与 Auth 回跳 | `http://localhost:3000` |
| `NEXT_PUBLIC_COLLABORATION_URL` | 浏览器可访问的 WebSocket 地址 | `ws://localhost:8787` |
| `CORS_ORIGINS` | 允许的前端 Origin，逗号分隔 | 本地 3000/3001 |
| `WEB_PORT` | Web 宿主机端口 | `3000` |
| `COLLABORATION_PORT` | 协作服务宿主机端口 | `8787` |
| `MODEL_SYNC_INTERVAL_MS` | 模型目录定时同步间隔 | `86400000`（每天） |

生产环境使用 HTTPS 时，协作地址也必须使用 `wss://`。

## 配置 Supabase 云项目

1. 创建 Supabase 项目。
2. 在 SQL Editor 执行 [`supabase/schema.sql`](supabase/schema.sql)。
3. 将 Project URL、Publishable Key 和 Secret Key 写入 `.env.local`。
4. 在 Auth URL Configuration 中把 Site URL 与 Redirect URLs 设置为你的站点地址。
5. 确认 `project-assets` Storage bucket 和 RLS 策略已经由 schema 创建。
6. 启动应用并注册第一个账号。schema 中的事务锁会确保第一个用户成为管理员。

数据库包含项目、成员、画布快照、评论、素材、生成任务、音色、模型目录、积分和审计记录。RLS 策略负责按项目成员隔离数据。

## Docker：仅运行 Web 与协作服务

此模式连接外部 Supabase：

```bash
cp .env.example .env
# 填写 Supabase 与模型配置
docker compose --env-file .env up --build -d
```

```bash
docker compose --env-file .env ps
curl http://localhost:3000/api/health
```

停止：

```bash
docker compose --env-file .env down
```

`NEXT_PUBLIC_*` 会在 Next.js 镜像构建时写入浏览器包，修改后必须重新执行 `up --build`。

## Docker：完整自托管 Supabase

[`docker-compose.selfhost.yml`](docker-compose.selfhost.yml) 会启动：Postgres、GoTrue、PostgREST、Storage API、Kong、Web 和协作服务。

### 1. 准备配置

```bash
cp .env.example .env
node deploy/gen-supabase-keys.mjs
```

将脚本输出的三项写入 `.env`：

- `JWT_SECRET`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`

同时设置一个高强度 `POSTGRES_PASSWORD`，并把 URL 改成浏览器实际能访问的地址。例如本机运行：

```dotenv
SITE_URL=http://localhost:3000
API_EXTERNAL_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
NEXT_PUBLIC_COLLABORATION_URL=ws://localhost:8787
CORS_ORIGINS=http://localhost:3000
```

如果使用自定义域名，还要同步修改 [`deploy/kong.yml`](deploy/kong.yml) 中的 CORS `origins`。

### 2. 启动

```bash
docker compose --env-file .env -f docker-compose.selfhost.yml up --build -d
```

首次启动会执行 `supabase/schema.sql`；后续部署会执行 `supabase/migrations/*.sql`。

### 3. 验证

```bash
curl http://localhost:3000/api/health
curl http://localhost:8000/auth/v1/health
docker compose --env-file .env -f docker-compose.selfhost.yml ps
```

停止服务但保留数据：

```bash
docker compose --env-file .env -f docker-compose.selfhost.yml down
```

不要随意添加 `-v`，它会删除数据库与素材卷。

## Windows 远端部署脚本

[`deploy.sh`](deploy.sh) 面向 Windows OpenSSH + Docker Desktop + Git Bash 远端。它通过 tar-over-SSH 同步源码，然后在远端运行 Compose。

在 `.env` 中填写：

```dotenv
DEPLOY_HOST=server.example.com
DEPLOY_USER=deploy
DEPLOY_DIR=C:/opt/mini-canvas
SSH_PORT=22
SSH_KEY=C:/Users/you/.ssh/id_ed25519
COMPOSE_FILE=docker-compose.selfhost.yml
```

首次推送 `.env`：

```bash
./deploy.sh --init
```

后续部署：

```bash
./deploy.sh
```

脚本打包时会排除 `.env`、`.env.local`、`.git`、`.next`、`node_modules` 与测试产物。

## 模型目录同步

协作服务默认在启动 15 秒后同步一次模型目录，此后按 `MODEL_SYNC_INTERVAL_MS` 重复执行，默认每天一次。同步源为：

```text
https://api.seedance.nz/pricing
```

也可以由管理员在 `/admin` 页面手动触发。同步请求使用服务端 `SUPABASE_SECRET_KEY` 鉴权。

## 常用命令

```bash
npm run dev        # Next.js + WebSocket 协作服务
npm run build      # 生产构建
npm run start      # 启动生产 Web
npm run sync       # 单独启动协作服务
npm run typecheck  # TypeScript 检查
npm run lint       # ESLint
npm test           # Node 测试
```

## 项目结构

```text
src/app/                 Next.js 页面与 API Routes
src/components/          画布、节点、3D 场景与 UI 组件
src/lib/                 Supabase、生成模型、协作辅助逻辑
src/store/               Zustand 状态
server/collaboration.ts  WebSocket 协作与模型定时同步
supabase/schema.sql      新数据库完整结构
supabase/migrations/     已部署数据库的增量迁移
deploy/                  Kong、自托管初始化与远端脚本
tests/                   核心逻辑测试
```

## 安全注意事项

- 只提交 `.env.example`，不要提交 `.env`、`.env.local`、终端日志或构建目录。
- `SUPABASE_SECRET_KEY`、`SEEDANCE_API_KEY`、`KIMI_API_KEY`、`VOLCENGINE_API_KEY` 只能在服务端使用。
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 会进入浏览器包，权限必须由 Supabase RLS 控制。
- 如果密钥曾经进入 Git 历史，删除文件并不足够，需要在对应控制台轮换密钥。
- 生产环境应使用 HTTPS/WSS，并按真实域名收紧 CORS。
- `MODEL_ENCRYPTION_KEY` 是预留配置；当前版本的渠道密钥仍从服务端环境变量读取。

## 发布前检查

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## License

本项目采用 [MIT License](LICENSE)。
