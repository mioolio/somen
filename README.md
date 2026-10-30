# SOMEN

面向 Windows 的本地平台工作台。轻内核提供壳层，微信等平台通过独立插件扩展。

**当前仅支持 WINDOWS（64 位 Windows 10/11，Node.js 24+）。** 欢迎其他开发者以独立适配器贡献其他系统支持。

```powershell
npm install
npm run dev
```

浏览器打开 <http://127.0.0.1:5173>，无需先打包编译。关闭服务使用 Ctrl+C。若端口占用，在 PowerShell 设置 `$env:SOMEN_PORT=5180` 后启动。

微信插件提供多进程识别、工作账号绑定、联系人读取、文字/图片发送、内置表情目录与本地搜索。工作账号持续跟踪，异常时关闭发送并记录本机诊断；本阶段发送限定为用户授权的唯一普通联系人。

```text
apps/panel/            Vue 面板壳、通用导航、插件页面发现
kernel/                宿主、隔离注册、HTTP 分发
platforms/wechat/      微信插件，自己的前后端和 Windows 适配器
tools/                 启动与结构约束检查
tests/                 宿主契约、移除插件、识别语义验证
docs/                  架构、插件协议、开发记录
```

```powershell
npm test
npm run check
```

添加 QQ 等平台时新建 `platforms/qq/` 并实现[插件协议](docs/plugin-contract.md)。移出、放回或修改插件启用状态后重启服务，内核与其他平台无需修改。每个平台独立注册路由，页面按需加载。

工作台只监听本机回环地址；识别结果只在内存里，不自动写入磁盘或发送外部服务。版本支持和限制见[微信插件](platforms/wechat/README.md)。开发过程见[开发记录](docs/development/2026-10-30.md)，架构约束见[架构说明](docs/architecture.md)。

在实例详情中选择“设为工作微信”，打开 `/wechat/workspace`。选择状态、发送去重账本和轮转日志仅保存在忽略的 `.local/wechat/`。日志不记录正文和真实联系人。生产构建不是开发启动前提。

微信各版本独立保存在 `platforms/wechat/versions/<版本号>/`，包含身份偏移、DLL 散列、原生适配和验证证据。没有全局版本偏移表，缺失或未验证功能不跨版本兜底。工作阶段记录见[跟踪与发送](docs/development/2026-10-30-workspace.md)。
