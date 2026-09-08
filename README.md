# ELO Collect V0.2

這是低成本 Prototype：前端 + Node.js 原生 HTTP API + JSON 持久化，不需要 npm 套件或外部資料庫。

## 啟動

在此資料夾執行：

```bash
node server.js
```

然後開啟 http://localhost:3000

## API

- `GET /api/state`：讀取目前 Demo 狀態
- `POST /api/credits/grant`：開發模式增加 500 Credits
- `POST /api/redeem` `{ "itemId": 1 }`：確定性兌換
- `POST /api/reset`：重置 Demo

## 持久化

`data.json` 會在第一次啟動時建立，之後每次操作都寫入。

> 這是 Prototype，不含真實 Steam 交易、付款、第三方登入、隨機獎勵或正式生產環境安全機制。
