---
title: "クリックでその場に Markdown / テキストを作る Automator クイックアクション"
pubDate: "2025-08-31"
updatedDate: "2025-08-31"
updatedAt: "2025-08-31T10:05:00.000Z"
---
# 右クリックでその場に Markdown / テキストを作る Automator クイックアクション

## 概要

Finder でフォルダやファイルを右クリックし、その場所に `.md` または `.txt` を新規作成できるクイックアクションを Automator で作成する。

`.md` の場合は見出し入り雛形を挿入。既存ファイルと重複する場合は `(2)`, `(3)` などの連番を付与。作成後は Finder で表示し既定アプリで開く。

---

## 完成版シェルスクリプト

```bash
#!/usr/bin/env bash
set -euo pipefail

target_dir="${1:-$HOME/Desktop}"

if [[ -f "$target_dir" ]]; then
  target_dir="$(dirname "$target_dir")"
fi

name="$(/usr/bin/osascript <<'OSA'
set msg to "作るファイル名（拡張子つき）を入力してね\\n例: notes.md または memo.txt"
set ans to text returned of (display dialog msg default answer "Untitled.md" with title "新規ファイル" buttons {"OK"} default button "OK")
return ans
OSA
)"

[[ -z "$name" ]] && exit 0

base="${name%.*}"
ext="${name##*.}"
[[ "$base" == "$ext" ]] && ext=""
candidate="$target_dir/$name"
i=2
while [[ -e "$candidate" ]]; do
  if [[ -n "$ext" ]]; then
    candidate="$target_dir/${base} (${i}).${ext}"
  else
    candidate="$target_dir/${base} (${i})"
  fi
  ((i++))
done

lower_ext="$(printf '%s' "$ext" | tr '[:upper:]' '[:lower:]')"
if [[ "$lower_ext" == "md" ]]; then
  printf "# %s\\n\\n" "$base" > "$candidate"
else
  : > "$candidate"
fi

/usr/bin/open -R "$candidate"
/usr/bin/open "$candidate"
```

## **Automator ワークフロー作成手順**

1. Automator を起動し「クイックアクション」を選択
2. 「クイックアクションが受け取る現在の項目」を **ファイルまたはフォルダ** に設定

    「検索対象」を **Finder** に設定

3. 左ペインから「シェルスクリプトを実行」を追加
    - シェル: /bin/bash
    - 入力の引き渡し: **引数として**
4. 上記スクリプトを貼り付ける
5. 保存し、名前をつける（例: ここで新規ファイル（md/txt））

---

## **使い方**

1. Finder でフォルダまたはファイルを右クリック
2. 「クイックアクション」→ 作成したアクションを選択
3. ダイアログで notes.md や memo.txt を入力
4. 指定場所にファイルが作成され、自動で開く

---

## **ハマりどころ**

- メニューに出ない場合は「受け取る項目」が正しいか確認
- 何も起きない場合は「入力の引き渡し」が **引数として** になっているか確認
- 拡張子なしでも作成可能だが、雛形は .md の場合のみ入る

---

## **カスタマイズ例**

- 既定のファイル名を Untitled.txt にしたい場合は AppleScript 部分を修正
- Markdown 雛形を増やす場合は生成部分を cat <<EOF ... EOF に書き換える
- VS Code で開きたい場合は /usr/bin/open "$candidate" を

    /usr/bin/open -a "Visual Studio Code" "$candidate" に変更

---

## 動作確認チェック

- 右クリックメニューにアクションが表示される
- `.md` ファイルを作成した場合、雛形 `# タイトル` が入る
- 同名ファイルがあれば `(2)`, `(3)` と連番が付く
- 作成後 Finder で対象が選択され、既定アプリで開く

---

## アンインストールや名前変更

- 保存先は `~/Library/Services/`
- `.workflow` ファイルを削除するとメニューから消える
- ファイル名を変更すると右クリックメニューの表示名も変わる

---

## セキュリティ上の注意

- `osascript` によるダイアログを使っているため、初回実行時にアクセス許可を求められる場合がある
- 管理ポリシーで Automator や AppleScript が制限されている環境では動作しない場合がある
- 信頼できるコードのみクイックアクションに登録すること

---

## まとめ

Automator のクイックアクションを使うことで、右クリックから `.md` や `.txt` を即座に作成できるようになる。

日々のメモや下書きをスムーズに始められる仕組みとして便利。雛形や開くアプリは用途に合わせて自由にカスタマイズ可能。