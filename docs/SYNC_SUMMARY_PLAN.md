### GitHub Actions 同期サマリー表示機能 実装計画書

#### ステータス

- 状態: Done
- 完了日: 2025-08-31
- 関連PR: #6

Notion同期のGitHub Actionsワークフロー実行時に、どの記事が同期されたかのサマリーを表示する機能の実装計画を立てる。

#### 1. 目的
- **同期結果の可視化**: GitHub Actionsの実行結果ページで、どの記事が「新規作成」「更新」「スキップ」されたのかを一目で把握できるようにする。
- **デバッグの効率化**: 同期に失敗した際や意図しない挙動があった場合に、どの記事が影響を受けたかを迅速に特定する。
- **運用性の向上**: リポジトリの共同管理者が、Notion側での変更内容とリポジトリの同期状態を容易に確認できるようにする。

#### 2. 現状の課題
現在の `sync-notion` ワークフローは、成功か失敗かのステータスは表示されるものの、具体的にどの記事がどのように処理されたかの詳細なリストは出力されない。そのため、同期内容を確認するにはコミットログを追う必要がある。

#### 3. 提案する解決策
GitHub Actionsが提供する**Job Summaries機能**を活用する。

1.  `scripts/sync-notion.ts` スクリプトを改修し、同期処理を行った各記事のタイトルと処理ステータス（例: `[新規作成]`, `[更新]`）を記録するようにする。
2.  スクリプトの処理が完了した時点で、記録した全記事の処理結果を**Markdownテーブル形式の文字列**として標準出力（`console.log`）する。
3.  `.github/workflows/sync-notion.yml` ワークフロー側で、スクリプトの標準出力を受け取り、`$GITHUB_STEP_SUMMARY` 環境変数が指すファイルに追記する。

これにより、ワークフローの実行結果サマリーページに、整形された同期結果テーブルが表示される。

#### 4. 実装の詳細
- **`scripts/sync-notion.ts` の修正**:
  - 同期結果を保持するための配列（例: `syncResults: { title: string; status: 'created' | 'updated' | 'skipped' }[]`）をスクリプト内で定義する。
  - 各記事の処理が完了するたびに、結果オブジェクトをこの配列に追加する。
  - スクリプトの最後に、`syncResults` 配列の内容を基にMarkdownテーブルを生成し、`console.log` で出力する関数を追加する。
    - **出力例**:
      ```markdown
      | Status    | Title                                  |
      | :-------- | :------------------------------------- |
      | `created` | 新規作成された記事のタイトル         |
      | `updated` | 更新された記事のタイトル             |
      | `skipped` | スキップされた記事のタイトル         |
      ```

- **`.github/workflows/sync-notion.yml` の修正**:
  - Notion同期スクリプトを実行するステップに、`$GITHUB_STEP_SUMMARY` へのリダイレクトを追加する。
  - **例**:
    ```yaml
    - name: Sync Notion Content
      run: |
        echo "### Notion Sync Summary" >> $GITHUB_STEP_SUMMARY
        echo "" >> $GITHUB_STEP_SUMMARY
        pnpm run sync >> $GITHUB_STEP_SUMMARY
    ```
    これにより、`pnpm run sync`（`node scripts/sync-notion.ts`）の標準出力がそのままサマリーファイルに書き込まれる。

#### 5. タスク分割
1. **[スクリプト改修]** `scripts/sync-notion.ts` を修正。同期処理の結果（記事タイトル、ステータス）を記録し、最後にMarkdownテーブルとして標準出力するロジックを追加する。
2. **[ワークフロー改修]** `.github/workflows/sync-notion.yml` を修正。スクリプト実行ステップで、標準出力を `$GITHUB_STEP_SUMMARY` に追記するよう設定する。
3. **[テスト]** 修正したワークフローを手動でトリガー（`workflow_dispatch`）するか、Notion側で記事を更新して、GitHub Actionsのサマリーページに結果テーブルが正しく表示されることを確認する。
