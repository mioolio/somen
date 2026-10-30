# 平台插件协议 v1

## 目录

每个平台完整放在 `platforms/<id>/`。`id` 与目录一致，使用小写字母、数字、连字符，平台之间不互相导入。

```text
platforms/<id>/
  manifest.json
  README.md
  server/
    register.mjs
    <每个服务功能独立文件>
  panel/
    register.js
    routes.js
    <独立组件、状态、样式>
  native/
    <可选：操作系统适配文件>
```

## manifest

```json
{ "id": "qq", "label": "QQ", "path": "/qq", "apiVersion": 1, "enabled": true }
```

这是新增平台示例，不代表已实现 QQ。`enabled: false` 禁用平台；新增、移除或切换状态后重启 `npm run dev`。

## 服务端注册

`server/register.mjs` 导出 `register({ router, onDispose })`，可以异步。

```js
// Boundary: own platform API registration only.
export function register({ router, onDispose }) {
  router.get('/instances', async () => ({ instances: [] }));
  onDispose(() => { /* 释放资源 */ });
}
```

宿主添加 `/api/<id>` 前缀，不允许注册其他平台接口。返回值序列化为 JSON。抛出的 `error.code` 和 `error.message` 转为 503；错误信息应是本机用户可读说明，不含密钥或原始内存。启动失败回滚路由和 cleanup；退出调用 cleanup，异步任务应响应停止信号。

## 前端注册

`panel/register.js` 默认导出 `{ id, label, path, routes }`；`routes` 从自己的 `routes.js` 导入，使用 Vue Router 路由数组，组件动态导入。路由都在 `/<id>` 下，不能引用其他平台页面。

壳层自动发现注册文件、读取 `/api/platforms`，只启用后端 `status: ready` 的同 id 插件。注册文件无平台间副作用，具体页面访问时加载。未安装、禁用、注册损坏均有空态或提示。

## 证据与隐私

区分实例与辅助进程；账号需有本次活跃实例的可验证证据。历史目录、昵称、单个字符串命中不能直接视为登录身份。扫描结果只在本地内存，测试用虚构账号，开发记录不包含真实账号快照。
