# ELO Collect V0.3

低成本 Prototype：前端 + Node.js 原生 HTTP API + JSON 持久化，不需要 npm 套件或外部資料庫。

## V0.3 新增

- 多使用者資料模型
- Demo 登入 / 登出與 HttpOnly session cookie
- 每個使用者獨立 Credits
- 每個使用者獨立 Holdings
- 每個使用者獨立 Ledger
- 個人交易紀錄
- 後端持久化資料
- 兌換交易以 transaction + ledger + holding 三層紀錄

## 啟動

在此資料夾執行：

```bash
node server.js
```

開啟： http://localhost:3000

## Demo 帳號

- `elo_demo`
- `alice`

登入只是本機開發用途，不是正式身份驗證。

## API

- `GET /api/auth/users`
- `POST /api/auth/dev-login` `{ "userId": "u_demo" }`
- `POST /api/auth/logout`
- `GET /api/state`
- `POST /api/credits/grant`
- `POST /api/redeem` `{ "itemId": 1 }`
- `POST /api/reset`

> 本版仍不包含付款、真實 Steam 交易、第三方 OAuth、隨機獎勵或正式生產環境安全機制。
