# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QuickShare 是一个基于 Express.js 的 HTML 代码分享工具,支持多种代码格式(HTML/Markdown/SVG/Mermaid)的智能识别和渲染。类似 Pastebin,但专注于代码片段的可视化展示。

## Development Commands

### 本地开发
```bash
# 开发模式 (nodemon 自动重启)
npm run dev
# 运行在 http://localhost:3003 (开发环境)

# 生产模式
npm start
# 运行在 http://localhost:8888 (生产环境)

# 测试模式
npm run test
```

### 数据库迁移
```bash
# 添加新字段到数据库
node scripts/migrate-db.js

# 添加代码类型字段
node scripts/add-code-type.js
```

### Docker 部署
```bash
# 使用 Docker Compose
docker-compose up -d

# 单独使用 Docker
docker build -t quickshare .
docker run -p 8888:8888 quickshare
```

## Architecture Overview

### 核心数据流

**创建分享链接流程:**
```
前端代码输入
  → codeDetector.js 检测类型 (HTML/Markdown/SVG/Mermaid)
  → POST /api/pages/create
  → 认证中间件 (isAuthenticated)
  → 速率限制 (15分钟/10次)
  → models/pages.js 创建页面
    - 生成 16 位随机 ID (crypto.randomBytes)
    - bcrypt 哈希密码(如果设置保护)
    - 存储到 SQLite
  → 返回 { urlId, password }
```

**查看分享页面流程:**
```
GET /view/:id
  → 速率限制 (1分钟/60次)
  → 验证查看密码 (view_password, bcrypt)
  → 验证分享密码 (password, bcrypt)
  → extractCodeBlocks() 提取代码块
  → detectCodeType() 智能检测类型
  → contentRenderer.js 渲染
    - renderHtml() / renderMarkdown() / renderSvg() / renderMermaid()
  → 返回完整 HTML 文档
```

### 认证系统架构

**三层密码保护:**
1. **登录密码** - 创建分享需要登录
   - 普通用户: `AUTH_PASSWORD_USER` (config.js)
   - 管理员: `AUTH_PASSWORD_ADMIN` (config.js)
   - 存储: Session (文件) + Cookie (备份)

2. **分享密码** - 可选,系统生成 6 位随机密码
   - 存储: bcrypt 哈希在 `pages.password` 字段
   - 用途: 限制谁可以查看分享内容

3. **查看密码** - 可选,用户自定义
   - 存储: bcrypt 哈希在 `pages.view_password` 字段
   - 用途: 额外的访问控制层

**认证实现细节:**
- Session 存储在 `./sessions/` 目录 (session-file-store)
- Cookie 作为备份机制,24 小时有效
- 使用 `middleware/auth.js` 的 `isAuthenticated` 中间件
- 支持 Session 和 Cookie 双重验证

### 数据库设计

**表结构 (pages):**
```sql
CREATE TABLE pages (
  id TEXT PRIMARY KEY,              -- 16位随机ID
  html_content TEXT NOT NULL,       -- 原始内容
  created_at INTEGER NOT NULL,      -- 创建时间戳
  password TEXT,                    -- 分享密码 (bcrypt)
  is_protected INTEGER DEFAULT 0,   -- 是否密码保护
  code_type TEXT DEFAULT 'html',    -- 代码类型
  expires_at INTEGER,               -- 过期时间戳
  view_password TEXT                -- 查看密码 (bcrypt)
)
```

**自动迁移机制:**
- `models/db.js` 的 `initDatabase()` 在启动时自动检测缺失字段
- 使用 `PRAGMA table_info(pages)` 检查现有结构
- 动态执行 `ALTER TABLE` 添加新字段
- 无需手动运行迁移脚本

**定时清理:**
- 启动时执行一次 `cleanupExpiredPages()`
- 每小时自动清理过期页面 (expires_at < NOW)
- 在 `app.js` 的服务器启动后配置

### 内容渲染系统

**智能类型检测 (utils/codeDetector.js):**

检测顺序:
1. **文档结构检测** - 检查 `<!DOCTYPE>`, `<html>`, `<svg>`
2. **代码块提取** - 提取 ` ```type ... ``` ` 格式的代码块
3. **Mermaid 模式匹配** - 匹配 12 种图表类型的正则模式
4. **Markdown 特征计数** - 统计标题、列表、链接等特征
5. **默认降级** - 无法识别时默认为 HTML

**渲染器架构 (utils/contentRenderer.js):**

每种类型都有独立的渲染函数:
- `renderHtml()` - 检测完整文档或包装片段
- `renderMarkdown()` - 使用 marked.js + 自定义 renderer
  - 重写 `table` renderer: 自动包裹 `.table-wrapper` (横向滚动)
  - 重写 `code` renderer: Mermaid/SVG 特殊处理
- `renderSvg()` - 包装在样式化容器中
- `renderMermaid()` - 客户端渲染,注入 Mermaid.js

**表格滚动优化:**
- Markdown 渲染器自动为所有 `<table>` 添加 `.table-wrapper` 容器
- CSS 提供横向滚动 + 美化滚动条 (莫兰迪蓝色系)
- 响应式宽度: 1100px (PC) → 100% (移动端)

## Key Configuration Files

### config.js - 环境配置
```javascript
{
  development: {
    port: 3003,                      // 开发端口
    authPasswordUser: 'htmleveryone',
    authPasswordAdmin: 'hydycnjrndx'
  },
  production: {
    port: 8888,                      // 生产端口(服务器)
    // 生产环境使用 .env 覆盖密码
  }
}
```

### .env - 环境变量
```env
NODE_ENV=development
PORT=3003
AUTH_ENABLED=true
AUTH_PASSWORD_USER=htmleveryone
AUTH_PASSWORD_ADMIN=hydycnjrndx
DB_PATH=./db/html-go.db
```

**重要:**
- 生产环境在 `app.js` 中强制使用 8888 端口
- 开发/测试环境使用 config.js 中的端口

## Security Considerations

### 速率限制配置
```javascript
createLimiter:  15分钟内最多 10 次创建
viewLimiter:    1分钟内最多 60 次查看
```

### 内容安全
- 最大内容大小: 500KB (app.js:228)
- Helmet 安全头配置 (禁用 CSP 和 COEP)
- 所有密码使用 bcrypt (10 轮加盐)
- 输入转义: `utils/contentRenderer.js` 的 `escapeHtml()`

### 会话安全
```javascript
session: {
  cookie: {
    httpOnly: true,       // 防止 XSS
    sameSite: 'lax',      // CSRF 保护
    maxAge: 24 * 60 * 60 * 1000  // 24 小时
  }
}
```

## Important Implementation Details

### 随机 ID 生成
```javascript
// models/pages.js
crypto.randomBytes(8).toString('hex')  // 16 位十六进制
```

### 密码生成
```javascript
// models/pages.js:generateRandomPassword()
// 6 位大写字母 + 数字组合
const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
crypto.randomInt(0, chars.length)
```

### Markdown 表格渲染
```javascript
// utils/contentRenderer.js
renderer.table = function(header, body) {
  const tableHtml = originalTableRenderer(header, body);
  return `<div class="table-wrapper">${tableHtml}</div>`;
};
```

### 过期时间计算
```javascript
// models/pages.js
const expiresAt = expiryDays > 0
  ? Date.now() + (expiryDays * 24 * 60 * 60 * 1000)
  : null;  // null = 永久
```

## Common Development Patterns

### 添加新的代码类型支持

1. **在 `utils/codeDetector.js` 添加检测逻辑:**
```javascript
CODE_TYPES.NEW_TYPE = 'newtype';

// 在 detectCodeType() 中添加检测
if (content.includes('特征标记')) {
  return CODE_TYPES.NEW_TYPE;
}
```

2. **在 `utils/contentRenderer.js` 添加渲染器:**
```javascript
async function renderNewType(content) {
  // 渲染逻辑
  return `<!DOCTYPE html>...`;
}

// 在 renderContent() 中添加 case
case CODE_TYPES.NEW_TYPE:
  return renderNewType(content);
```

3. **更新前端检测 (`public/js/main.js`):**
```javascript
function detectCodeType(code) {
  // 添加前端检测逻辑
}
```

### 添加新的数据库字段

1. **在 `models/db.js` 的 `initDatabase()` 中添加迁移:**
```javascript
const hasNewField = columns.some(col => col.name === 'new_field');
if (!hasNewField) {
  await db.run('ALTER TABLE pages ADD COLUMN new_field TEXT');
}
```

2. **在 `models/pages.js` 中更新 CRUD 操作:**
```javascript
// createPage
await db.run(
  `INSERT INTO pages (..., new_field) VALUES (..., ?)`,
  [..., newFieldValue]
);

// getPageById
const page = await db.get('SELECT ..., new_field FROM pages...');
```

### 添加新的 API 路由

**需要认证的路由 (在 app.js 中):**
```javascript
app.post('/api/new-endpoint', isAuthenticated, async (req, res) => {
  // 业务逻辑
});
```

**公开路由 (在 routes/pages.js 中):**
```javascript
router.get('/api/new-endpoint', async (req, res) => {
  // 业务逻辑
});
```

## Testing and Debugging

### 查看应用日志
```bash
# 开发环境 (控制台输出)
npm run dev

# 生产环境 (服务器)
sudo journalctl -u quickshare.service -f
```

### 数据库调试
```bash
# 直接查询数据库
sqlite3 db/html-go.db "SELECT * FROM pages ORDER BY created_at DESC LIMIT 10"

# 检查表结构
sqlite3 db/html-go.db "PRAGMA table_info(pages)"
```

### 会话调试
```bash
# 查看会话文件
ls -la sessions/

# 删除所有会话 (强制重新登录)
rm -rf sessions/*
```

## Deployment Notes

### 服务器部署 (Tencent Cloud Ubuntu)
- **服务类型**: systemd service (`quickshare.service`)
- **工作目录**: `/home/ubuntu/quickshare`
- **Git 仓库**: https://github.com/OceanJy333/share.git
- **运行端口**: 8888 (production 模式)
- **重启命令**: `sudo systemctl restart quickshare.service`

### 部署流程
```bash
# 1. 拉取最新代码
cd /home/ubuntu/quickshare
git pull origin main

# 2. 安装依赖 (如果 package.json 有更新)
npm install

# 3. 重启服务
sudo systemctl restart quickshare.service

# 4. 查看状态
sudo systemctl status quickshare.service
```

### 环境变量
服务器上的 `.env` 文件必须包含:
```env
NODE_ENV=production
PORT=8888
AUTH_ENABLED=true
AUTH_PASSWORD_USER=实际密码
AUTH_PASSWORD_ADMIN=实际密码
```

## Troubleshooting

### 常见问题

**端口冲突:**
- 开发环境: 修改 `config.js` 中的 port
- 生产环境: 修改 `app.js:39` 的强制端口设置

**数据库权限错误:**
```bash
chmod -R 700 db/
chmod -R 700 sessions/
```

**会话丢失:**
- 检查 `sessions/` 目录权限
- 检查 Cookie 是否被浏览器阻止
- 开发工具查看 Session 和 Cookie 状态

**Markdown 渲染问题:**
- 检查 `marked` 版本 (当前 15.0.7)
- 查看控制台 `[DEBUG]` 日志
- 检查 `utils/contentRenderer.js` 的渲染器配置

**Mermaid 图表不显示:**
- 检查客户端是否加载了 Mermaid.js CDN
- 查看浏览器控制台错误
- 验证 Mermaid 语法是否正确
