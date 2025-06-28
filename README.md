# Artale Discord Bot

MapleStory Artale 廣播訊息 Discord 機器人，使用 NestJS 架構重構版本。

## 功能特色

- 🔗 連接 Artale WebSocket API 接收即時廣播訊息
- 🤖 Discord 斜線命令支援
- 🔍 關鍵字過濾系統
- 📋 訊息類型過濾（收購/販售）
- 🔄 智能合併訂閱模式（不會覆蓋現有設定）
- 🗄️ MongoDB 數據持久化
- ⚡ NestJS 模組化架構

## 支援的指令

- `/subscribe` - 訂閱廣播訊息（合併模式）
- `/unsubscribe` - 取消訂閱
- `/status` - 查看訂閱狀態
- `/reset` - 重置所有訂閱設定
- `/listkeywords` - 查看關鍵字清單
- `/listtypes` - 查看訊息類型清單

## 技術架構

- **框架**: NestJS with TypeScript
- **資料庫**: MongoDB with Mongoose
- **Discord**: Discord.js v14
- **WebSocket**: 連接 Artale API
- **配置**: 環境變數配置

## 環境設定

### 1. 安裝依賴

```bash
npm install
```

### 2. 配置環境變數

複製 `.env.example` 為 `.env` 並填入相關資訊：

```bash
cp .env.example .env
```

編輯 `.env` 文件：

```env
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_application_client_id_here

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/artale-bot
```

### 3. 設定 Discord Application

1. 前往 [Discord Developer Portal](https://discord.com/developers/applications)
2. 創建新的 Application
3. 在 Bot 頁面創建 Bot 並取得 Token
4. 在 OAuth2 > General 取得 Client ID
5. 在 OAuth2 > URL Generator 選擇 `bot` 和 `applications.commands` scope
6. 將產生的 URL 用於邀請機器人到伺服器

### 4. 啟動 MongoDB

確保 MongoDB 服務正在運行：

```bash
# 使用 Docker
docker run -d -p 27017:27017 --name mongodb mongo

# 或使用本地安裝的 MongoDB
mongod
```

## 執行應用程式

### 本地開發

```bash
# 開發模式
npm run start:dev

# 生產模式
npm run build
npm run start:prod
```

### Docker 部署

#### 生產環境
```bash
# 創建 .env 檔案
cp .env.example .env
# 編輯 .env 填入必要的環境變數

# 啟動服務（包含 MongoDB）
docker-compose up -d

# 查看日誌
docker-compose logs -f artale-bot

# 停止服務
docker-compose down
```

#### 開發環境
```bash
# 啟動開發環境（包含熱重載）
docker-compose -f docker-compose.dev.yml up -d

# 查看日誌
docker-compose -f docker-compose.dev.yml logs -f artale-bot-dev

# 停止開發環境
docker-compose -f docker-compose.dev.yml down
```

## 測試

```bash
# 單元測試
npm run test

# e2e 測試
npm run test:e2e

# 測試覆蓋率
npm run test:cov
```

## 架構說明

### 改進功能

相比舊版本，新版本具有以下改進：

1. **合併訂閱模式**: `/subscribe` 不再覆蓋現有設定，而是合併新的關鍵字和類型
2. **簡化指令**: 移除 `addkeyword`, `addtype`, `removetype` 等複雜指令
3. **重置功能**: 新增 `/reset` 指令用於完全重置設定
4. **MongoDB**: 從 SQLite 遷移到 MongoDB，提供更好的擴展性
5. **NestJS 架構**: 模組化設計，更易維護和擴展

### 模組結構

- **DatabaseModule**: MongoDB 連接和數據操作
- **DiscordModule**: Discord 機器人和指令處理
- **WebSocketModule**: Artale API WebSocket 連接

## CI/CD 部署

### GitHub Actions

本專案包含完整的 GitHub Actions CI/CD pipeline：

#### 🔄 主要 Workflows

1. **CI/CD Pipeline** (`.github/workflows/ci.yml`)
   - **Lint & Test**: 代碼質量檢查、單元測試、E2E 測試
   - **Security**: 安全掃描和依賴檢查
   - **Docker Build**: 多平台 Docker 映像建置
   - **Deploy**: 自動部署到 staging/production 環境

2. **Dependency Update** (`.github/workflows/dependency-update.yml`)
   - 每週一自動檢查依賴更新
   - 自動創建 PR 進行依賴升級

3. **Docker Build Test** (`.github/workflows/docker-build.yml`)
   - 對 Docker 相關文件變更進行測試
   - 確保 Docker 映像能正常建置和運行

#### 🔧 需要設定的 GitHub Secrets:

```
STAGING_WEBHOOK_URL    - Staging 部署 webhook URL（可選）
PRODUCTION_WEBHOOK_URL - Production 部署 webhook URL（可選）
```

#### 📋 分支策略:
- `develop` → 自動測試，自動部署到 staging
- `main` → 自動測試，自動部署到 production
- PR → 自動測試和 Docker 建置檢查

### 📦 Container Registry

Docker 映像會自動推送到 GitHub Container Registry：
```bash
# 最新版本
ghcr.io/[username]/artale-discord-bot:latest

# 開發版本
ghcr.io/[username]/artale-discord-bot:develop

# 特定 commit
ghcr.io/[username]/artale-discord-bot:main-[commit-sha]
```

#### 使用映像:
```bash
# 拉取最新版本
docker pull ghcr.io/[username]/artale-discord-bot:latest

# 運行容器
docker run -d \
  -e DISCORD_TOKEN=your_token \
  -e CLIENT_ID=your_client_id \
  -e MONGODB_URI=your_mongodb_uri \
  ghcr.io/[username]/artale-discord-bot:latest
```

## License

MIT Licensed
