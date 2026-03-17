---
title: "Next.js 15 のポートフォリオを Cloudflare Workers へ移行した記録"
pubDate: "2026-03-17"
updatedDate: "2026-03-17"
updatedAt: "2026-03-17T14:43:00.000Z"
---
# Next.js 15 のポートフォリオを Cloudflare Workers へ移行した記録

2026-03-17 時点の Cloudflare 移行作業の記録。対象は `hamakyo.dev` のポートフォリオサイト。フレームワークは Next.js 15 / React 19。目的は、Vercel 前提だったデプロイ経路を Cloudflare Workers に置き換え、既存の App Router と Contact API を維持したまま運用できる状態にすること。

## 変更前の前提

このリポジトリはもともと Next.js の App Router 構成で、`app/api/contact/route.ts` にお問い合わせ API を持っている。過去の履歴には `vercel.json` があり、一時期は Vercel 前提で運用していた形跡がある。その後 `vercel.json` は削除済みで、今回の作業では Cloudflare Workers 向けの構成を新たに追加した。

移行時点で重要だった要件は以下。

- 独自ドメイン `hamakyo.dev` をそのまま使う
- Contact API のメール送信を維持する
- ローカル開発と本番デプロイの差分を最小化する
- GitHub Actions から継続デプロイできるようにする

## 採用した構成

Cloudflare 対応には OpenNext を採用した。Next.js アプリ自体を大きく組み替えずに Workers へ載せる方針を取った。

`package.json` では以下のスクリプトを追加した。

```json
{
  "scripts": {
    "preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
    "deploy": "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
    "upload": "opennextjs-cloudflare build && opennextjs-cloudflare upload",
    "cf-typegen": "wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts"
  },
  "dependencies": {
    "@opennextjs/cloudflare": "^1.17.1"
  },
  "devDependencies": {
    "wrangler": "^4.74.0"
  }
}
```

通常の `pnpm build` / `pnpm start` は残しつつ、Cloudflare 向けのビルド・プレビュー・デプロイは OpenNext 経由に分離した。ローカルでも `preview` を通せるため、本番に近い挙動を事前に確認しやすい。

## OpenNext と Wrangler の設定

追加した Cloudflare 関連の設定ファイルは次のとおり。

`open-next.config.ts`

```typescript
import { defineCloudflareConfig } from "@opennextjs/cloudflare"

export default defineCloudflareConfig({})
```

`next.config.mjs`

```javascript
export default nextConfig;

import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev())
```

`wrangler.jsonc`

```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "main": ".open-next/worker.js",
  "name": "hamakyo-portfolio",
  "compatibility_date": "2026-03-17",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  },
  "services": [
    {
      "binding": "WORKER_SELF_REFERENCE",
      "service": "hamakyo-portfolio"
    }
  ],
  "routes": [
    {
      "pattern": "hamakyo.dev",
      "custom_domain": true
    }
  ],
  "vars": {
    "CONTACT_FROM_EMAIL": "contact@hamakyo.dev",
    "CONTACT_TO_EMAIL": "contact@hamakyo.dev"
  }
}
```

要点は以下。

- Worker のエントリポイントは `.open-next/worker.js`
- 静的アセットは `.open-next/assets` から配信
- `hamakyo.dev` を `custom_domain` で直接ルーティング
- `WORKER_SELF_REFERENCE` をサービスバインディングとして確保
- 固定値の環境変数は `vars` に定義

Cloudflare 移行といっても、Next.js の出力をそのまま配置するのではなく、OpenNext が生成した worker と assets を Wrangler で配備する構成になる。

## 環境変数の型を先に固定した

Cloudflare の bindings を使うので、`env` のキーを曖昧に扱うと破綻しやすい。`cloudflare-env.d.ts` を追加し、Workers 側と `process.env` 側のキーを明示した。

```typescript
declare namespace Cloudflare {
  interface Env {
    ASSETS: Fetcher
    RESEND_API_KEY: string
    CONTACT_FROM_EMAIL: string
    CONTACT_TO_EMAIL: string
    WORKER_SELF_REFERENCE: Fetcher
  }
}
```

加えて `NodeJS.ProcessEnv` にも `RESEND_API_KEY`、`CONTACT_FROM_EMAIL`、`CONTACT_TO_EMAIL` を反映した。移行時点で型を置いておいたことで、ローカルと本番の変数名ずれを見つけやすくなった。

## Contact API の修正

一番実務的だった差分は `app/api/contact/route.ts`。もともとメール送信は Node 実行前提だったが、Cloudflare Workers では `process.env` だけに依存しない形にする必要があった。

最終的な取得処理は以下。

```typescript
async function getEnv(name: ContactEnvKey) {
  const processValue = process.env[name]

  if (processValue) {
    return processValue
  }

  const { env } = await getCloudflareContext({ async: true })
  const cloudflareValue = env[name]

  if (cloudflareValue) {
    return cloudflareValue
  }

  throw new Error(`Missing environment variable: ${name}`)
}
```

この形で以下を両立した。

- ローカルでは `.env` や `.dev.vars` を利用
- Cloudflare 本番では Worker bindings を利用
- 呼び出し側のコードは `getEnv()` に集約

Resend の初期化も `await getEnv("RESEND_API_KEY")` 経由に統一し、送信元・送信先も同じ経路で取得するようにした。Cloudflare 側の事情を API ハンドラ全体に広げず、環境変数取得の関数に閉じ込めた形。

## ローカル開発用の設定ファイル

`.dev.vars.example` を追加した。

```plain text
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
CONTACT_FROM_EMAIL=noreply@example.com
CONTACT_TO_EMAIL=you@example.com
```

README では、ローカル開発は `.env`、Cloudflare 側は `wrangler secret` と `vars` を使う形に整理した。実運用では API キーだけを secret に寄せ、送信元・送信先アドレスは `wrangler.jsonc` の `vars` と workflow の `env` に置いている。

```bash
wrangler secret put RESEND_API_KEY
```

秘密情報と固定設定値を分けておくほうが、のちのち確認しやすい。

## Static Assets のヘッダー

`public/_headers` を追加した。中身は Cloudflare Workers static assets 向けのヘッダー定義。

```plain text
# <https://developers.cloudflare.com/workers/static-assets/headers>
# <https://opennext.js.org/cloudflare/caching#static-assets-caching>
/*
  X-Content-Type-Options: nosniff
```

アプリコードだけでなく、静的ファイル配信の設定も Cloudflare 寄りに寄せた。周辺設定をまとめて入れておいたほうが移行後の確認範囲を狭められる。

## GitHub Actions での CI/CD

`.github/workflows/cloudflare.yml` を追加した。トリガーは Pull Request と `main` ブランチへの push。

```yaml
on:
  pull_request:
  push:
    branches:
      - main
```

ジョブは 2 段構成。

- `verify`: PR / push の両方で OpenNext ビルドを検証
- `deploy`: `main` への push 時だけ Cloudflare Workers へデプロイ

`verify` では `pnpm exec opennextjs-cloudflare build` を実行している。`next build` ではなく Cloudflare 向けビルドを直接検証することで、本番デプロイ直前で初めて壊れるパターンを避けやすくした。

`deploy` では以下の環境変数を使う。

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `RESEND_API_KEY`
- `CONTACT_FROM_EMAIL`
- `CONTACT_TO_EMAIL`

`main` へ push すれば GitHub Actions から Workers へ自動デプロイされる状態になった。

## 途中で起きた修正

### Deploy script invocation の修正

Cloudflare 対応を入れた直後に、workflow 上の deploy 呼び出しを修正した。初回セットアップだけでは deploy 手順がそのままでは通らなかった。

この種の修正は珍しくない。ローカルの `pnpm run deploy` が通っても、GitHub Actions 上では Node / pnpm / secret 注入の条件が少し違う。Cloudflare 移行では CI 上の最終段まで回して初めて終わる。

### セキュリティアドバイザリ対応

同日に `pnpm.overrides` に `undici` を追加して依存関係も調整した。

```json
"pnpm": {
  "overrides": {
    "undici": "^7.24.0"
  }
}
```

移行そのものとは別件だが、デプロイ基盤の変更は依存関係の見直しが発生しやすい。まとめて片付けるほうが管理しやすい。

## この時点で整ったこと

- OpenNext 経由で Next.js 15 を Cloudflare Workers に載せる構成が入った
- 独自ドメイン `hamakyo.dev` を Wrangler の route に接続した
- Contact API が Cloudflare bindings と `process.env` の両方を扱えるようになった
- ローカル確認用に `.dev.vars.example` を追加した
- GitHub Actions から `main` push 時に自動デプロイできるようになった
- README に運用手順と必要な secrets / vars を記録した

## まだ残る論点

この時点で最低限の移行は完了しているが、運用面ではまだ掘れる余地がある。

- プレビュー環境のドメイン設計
- Cloudflare のログと分析基盤の利用
- キャッシュ戦略の細分化
- Contact API の監視や通知導線

まずは「Cloudflare で動く」「継続デプロイできる」「メール送信が壊れない」までを優先した。

## まとめ

今回の移行で本質的だったのは、大きなリライトではなく、実行環境の差分をどこで吸収するかの整理だった。

- OpenNext で Next.js の構造を保ったまま Workers に変換する
- Wrangler で route / assets / bindings を定義する
- Contact API の環境変数取得を `getEnv()` に集約する
- CI でも Cloudflare 向けビルドを直接検証する