---
title: "GitHub ActionsによるCI/CD実装"
pubDate: "2025-08-30"
updatedDate: "2025-08-30"
---
# GitHub ActionsによるCI/CD実装

GitHub Actionsは、リポジトリ内でワークフローを自動化するためのプラットフォームだ。コードの変更をトリガーとして、テスト実行からデプロイまでの一連の処理を自動化できる。

## GitHub Actionsの基本概念

### 構成要素の階層

```plain text
ワークフロー（Workflow）
├── トリガー（Trigger）
└── ジョブ（Job）
    └── ステップ（Step）
        ├── アクション（Action）
        └── コマンド（Run）
```

### ワークフロー

`.github/workflows/`ディレクトリ内のYAMLファイルで定義される、自動化処理の設計図。

### トリガー

ワークフローを実行するきっかけとなるイベント。push、pull_request、scheduleなどがある。

### ジョブ

並列実行される処理の単位。依存関係を設定することで順次実行も可能。

### ステップ

ジョブ内で順次実行される個別の処理。

## CI（継続的インテグレーション）の実装

### 基本的なテスト自動化

プロジェクト構成例：

```plain text
project-root/
├── .github/
│   └── workflows/
│       └── test.yml
├── src/
│   └── calculator.py
├── tests/
│   ├── __init__.py
│   └── test_calculator.py
└── requirements.txt
```

### test.ymlの実装

```yaml
name: Test

on:
  pull_request:
    branches: ["main"]
  push:
    branches: ["main"]

jobs:
  test:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        python-version: ["3.9", "3.10", "3.11"]

    steps:
    - name: Checkout repository
      uses: actions/checkout@v4

    - name: Set up Python ${{ matrix.python-version }}
      uses: actions/setup-python@v5
      with:
        python-version: ${{ matrix.python-version }}

    - name: Install dependencies
      run: |
        python -m pip install --upgrade pip
        pip install pytest
        pip install -r requirements.txt

    - name: Run tests
      run: pytest tests/ -v

    - name: Generate test report
      if: failure()
      run: pytest tests/ --tb=short
```

### 複数環境でのテスト

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, windows-latest, macos-latest]
    python-version: ["3.9", "3.11"]
```

## CD（継続的デリバリー）の実装

### Google Cloud Runへの自動デプロイ

### 事前準備

**Workload Identityの設定**

```bash
# プール作成
gcloud iam workload-identity-pools create "github-pool" \
  --location="global"

# プロバイダー作成
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --workload-identity-pool="github-pool" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

**サービスアカウントの準備**

```bash
# サービスアカウント作成
gcloud iam service-accounts create github-actions-sa

# 必要な権限を付与
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:github-actions-sa@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"
```

### デプロイワークフローの実装

```yaml
name: Deploy to Cloud Run

on:
  push:
    branches: ["main"]

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
    - name: Checkout
      uses: actions/checkout@v4

    - name: Authenticate to Google Cloud
      uses: google-github-actions/auth@v2
      with:
        workload_identity_provider: ${{ secrets.WORKLOAD_IDENTITY_PROVIDER }}
        service_account: ${{ secrets.SERVICE_ACCOUNT_EMAIL }}

    - name: Configure Docker for Artifact Registry
      run: gcloud auth configure-docker asia-northeast1-docker.pkg.dev

    - name: Build Docker image
      run: |
        docker build -t asia-northeast1-docker.pkg.dev/${{ secrets.PROJECT_ID }}/app-repo/myapp:${{ github.sha }} .

    - name: Push Docker image
      run: |
        docker push asia-northeast1-docker.pkg.dev/${{ secrets.PROJECT_ID }}/app-repo/myapp:${{ github.sha }}

    - name: Deploy to Cloud Run
      uses: google-github-actions/deploy-cloudrun@v2
      with:
        service: myapp
        region: asia-northeast1
        image: asia-northeast1-docker.pkg.dev/${{ secrets.PROJECT_ID }}/app-repo/myapp:${{ github.sha }}
        env_vars: |
          ENV=production
```

## 高度な機能とベストプラクティス

### 環境変数とシークレット管理

### リポジトリレベルのシークレット

```yaml
env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
  API_KEY: ${{ secrets.API_KEY }}
```

### 環境別のシークレット

```yaml
jobs:
  deploy:
    environment: production
    steps:
    - name: Deploy
      env:
        PROD_API_KEY: ${{ secrets.PROD_API_KEY }}
```

### 条件付き実行

```yaml
- name: Run integration tests
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  run: pytest tests/integration/

- name: Notify on failure
  if: failure()
  uses: actions/github-script@v7
  with:
    script: |
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: 'テストが失敗しました。確認をお願いします。'
      })
```

### ステップ間でのデータ受け渡し

```yaml
- name: Generate build info
  id: build-info
  run: |
    echo "timestamp=$(date +'%Y%m%d-%H%M%S')" >> $GITHUB_OUTPUT
    echo "commit-sha=${GITHUB_SHA:0:7}" >> $GITHUB_OUTPUT

- name: Use build info
  run: |
    echo "Build timestamp: ${{ steps.build-info.outputs.timestamp }}"
    echo "Commit SHA: ${{ steps.build-info.outputs.commit-sha }}"
```

### キャッシュの活用

```yaml
- name: Cache dependencies
  uses: actions/cache@v4
  with:
    path: ~/.cache/pip
    key: ${{ runner.os }}-pip-${{ hashFiles('**/requirements.txt') }}
    restore-keys: |
      ${{ runner.os }}-pip-
```

## 実践的な運用パターン

### ブランチ戦略との連携

```yaml
name: CI/CD Pipeline

on:
  pull_request:
    branches: ["develop", "main"]
  push:
    branches: ["develop", "main"]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    # テスト実行

  deploy-staging:
    needs: test
    if: github.ref == 'refs/heads/develop'
    environment: staging
    steps:
    # ステージング環境へデプロイ

  deploy-production:
    needs: test
    if: github.ref == 'refs/heads/main'
    environment: production
    steps:
    # 本番環境へデプロイ
```

### セキュリティチェックの組み込み

```yaml
- name: Run security scan
  uses: github/super-linter@v5
  env:
    DEFAULT_BRANCH: main
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

- name: Dependency vulnerability scan
  run: |
    pip install safety
    safety check -r requirements.txt
```

## 料金とリソース管理

### 料金体系

- **パブリックリポジトリ**: 基本無料
- **プライベートリポジトリ**: 月2,000分まで無料、超過分は従量課金

### コスト最適化

- 不要なワークフロー実行を避ける
- 適切なトリガー設定
- キャッシュ機能の活用
- 軽量なランナー環境の選択

## トラブルシューティング

### よくある問題と対処法

**権限エラー**

```yaml
permissions:
  contents: read
  pull-requests: write
  id-token: write
```

**タイムアウト**

```yaml
jobs:
  test:
    timeout-minutes: 30
```

**デバッグ情報の出力**

```yaml
- name: Debug environment
  run: |
    echo "GitHub SHA: ${{ github.sha }}"
    echo "GitHub Ref: ${{ github.ref }}"
    echo "GitHub Event: ${{ github.event_name }}"
```

## まとめ

GitHub Actionsを使うことで、テストからデプロイまでの開発プロセスを完全自動化できる。適切に設定されたCI/CDパイプラインは、コードの品質向上と開発効率の大幅な改善をもたらす。