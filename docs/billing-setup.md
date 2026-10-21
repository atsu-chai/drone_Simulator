# 決済と公開前の確認

Node.js 24以上。外部依存パッケージなし。ローカルは `npm start`、環境変数は `.env.example` を参照。`.env` を使う場合は `node --env-file=.env server/main.js`。標準は http://localhost:8000 。
サーバーはループバックに限定して待受ける。外部公開時はHTTPSリバースプロキシを使い APP_ORIGIN を公開元と完全一致させる。SQLite用の永続ディスクとバックアップが必要。静的ファイルのみの公開では課金・利用管理は動作しない。

## Stripe構成

[Checkout API](https://docs.stripe.com/api/checkout/sessions/create)、[Webhook](https://docs.stripe.com/webhooks)、[Subscription](https://docs.stripe.com/api/subscriptions/object)を参照。API版は2025-06-30.basilに固定。

- 月額JPY3,000と初回のみJPY7,000の2行をサブスクリプションCheckoutへ渡す。初回合計10,000円。再契約時も初回セットを課金する条件を表示。
- Checkoutの戻り先は権限付与に使わない。署名検証した通知からStripeの最新契約・最新請求書を再取得し、支払済み期間を更新する。
- `POST /api/webhook` に checkout.session.completed、customer.subscription.created/updated/deleted、invoice.paid、invoice.payment_failed を送信するsnapshotイベントを設定。
- 請求が未払いでも過去の支払済み期限を維持。期間終了後は全科目を停止。解約・カード変更はCustomer Portalを使用。
- Portalは期間末解約を設定し、プラン変更・数量変更・試用・クーポン等を無効化する。初期版で意図しない金額に変更できないことを確認。
- 本番販売前にカード決済、3Dセキュア、失敗、月末請求、解約、再契約、返金、重複・順不同通知、通知欠落時の復旧、バックアップ復元をStripeテスト環境で実施する。

鍵・公開先・Stripeアカウントが未提供のため、この作業では実決済・Stripeテスト環境との疎通は未実施。自動テストはプロバイダーの模擬応答で実施する。
返金・不審請求は運営がStripeで確認して対応する。自動返金とメール通知は未実装。

## API

- GET /api/status：匿名時も料金・販売可否を返す。ログイン時は本人の利用期限のみ追加。
- POST /api/register, /api/login：emailとpassword（12〜128文字）。HttpOnlyセッション。
- POST /api/logout：本人のセッションを破棄。
- POST /api/checkout：acceptTerms=true。開始条件・既契約を確認して外部決済URLを返す。
- POST /api/portal：本人の契約管理URLを返す。販売停止中も利用可能。
- POST /api/request：kind（monitor/support）、email、message、consent。運営受付DBへ保存。
- GET /src/premium-mission.js：有効な契約または検証利用期間を持つセッションのみ配信。教材はサンプルとして公開。

全POST（署名検証するwebhookを除く）はOriginを検証。パスワードはsalt付きscrypt、セッション値はハッシュ保存。入力サイズと試行回数を制限。カードは保存しない。サーバー・DB・秘密鍵・運営記録を静的配信しない。
クライアントに配信したシミュレーターはDRMではない。期限は開始前と30秒ごとに再確認する。払い戻し等の運営操作・資格の合否はこれとは別に管理する。

## 未完了の販売開始条件

販売者情報と最終利用条件、利用者への通知・本人確認と削除対応、対応機器の実測、監修、実機比較、実受験結果、Stripe実接続、運営環境の監視・復旧が必要。operations/launch-readiness.json は未完了のまま保持する。
