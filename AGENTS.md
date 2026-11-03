# AI開発ガイド

リポジトリ：https://github.com/atsu-chai/drone_Simulator

## 開始時に読む

1. [README](README.md)：目的・起動方法。
2. [引き継ぎ](docs/handoff.md)：現在地・次の作業・直近の確認。
3. [判断記録](docs/decisions.md)：方針とその理由。
4. [実装・検証状況](docs/implementation-status.md)：実装済みと未検証事項。
5. 作業に関係する資料。表示は `docs/visual-verification.md`、入力は `docs/controller-verification.md`、公式対応は `docs/official-mapping.md`。

このファイルを自動で読まないAIには、開始時に明示的に読ませる。チャット履歴・個人のメモリ・特定端末のツールは前提にしない。

## 開発と確認

- 推奨Node.jsは24系（`.nvmrc`）。追加のnpmパッケージは不要。
- 初回：`npm run setup`。起動：`npm start`。
- 変更後：`npm test`、`npm run check`、`git diff --check`。
- UI・描画の変更はブラウザでも対象操作を確認する。サイズ比較は `tests/manual/README.md` を参照。
- `git status` と差分を確認してから編集し、他者の未コミット変更を上書きしない。
- 作業単位で `codex/…` 等の専用ブランチを作り、並行作業は別チェックアウトまたはworktreeに分ける。

## 守る方針

- Node.js標準機能と素のJavaScriptを使う。フレームワーク移行や新規依存の追加は目的・必要性を説明する。
- 入力・物理・科目進行・練習評価・表示の境界を保つ。コース定義は `src/course-layout.js` を共有する。
- 見本飛行は手順説明のアニメーション。実操縦・物理検証・採点結果と混同しない。
- 公式合否や実機との一致を保証しない。実装済み、自動検証、画面確認、実機確認を分けて記録する。
- `.env`、`.data/`、秘密鍵、個人情報をコミットしない。設定例は `.env.example` へ記載する。
- 販売停止を維持する。公開・販売の条件は `operations/launch-readiness.json` と `docs/billing-setup.md` を参照。

## 終了時に残す

- `docs/handoff.md` の現在地・次の作業・検証結果を更新する。未完了なら再開地点も書く。
- 方針や仕様判断を変えたら `docs/decisions.md` に理由を残す。案・採用済み・未確認を区別する。
- 機能の状態が変わったら `docs/implementation-status.md` と関連資料を更新する。
- コードと資料を同じ作業単位でコミットする。検証は実行日・コマンド・結果・限界を記録する。
- GitHubへ送信して初めて他端末が取得できる。未pushなら引き継ぎと最終報告に明示する。
