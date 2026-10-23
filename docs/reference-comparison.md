# 参照動画と0.6.3の照合記録

2026-10-23。対象は [ユーザー指定動画](https://www.youtube.com/watch?v=m9S5KuPaczU)（山とドローン日記、5分31秒）と本実装。動画をブラウザで開き、下記時刻の画面を再確認した。比較用画面は資料検証の記録であり、商品用の素材として使用しない。

## 映像表現と手順

| 対象 | 今回確認した参照場面 | 本実装の証拠・相違 |
|---|---|---|
| スクエア | [1:06](screenshots/reference-audit/reference-square-66s.png)：コーン、H、黄・赤区画、直線と機首の説明 | course-layout.js共通定義、route-visibility/square-*-sheet.png。公式図との対応はofficial-mapping.md。識別子はユーザー指定に合わせコーン本体にも記載。Hは四角い着陸パッド |
| 8の字 | [2:45](screenshots/reference-audit/reference-eight-165s.png)：左右2円と中央H。 [3:18](screenshots/reference-audit/reference-pilot-198s.png)：操縦者の視点 | 中央H、半径2.5m、2周、接線方向の機首。今回、各円の間の1秒停止を発見して除去。始終のみ加減速し、交差点は連続通過 |
| 異常事態 | [4:25](screenshots/reference-audit/reference-abnormal-265s.png)：前方機首で離陸。[4:58](screenshots/reference-audit/reference-lateral-298s.png)：側方移動。[5:18](screenshots/reference-audit/reference-emergency-318s.png)：異常・緊急着陸の説明 | 前方機首固定、側方往復、緊急時停止、高度維持でHへ最短帰還、その後降下。古い動画の手順を丸ごと転載せず、現行資料の指定着陸地点への移動を優先 |
| 分かりやすさ | 場面ごとの短い説明、白い機体・影、視点変更 | 主視点3種、区画色・経路・寸法・字幕。拡大枠は同じ機体の姿勢と機首を表示。文字の重なりを除去。陰影の完全な写実再現や同一のカメラ編集は目標として主張しない |
| 操作と反復 | 参照は解説映像 | 本実装は見本に加えて操縦・弱点・履歴を提供。見本と実操作の採点を分離。入力装置の実機検証は未完了 |

現行手順の根拠：[国土交通省の二等実地試験資料](https://www.mlit.go.jp/koku/content/001971375.pdf)、2026年6月5日適用版の印刷頁14–15（図は16–17）。ローカルで取得済みの本文と図を確認。8の字は連続2周、異常事態は宣言後その場でホバリングし、次の着陸指示後に高度維持で指定地点まで最短移動する。この文書は公式の合否判定を保証しない。

## 到達条件の監査

基準はreference-video-target.mdの8項目。存在するテスト名だけで完了とせず、対象範囲を確認した。

| 条件 | 現在の証拠 | 判定と限界 |
|---|---|---|
| 1 コース・H・コーン・操縦者 | course-layout.js / course-scene.js、公式PDFの図の目視、course-layout.test.js | ソフトウェア上の共通配置と寸法を確認。実会場との一致を保証しない |
| 2 区画・経路・寸法・機首 | visual-verification.md、114場面の一覧、拡大枠の36場面 | 旧版1280×720に加え、0.6.5では941×724／主画面581×724の27場面を確認。全OS・全画面サイズの証明ではない |
| 3 主視点3種 | 同記録のpilot / overview / top画像、視点切替の操作 | 切替と固定操縦者位置を確認 |
| 4 解説見本と練習の分離 | demonstration.js、app.js updatePresentation、course-layout.test.js、[0.6.3連続再生画像](screenshots/reference-audit/full-complete-063.png) | 字幕・再生・停止・シーク・速度・終了を確認。音声合成の品質・全端末の音声出力は未評価 |
| 5 実操作の科目進行 | physical-course.test.js、mission.test.js、safety.test.js、coaching.test.js、共通物理／描画フレームの完走と負例 | ソフトウェアの正しい順序・接地・区画・時間超過・逆走等を確認。実機操縦特性との一致や公式合格判定は未評価 |
| 6 入力と停止 | controller.test.js、controller-verification.md、キーボード画面と合成Gamepad全科目完走 | **実コントローラー未接続。機種・接続・方向・校正・切断復帰の実機確認が残る** |
| 7 画像・完走・負例・時間刻み | 各検証文書、30/60描画フレームの本番蓄積処理、10回の物理通し完走 | 自動試験と指定ブラウザの証拠あり。任意PCでの描画性能の保証ではない |
| 8 横断比較 | この記録と上記の証拠 | 比較は実施したが、実機入力の不足を完成扱いにしない |

到達目標は継続中。現時点で示せるのは実装とソフトウェア検証の結果であり、対応コントローラー確定や利用者の合格実績ではない。
