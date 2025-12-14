# WebDAV 备份配置说明

WebDAV备份功能已集成到Drawnix中。要启用此功能，请按照以下步骤操作：

## 1. 配置环境变量

将 `.env.example` 复制为 `.env`，并填入您的WebDAV服务器信息：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# WebDAV服务器地址（必填）
VITE_WEBDAV_URL=https://your-webdav-server.com/remote.php/webdav

# WebDAV用户名（可选）
VITE_WEBDAV_USERNAME=your-username

# WebDAV密码（可选，默认为空）
VITE_WEBDAV_PASSWORD=your-password
```

## 2. 重启开发服务器

配置完成后，重启开发服务器以加载环境变量：

```bash
npm start
```

## 3. 备份行为

- **自动备份**：每次保存画板时自动备份到WebDAV服务器
- **删除同步**：删除画板时也会从WebDAV服务器删除对应文件
- **静默失败**：备份失败不会影响本地保存，错误仅记录到控制台
- **文件结构**：每个画板保存为 `/drawnix/boards/{boardId}.json`

## 4. 检查备份状态

打开浏览器开发者工具（F12），查看控制台输出：

- `[WebDAV] Client initialized successfully` - WebDAV客户端初始化成功
- `[WebDAV] Successfully backed up board: {boardId}` - 画板备份成功
- 如有错误会显示相应的错误信息

## 5. 常见问题

**Q: 如何禁用WebDAV备份？**
A: 删除或不创建 `.env` 文件，或者将 `VITE_WEBDAV_URL` 留空。

**Q: 备份失败会影响使用吗？**
A: 不会。本地保存始终优先，备份失败只会在控制台记录错误。

**Q: 服务器不需要密码怎么办？**
A: 只配置 `VITE_WEBDAV_URL`，其他字段可以注释掉或不填。
