---
title: "Nodemailerでのメール送信トラブルシューティング記録"
pubDate: "2025-08-28"
updatedDate: "2025-08-28"
---
# Nodemailerでのメール送信トラブルシューティング記録

## 使用技術・構成

- フレームワーク: Next.js (App Router)
- メール送信: Nodemailer
- デプロイ環境: Vercel
- メールサーバ: さくらインターネット（[smtp.hamakyo.sakura.ne.jp](http://smtp.hamakyo.sakura.ne.jp/)）
- フロントから `/app/api/contact/route.ts` 経由でPOSTし、SMTP送信

---

## 発生した問題

### 症状:

- ローカル環境では送信できたが、本番（Vercel）環境では送信に失敗
- Vercelのログで以下のエラーが出力された：

```plain text
Error sending email: Error: Mail command failed:
550 5.7.1 <contact@hamakyo.dev>... Command rejected
```

### 試行錯誤のログ

- SMTP設定、環境変数の確認（EMAIL_USER, EMAIL_PASSWORD, EMAIL_FROM など）
- Nodemailerの接続構成と createTransport 設定を再確認
- `export const runtime = "nodejs"` をAPI Routeに追加（Edge Function制限対策）
- Vercelの環境変数と本番反映を手動で確認（自動では反映されないことに注意）
- メールアカウントがさくら側に存在し、SMTP認証が可能であることを確認
- SPFレコードのCloudflare DNS追加を検討（後述）
- ログで `550 5.7.1` の MAIL FROM 拒否エラーを確認 → 送信制限 or 信頼性の問題と判断

### 決定的な原因

さくらインターネット契約直後の「メール送信制限」 & 「国外IPアドレスフィルター」

**詳細:**

- 新規契約時は最大14日間、SMTP送信が制限される
- 会員メニューで電話番号認証＋制限解除ボタンを押すことで手動解除可能
- さらに、Vercelは国外IPのため、国外IPアドレスフィルターを解除しないとSMTP拒否される

### 解決方法（実際にやったこと）

- 会員メニューで電話番号認証＋制限解除申請
- さくらのメール管理画面で「国外IPアドレスフィルター」を無効化
- 数分後、Vercel環境からのメール送信に成功

### 教訓・メモ

- ローカルと本番の挙動は「送信元IP」や「送信回数制限」によって異なる
- SMTPは正しい設定＋信頼性の証明（SPF/DKIM）＋送信権限がないと動かない
- Vercelでメール送信する場合、国外IP制限に要注意