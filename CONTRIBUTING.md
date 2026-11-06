# 開発・引き継ぎ手順

## 初めて使う端末

GitとNode.js 24系（npm付属）を用意する。現在は追加依存がないため `npm install` は不要。macOS・Linux・Windowsで同じnpmコマンドを使う。端末間の実コントローラー・音声・描画性能は個別に確認する。

```sh
git clone https://github.com/atsu-chai/drone_Simulator.git
cd drone_Simulator
node --version
npm run setup
npm test
npm run check
npm start
```

Node.jsのバージョン管理にnvmを使っている場合は、clone後に `nvm install` と `nvm use` で `.nvmrc` の24系を選べる。nvmは必須ではない。

ブラウザで `http://localhost:8000/` を開く。練習メニューは `/practice.html`、教材は `/learn.html`。Three.jsをCDNから読み込むためネットワーク接続が必要。Node.jsのSQLiteに関するExperimentalWarningが出る環境がある。

`npm run setup` は `.env` を作る。既存ファイルは保持する。ポートを変更する場合は `.env` の `PORT` と `APP_ORIGIN` を揃える。外部から設定した環境変数は `.env` より優先される。変更後はサーバーを再起動する。

ローカルで全科目を確認するだけなら `npm run dev` を使う。ログイン不要でキーボード操作もONになる。localhost以外のAPP_ORIGIN、販売設定、Stripeキーのいずれかがあると起動しない。

登録と利用権の動作を確認する場合は `npm start` を使い、登録後に別ターミナルで次を実行する（メールアドレスは登録した検証アカウントへ置き換える）。

```sh
node server/admin.js grant participant@example.com 45
```

見本飛行の閲覧は登録不要。コントローラーなしの操作確認は画面の開発者モードを使う。実機検証とは分けて記録する。

## 作業の開始と終了

開始前に `git status` を確認する。作業途中なら、先にその作業をコミットするか、別チェックアウトへ分ける。以下は変更のない作業ディレクトリで行う。

```sh
git switch main
git pull --ff-only origin main
git switch -c codex/my-task
```

`--ff-only` が失敗した場合は、ローカルとGitHubの履歴が分かれている。差分を確認して統合し、強制pushや `reset --hard` で消さない。同時に使うAI・端末ごとに作業ブランチと作業ディレクトリを分ける。

変更後は `npm test`、`npm run check`、`git diff --check` を実行する。画面を変えた場合はブラウザで操作確認する。`docs/handoff.md` と必要な判断・状態の記録も更新してから送信する。

```sh
git diff
git add <今回変更したファイル>
git commit -m "変更の目的を記載"
git push -u origin codex/my-task
```

`<今回変更したファイル>` は対象の実ファイル名へ置き換える。GitHubでmain向けのPull Requestを作り、差分と検証結果を確認して統合する。作業の継続は同じブランチで行い、既存ブランチ名を毎回新規作成しない。

別端末で未統合の作業を再開する場合：

```sh
git fetch origin
git switch --track origin/codex/my-task
```

初回だけ `--track` を使う。既にローカルにあるブランチは `git switch codex/my-task` と `git pull --ff-only` で更新する。未pushの変更は別端末に届かない。

## AIに渡す開始文

```text
このリポジトリのAGENTS.mdを読み、案内された資料を確認してください。
docs/handoff.mdで現在地・未検証事項・次の候補を把握し、
git statusと差分を確認してから、今回の依頼を進めてください。
終了時には引き継ぎ資料と判断記録を更新し、検証結果を残してください。
今回の依頼：［ここに作業内容を書く］
```

AIがリポジトリを読めない場合は、AGENTS.mdとリンク先の必要な資料を明示的に渡す。会話履歴は自動共有されない。機能追加・不具合はGitHub Issuesへ、採用した方針と理由は `docs/decisions.md` へ残す。

## GitHubで共有するもの・端末に残るもの

GitHubにはコード・設定例・仕様・判断・検証記録・空の運営テンプレートを保存する。`.env`、`.data/` のDB、秘密鍵、記入済みの個人情報は保存しない。

新しい端末のDBは空から始まる。ブラウザの履歴・校正は端末のlocalStorageに保存され、GitHubでは同期されない。必要な飛行ログは画面からJSON出力し、コントローラーは新端末で校正する。会員データ等の移行が必要な場合は、Gitとは別にアクセスを制限したバックアップ手順を用意する。

## つまずいた場合

- 起動時に `EADDRINUSE`：既存サーバーを終了するか、PORTとAPP_ORIGINを揃えて別ポートにする。
- 登録などが403：APP_ORIGINとブラウザのURLが一致しているか確認する。
- 3D画面が読み込めない：ブラウザのコンソールとネットワークでCDN・アセットを確認する。
- 設定を変えても反映されない：`.env` を確認してサーバーを再起動し、シェル側の環境変数による上書きも確認する。
- GitHubへのpushで認証エラー：その端末でGitHubの書き込み権限を持つアカウントのGit認証を設定する。トークンをリポジトリやチャットへ保存しない。
