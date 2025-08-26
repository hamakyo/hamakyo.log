---
title: "Contact Form メール送信トラブルシューティング記録"
description: "Vercel環境でのメール送信トラブルシューティング記録。"
pubDate: 2025-08-26
---

# Contact Form メール送信トラブルシューティング記録

## 使用技術・構成

- フレームワーク: Next.js (App Router)
- メール送信: Nodemailer
- デプロイ環境: Vercel
- メールサーバ: さくらインターネット
- フロントから `/app/api/contact/route.ts` 経由で POST し、SMTP 送信

---

## 発生した問題

### 症状:

- ローカル環境では送信できたが、本番（Vercel）環境では送信に失敗
- Vercel のログで以下のエラーが出力された：

```txt
Error sending email: Error: Mail command failed:
550 5.7.1 <contact@hamakyo.dev>... Command rejected
```

## 試行錯誤のログ

✅ SMTP 設定、環境変数の確認（EMAIL_USER, EMAIL_PASSWORD, EMAIL_FROM など）

✅ Nodemailer の接続構成と createTransport 設定を再確認

✅ export const runtime = "nodejs" を API Route に追加（Edge Function 制限対策）

✅ Vercel の環境変数と本番反映を手動で確認（自動では反映されないことに注意）

✅ メールアカウントがさくら側に存在し、SMTP 認証が可能であることを確認

✅ SPF レコードの Cloudflare DNS 追加を検討（後述）

❗ ログで 550 5.7.1 の MAIL FROM 拒否エラーを確認 → 送信制限 or 信頼性の問題と判断

## 決定的な原因

さくらインターネット契約直後の「メール送信制限」 & 「国外 IP アドレスフィルター」

詳細:

新規契約時は最大 14 日間、SMTP 送信が制限される

会員メニューで 電話番号認証＋制限解除ボタンを押すことで手動解除可能

さらに、Vercel は国外 IP のため、国外 IP アドレスフィルターを解除しないと SMTP 拒否される！

## 解決方法（実際にやったこと）

会員メニューで電話番号認証＋制限解除申請

さくらのメール管理画面で 「国外 IP アドレスフィルター」を無効化

数分後、Vercel 環境からのメール送信に成功！

## 教訓・メモ

ローカルと本番の挙動は「送信元 IP」や「送信回数制限」によって異なる

SMTP は正しい設定＋信頼性の証明（SPF/DKIM）＋送信権限がないと動かない

Vercel でメール送信する場合、国外 IP 制限に要注意（国内サーバで OK でも本番は NG になることも）

.env の中身や送信アカウント・ポート・TLS 設定など、一つひとつが超重要なピース
