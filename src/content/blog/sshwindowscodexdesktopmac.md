---
title: "SSHは通るのにWindows用Codex DesktopからMacへ接続できない問題"
pubDate: "2026-07-18"
notionId: "3a1d2325-530e-80ca-a702-c8cee39b160f"
slug: "sshwindowscodexdesktopmac"
updatedDate: "2026-07-18"
updatedAt: "2026-07-18T15:06:00.000Z"
---
# SSHは通るのにWindows用Codex DesktopからMacへ接続できない問題

Windows版Codex DesktopからMacBook Airへ接続しようとしたところ、SSHコマンドは成功するのにCodex Desktopだけが失敗した。

最初に表示されたのは `Host key verification failed`、それを直した後は `socket hang up` だった。
SSHが通った時点で、接続設定はほぼ正しいと思っていた。
しかし、後から見つかったのはSSHより一段奥にある問題だった。

最終的には、Windows側のSSH設定に二つ、Mac側のCodex実行環境に三つの問題が重なっていた。
この記事は、その切り分けと復旧の記録である。

## 検証環境

ホスト名、IPアドレス、ユーザー名は公開用の例示値へ置き換えている。
コマンドを試す場合は、自分の環境の値に読み替える必要がある。

| 項目            | 値                         |
| ------------- | ------------------------- |
| 接続元           | Windows 11                |
| クライアント        | Codex Desktop             |
| 接続先           | Apple Silicon MacBook Air |
| Macのホスト名      | `macbook.local`           |
| MacのIPアドレス    | `192.168.0.xxx`           |
| MacのSSHユーザー   | `macuser`                 |
| SSHポート        | `22`                      |
| 認証鍵           | Ed25519秘密鍵                |
| Mac側のHomebrew | `/opt/homebrew`           |

## 存在しない秘密鍵を指定していた

最初のCodex Desktop設定では、秘密鍵に `~/.ssh/id_rsa` を指定していた。
Windows側を確認すると、そのファイルは存在しなかった。

実際にあったのはEd25519鍵である。

```plain text
C:\Users\winuser\.ssh\id_ed25519
```

Codex Desktopには、このWindows上の絶対パスを指定した。
鍵の種類より先に、指定したファイルが本当に存在するかを確かめるべきだった。

## SSHのどこまで通っているか

秘密鍵を直しても、Codex Desktopの接続はまだ成功しなかった。
そこで、Codex Desktopを介さずにネットワークとSSH認証を分けて調べた。

まず、PowerShellからTCP 22番ポートへの到達性を確認した。

```powershell
Test-NetConnection 192.168.0.xxx -Port 22
```

結果は `TcpTestSucceeded : True` だった。
この結果から確認できるのは、接続元から対象IPの22番ポートまでTCP接続できることだ。
ユーザー認証やCodexの起動までは保証しない。

次に、ユーザー名と秘密鍵を明示してSSH認証を試した。

```powershell
ssh -i "$HOME\.ssh\id_ed25519" macuser@192.168.0.xxx exit
```

こちらも成功した。
ネットワーク、Mac側のSSHサーバー、ユーザー、秘密鍵の組み合わせは動いている。

## 接続情報をSSH configへ集約する

Codex DesktopとPowerShellで同じ接続情報を使うため、Windows側の `C:\Users\winuser\.ssh\config` を設定した。

```plain text
Host 192.168.0.xxx macbook.local macbook
  HostName macbook.local
  User macuser
  Port 22
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
```

この設定では、IPアドレス、`.local` ホスト名、短い別名のいずれを指定しても同じユーザーと秘密鍵を使う。

設定の解釈結果を含めて接続を確かめた。

```powershell
ssh -o BatchMode=yes -o ConnectTimeout=8 macbook.local "hostname; whoami; pwd"
```

```plain text
macbook.local
macuser
/Users/macuser
```

ここまでで、対話入力なしのSSH接続も成立した。
それでもCodex Desktopは接続できなかった。

## ホスト名を変えたらホスト鍵も別扱いになった

Codex Desktopへ次の値を入力すると、エラーが `Host key verification failed` に変わった。

| 項目         | 入力値                                |
| ---------- | ---------------------------------- |
| 表示名        | `macbook.local`                    |
| ホスト名       | `macbook.local`                    |
| SSHポート     | `22`                               |
| 認証方式       | 秘密鍵ファイル                            |
| 秘密鍵ファイルのパス | `C:\Users\winuser\.ssh\id_ed25519` |

SSH configに `User macuser` があるため、ホスト名欄へ `macuser@macbook.local` と書く必要はない。

Windows側の `known_hosts` にはIPアドレスのホスト鍵が登録されていたが、`macbook.local` という名前の鍵はなかった。
同じMacでも、OpenSSHは接続に使った名前ごとにホスト鍵を照合する。

接続先が意図したMacであることを確認してから、ホスト鍵を登録した。

```powershell
ssh -o StrictHostKeyChecking=accept-new macbook.local "hostname; whoami"
```

これで `macbook.local` の鍵が `C:\Users\winuser\.ssh\known_hosts` に追加され、ホスト鍵のエラーは消えた。

ただし、警告が「未登録」ではなく「以前の鍵と一致しない」という内容なら、この方法でそのまま進めるべきではない。
Macの再インストールやSSHホスト鍵の再生成など、鍵が変わった理由を先に確認する。

## `socket hang up` はSSHの先で起きていた

ホスト鍵を登録した後、Codex Desktopは `socket hang up` を返した。
通常のSSH接続は成功したままである。

念のためSFTPも試した。

```powershell
sftp macbook.local
```

SFTPも接続でき、リモートの `/Users/macuser` を開けた。
SSHの認証とファイル転送まで正常なら、残る疑いは接続後に起動するプロセスにある。

Codex Desktopのリモート接続は、SSHログインだけで完結しない。
Mac側でCodex CLIのapp-serverを起動し、そのプロセスとWindows側が通信する。
app-serverが起動直後に終了すれば、SSHセッション自体が正常でもクライアントには `socket hang up` と見える。

## app-serverログが示した欠落ファイル

Mac側のログをWindowsから確認した。

```powershell
ssh macbook.local 'tail -200 ~/.codex/app-server-control/app-server.log 2>/dev/null'
```

ログには次のエラーが残っていた。

```plain text
Error: spawn /opt/homebrew/lib/node_modules/@openai/codex/node_modules/
@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/codex/codex ENOENT
```

`ENOENT` は、起動対象のファイルが見つからないときに出る。
MacにグローバルインストールされていたCodex CLIを調べると、Apple Silicon向けのCodex本体がパッケージ内に存在しなかった。

当時のCodex CLIは `0.128.0` だった。
パッケージ内には `rg` がある一方、app-serverが起動しようとしたネイティブ実行ファイルは欠けていた。

SSHは通っていた。
切断していたのは、そのSSH経由で起動されたCodexだった。

## Codex CLIを入れ直す

MacのSSH非対話シェルではHomebrewのPATHも通っていなかった。
まず一時的に `/opt/homebrew/bin` を加え、その環境でCodex CLIを再インストールした。

```powershell
ssh macbook.local 'export PATH=/opt/homebrew/bin:$PATH; npm install -g @openai/codex'
```

続けて、バージョンとコマンドの実体を確認した。

```powershell
ssh macbook.local 'export PATH=/opt/homebrew/bin:$PATH; codex --version; command -v codex; command -v node'
```

復旧時点の出力は次のとおりだった。
インストール時期によってCodex CLIのバージョンは変わる。

```plain text
codex-cli 0.144.6
/opt/homebrew/bin/codex
/opt/homebrew/bin/node
```

再インストール後は、欠けていたApple Silicon向けの実行ファイルもパッケージ内に作成された。

## 古いapp-serverを止める

CLIを直しただけでは、古いapp-serverプロセスが制御用Unixソケットを握ったまま残る可能性があった。
実際、今回も以前のプロセスが残っていた。

Mac側でソケットを使用しているプロセスを確認した。

```bash
lsof ~/.codex/app-server-control/app-server-control.sock
```

表示されたPIDが古いapp-serverであることを確認し、そのプロセスを停止して制御ファイルを削除した。

```bash
kill <PID>
rm -f ~/.codex/app-server-control/app-server-control.sock
rm -f ~/.codex/app-server-control/app-server-startup.lock
```

`<PID>` には `lsof` で確認したPIDを入れる。
確認せずに別のプロセスを停止すると、この問題とは無関係な処理まで中断してしまう。

## 非対話シェルにもHomebrewのPATHを通す

通常のMacのターミナルで `codex` を実行できても、SSH経由の非対話シェルが同じPATHを持つとは限らない。
今回の環境では、Codex Desktopから起動したシェルに `/opt/homebrew/bin` が含まれていなかった。

Mac側の `~/.zshenv` に次の一行を追加した。

```bash
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"
```

WindowsからPATHを追加せずに再確認した。

```powershell
ssh macbook.local 'codex --version; command -v codex; command -v node'
```

`codex` と `node` が `/opt/homebrew/bin` から見つかれば、SSHの非対話シェルでもHomebrewのコマンドを実行できる。

## Codex Desktopへ戻る前の起動試験

最後に、Mac側でapp-serverを単体起動した。
Codex Desktopから試す前に、起動直後のクラッシュだけを切り分けるためである。

```bash
codex -c features.code_mode_host=true app-server --listen unix:// \
  > /tmp/codex-appserver-test.log 2>&1 &
pid=$!
sleep 3
ps -p "$pid" -o pid=,comm=
kill "$pid"
cat /tmp/codex-appserver-test.log
```

3秒後もプロセスが存在し、ログに `ENOENT` は出なかった。

修正後にCodex Desktopから再接続すると、`macbook.local` へ接続できた。

## 五つの問題は別々の層にあった

今回の失敗は、一つの設定ミスから起きたものではなかった。

1. **秘密鍵の指定**：存在しない `id_rsa` をCodex Desktopへ指定していた
2. **ホスト鍵の登録**：`macbook.local` の鍵がWindows側に登録されていなかった
3. **Codex CLIのパッケージ**：Apple Silicon向けの実行ファイルが欠落していた
4. **残留プロセス**：古いapp-serverが制御用ソケットを使用していた
5. **非対話シェルの環境**：HomebrewのPATHがSSH経由では通っていなかった

最初の二つはSSH接続までの問題で、残り三つはSSH接続後にCodexを動かすための問題だった。
`Host key verification failed` と `socket hang up` は、同じ接続画面に出ても原因の層が違う。

## 再発時の確認順序

同じ症状が出た場合は、外側から一層ずつ確認すると、どこまで成功しているかを見失いにくい。

1. `Test-NetConnection <host> -Port 22` でTCP接続を確認する
2. `ssh <host>` でSSH認証を確認する
3. `sftp <host>` でSFTP接続を確認する
4. `ssh <host> 'command -v codex; command -v node; codex --version'` でリモート実行環境を確認する
5. `~/.codex/app-server-control/app-server.log` でapp-serverの終了理由を確認する
6. app-serverを単体起動し、起動直後に終了しないか確認する

SSHが成功した時点で分かるのは、SSHまで成功したということだけである。
Codex Desktopの接続では、その先にあるリモートCLIとapp-serverも動かなければならない。

## 復旧後の設定

Windows側の `~/.ssh/config`：

```plain text
Host 192.168.0.xxx macbook.local macbook
  HostName macbook.local
  User macuser
  Port 22
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
```

Mac側の `~/.zshenv`：

```bash
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"
```

Codex DesktopのSSH接続設定：

```plain text
表示名: macbook.local
ホスト名: macbook.local
SSHポート: 22
認証方式: 秘密鍵ファイル
秘密鍵: C:\Users\winuser\.ssh\id_ed25519
```

## SSH成功の先にあるもの

今回もっとも判断を迷わせたのは、PowerShellからのSSH接続が早い段階で成功したことだった。
その結果を見れば、Codex Desktop側だけを疑いたくなる。

しかし、Codex DesktopはSSHを入口として使い、その先でMac側のCodexを起動する。
入口を通過できても、奥で起動したプロセスが落ちれば接続は終わる。

`socket hang up` を解いたのは、SSH設定を何度も書き換えることではなかった。
Mac側に残っていた一行の `ENOENT` だった。