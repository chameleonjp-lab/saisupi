# サイスピ 共通仕様対応記録（2026-10-31）

## 対象と参照版

実験場が現在読むSupabase `games` の登録行で `is_active=true` とゲームURLを確認し、そのURLのHTTP200/タイトルを確認した。固定fallback一覧だけでは判定していない。今回対象 `saisupi`。公開URL: https://chameleonjp-lab.github.io/saisupi/

ランキング詳細: https://chameleonjp-lab.github.io/chameleonjp_lab/ranking.html?game=saisupi

着手時GitHub公開ブランチ `main`、SHA `aaaf8a9d48021eb202caae01105b8a028677db23`。進行中のopen PRは着手時およびPR作成前のAPI読取りで0件。ブランチ保護APIは403で詳細未確認、rulesetsの読取りは空。保護・環境・登録フラグは変更していない。Codebergからの導線切替は今回行わない（現在登録されたGitHub公開URLを維持）。

多言語基準: Sainome `79b1e5733e725cd1148b10fa5699ba846e2bf57d` / `js/language-options.js` の言語選択肢: ja,en,es,pt-BR,zh-Hans,fr,de,ko,ru,it,zh-Hant,id,tr,vi,th。

## 実装

15言語の本文・操作・動的表示・通信失敗・共有文と保存する言語選択を実装。ホーム名を任意にし、名前とsubmission UUID/clientVersionをプレイに固定。名あり完走だけを新しい冪等ラッパーで送信する。名前なし・リタイアも上位30名を閲覧できる。失敗結果はUUIDごとのキーに保存し、後続プレイや別タブの操作で上書きせず、ホームの未送信結果ボタンから元の内容で再試行できる。X共有、正式URL、音量/ミュート保存、未初期化音声の破棄時の例外、短い画面の音設定導線も改善した。

## 対応表

| 共通仕様 | 状態 | 根拠・残り |
|---|---|---|
|1 対象判定|既存確認済み|現行登録行と公開HTMLを別々に確認。|
|2 既存仕様/記録|既存で維持|採点・時間・難易度・ゲームslug・保存済みデータを初期化しない。|
|3 正式URL/移行|既存URL維持|登録されたGitHub Pagesを正式URLとして使用。Codeberg側の新規公開/切替なし。別origin保存の移行完了は主張しない。|
|4 多言語|今回実装・自然さ未確認|108キー×15言語。保存設定優先→ブラウザ言語→英語。言語IDと地域表示形式を分離。サイコロの数値問題・10個の目標・時間・正解・配点を維持し、言語変更ではゲーム状態や目標を変更しない。母語話者確認は未実施。|
|5 名前/送信|今回実装・DB適用待ち|任意名・開始名/版/UUID固定・結果別永続キュー。既存record_game_playは名前あり開始時の単回試行を維持し、匿名開始へ流用しない。submit_score_once_shared_v1が必要。名前による本人同一性は未解決。|
|6 ランキング|今回実装・本人同一性未完了|短い順/0.01秒/自己ベストの既存サーバー集計30名。空・読込・失敗・再試行を分け、rank_noを保持。名前なしとリタイアも閲覧可。詳細URLはホーム/結果とも?game=saisupi。|
|7 X共有|今回実装|ホーム紹介と今回結果を分離。X投稿確定は利用者。黒/白、コピーまたは選択可能な代替。未翻訳言語は§4。|
|8 効果音|既存確認/今回補修|下記イベント表。実際の聞こえ方は未確認。|
|9 音初期/保存|今回実装|初回on、既存offと0尊重。実機復帰/音質は未確認。|
|10 文言/UI|今回実装・一部未確認|公開説明、共有/ランキングラベルと操作サイズ。iPhone17 Pro実機は未確認。|
|11 継続公開|今回実装・本番未確認|PRは検証のみ。保護を維持し、公開ブランチの検証済み成果物のみ公開。下記設定手順。|
|12 検証|今回実施・一部未完了|下記ログ要約。母語話者・実音・実機・マージ後公開は未実施。|
|13 PR/記録|今回作成|ゲーム別Draft PR。未完了を対象外に分類しない。|

## 記録とランキング契約

```json
[
  {
    "game_slug": "saisupi",
    "title": "サイスピ",
    "game_url": "https://chameleonjp-lab.github.io/saisupi/",
    "is_active": true,
    "release_date": "2026-09-15",
    "score_order": "asc",
    "score_scale": 100,
    "score_decimals": 2,
    "score_unit": "秒",
    "top_ranking_type": "best",
    "submission_mode": "shared"
  }
]
```

サーバーの既存参加者は表示名で識別される。このままでは同名の別人を区別できず、改名で同じ参加者を保つことも保証できない。今回データを削除/再構築したり、全記録を新しい参加者へ割り当て直したりしない。別途、安定したparticipant IDと旧記録の所有確認/移行方式が必要。上位30名の厳密な「本人単位」の達成はこの制約が残る。API集計と詳細ランキングの既存名前単位集計は一致させる。表示名や上位一覧から圏外順位/全人数を推測しない。

## 効果音対応表

| 対象イベント/役割 | 条件・重複防止・箇所 |
|---|---|
|実在するゲームイベント|既存 js/saisupi-sound-effects.js のflick（操作受付）、roll（サイコロ回転）、clear（目標完了）の生成音、ノード解放・保存済みoff・復帰制御を維持。今回、初回音量1（既存gain0.42を維持）のスライダー、保存済み0とoffの維持、未初期化disposeのnull保護を追加。|
|無音時|視覚の判定・得点・状態表示を維持。音成功を開始条件にしない。|
|実音検証|自動テストは発音呼出/ノード/保存値を確認する範囲。スピーカーでの音量/音質・iPhone復帰は未確認。|

## 検証

node test61件、構文検査、許可リスト配信パッケージを実行。Chromium/WebKitで15言語すべてのUI・共有・匿名/空白・開始名固定・名前消去後の過去結果・応答喪失・複数失敗結果・1件だけack・リロード復元・同点30名・X・音off/0・言語保存をmock通信で確認した。このUI試験では描画器をfixtureへ置換している。

別の実3D試験では、CDNと同一のThree.js0.185.1をローカル配信し、Chromium/WebKit両方で実際の盤面生成、匿名開始、方向操作、サイコロへの登り/上昇、10目標の生成、言語変更で目標/位置/時計を戻さないこと、リタイアを確認した。端末実機Safariではない。

音声終了時のnull例外、固定UUID/version、2件の失敗結果、別タブの新規保存とackの交差、旧キュー配列を変えずにackする挙動を回帰試験に追加。独立レビューの指摘からキューをUUIDごとのキーに修正した。

本番ランキングへ試験スコアを書いていない。ブラウザ検証はmock/ローカルページを使用し、幅変更・WebKitを実機Safari確認と混同しない。未実施の全言語自然さ、iPhone17 Pro Safariの縦横/ソフトキーボード/ブラウザバー/画面ロック復帰、実音、マージ後の公開確認は残る。

## 適用順・公開後確認・切戻し

GitHub Pages Source は `GitHub Actions`（workflow）をAPIで確認。

**先行DB適用が必要**: [実験場PR43](https://github.com/chameleonjp-lab/chameleonjp_lab/pull/43) の `docs/chameleonjp-lab/18_common_score_receipts.md` に従い、`submit_score_once_shared_v1` のSQLを適用し、関数/権限/読戻しを確認する。このPRだけではDBへ適用されない。新RPC失敗時に旧submit_scoreへ戻すフォールバックは入れていない（応答喪失後の重複を避けるため）。適用/本番読戻しは未実施。この依存確認前に本ゲームPRをマージしない。

1. 先行DB適用の読戻しとPR差分/CIを確認し、ユーザーが `main` へマージする。直接push/自動マージはしない。
2. マージコミットの検証/ビルド/公開が成功したことと、公開URLの共有ラベル・ランキング詳細導線・今回の変更を確認する。PR段階の成功を本番公開済みとは扱わない。
3. iPhoneで名前空欄→開始→結果→ランキング、名前変更後の次プレイ、Xをキャンセルして復帰、音オフ/0→再読み込み、縦横とキーボード表示を短く確認する。実データへの多数の試験登録は避ける。
4. 問題があればこのPRをrevertする新PRを作成し通常の検証/マージで戻す。DB行/設定/自己ベストを消さない。Pages設定を変更した場合は元の `workflow` / `main` 設定と既存公開artifactを記録して戻す。元の実行が新しい公開を後から上書きしないよう、古い実行を再実行しない。

現時点: **実装・ローカル検証済みの範囲と未完了を上記に区別 / ユーザーのマージ待ち / 必要な設定と権限は上記 / 本番公開後確認待ち**。共通仕様全体の完了報告ではない。

### 保存キーと移行

既存 `saisupi:sound-enabled:v1` を維持。新規 `saisupi:sound-volume:v1`、`saisupi.language.v1`、`saisupi.player-name.v1` を分離。最後に表示する結果は `saisupi.pending-result.v1`、未送信結果は `saisupi.pending-submissions.v1:<UUID>`。runのclientVersionは保存時点の値を再送にも使い、再読み込み後の新しい版へ置換しない。旧配列キーがある場合は保持し、ackをUUID別に記録する。未知の形式や書込失敗は元データを破棄せず、現在の結果を画面に保つ。新規無料サービスや有料素材は追加していない。

### 再現コマンド

`npm ci && npm test && npm run check:syntax`、`npx playwright install --with-deps chromium webkit`、`npm run test:browser`、`PW_BROWSER=webkit npm run test:browser`、`npm run test:browser:real`、`PW_BROWSER=webkit npm run test:browser:real`。実データを書かないfixtures/ローカル配信のみ。

不正/欠落したスコア応答でも送信UUIDを消費せず、同じ名前・点数・clientVersion・UUIDで再試行できる回帰テストを追加した。エラーは結果画面と未送信一覧に保持し、成功したとみなさない。
