# ELO Collect V1.1

本版本新增 Steam OpenID 登入／SteamID 綁定；未接入 Steam 物品交易、隨機獎勵或提領。

## 啟動

```bash
node server.js
```

預設：`http://localhost:3000`

## Steam 登入

網站使用 Steam 官方支援的瀏覽器 OpenID 2.0 流程：

1. 使用者點「使用 Steam 登入」。
2. 導向 `https://steamcommunity.com/openid/login`。
3. Steam 驗證後回到 `/auth/steam/callback`。
4. 伺服器驗證 OpenID 回應並取得 SteamID。
5. 建立／綁定 ELO Collect 使用者，再建立本站 Session。

本機預設已使用：

```text
BASE_URL=http://localhost:3000
STEAM_RETURN_URL=http://localhost:3000/auth/steam/callback
```

如需正式網域，請把 `.env.example` 中的 URL 改成你的 HTTPS 網域。

`STEAM_WEB_API_KEY` 是可選的，只用來取得 Steam 暱稱與頭像；Steam 登入身分本身仍以 OpenID 驗證結果與 SteamID 為依據。

## 開發測試

登入頁保留 Demo 登入折疊區，方便沒有 Steam 時測試網站功能。

## 注意

此版本只實作 Steam 身分登入與帳號綁定。Steam 官方文件說明，網站瀏覽器可使用 OpenID 取得 SteamID，並將其作為第三方網站登入憑據或與既有帳號綁定。
