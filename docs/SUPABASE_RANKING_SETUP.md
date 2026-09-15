# Supabaseランキング連携確認

確認日: 2026-09-15

## 現在の確認結果

- Supabaseプロジェクト: `chameleonJP-Lab`
- 既存の公開ランキングゲーム: `sainome_300_seconds`（サイノメ）
- `saisupi`: `public.games`に登録済み（有効）
- 登録内容: `score_order=asc`、`score_unit=秒`、`score_scale=100`、`score_decimals=2`、`top_ranking_type=best`、`submission_mode=shared`、`score_min=0`、指定どおりの3行の`share_text`
- 既存RPC: `record_game_play`、`submit_score`、`get_best_score_ranking`

サイスピ側は、公開キーで`public.games`の`saisupi`登録を読み取り、登録がない間は「オンラインランキングは準備中です」と表示する。登録後は、プレイ開始時に`record_game_play`、完走時に`submit_score`、結果画面で`get_best_score_ranking`を呼ぶ。サイノメの行やデータは読み替えない。

## 今回確認したこと

- `public.games`へサイスピ用のゲームID `saisupi`を登録した。既存の表示順と重ならない表示順を使い、サイノメの行は変更していない。
- `share_text`には、ゲーム名・ゲーム説明・URLをそれぞれ独立した行で登録した。URLをラベルやハッシュタグへ変換していない。
- `public.games`の登録を公開用キーで読み取り、HTTP 200と有効な登録内容を確認した。
- 一時的な検証名で`record_game_play`を1回、`submit_score`へ`12345`（123.45秒）を1回、`get_best_score_ranking`を1回呼び、すべて成功した。
- 検証用に作られたプレイヤー、スコア、開始イベント、スコア実績を確認後に削除し、サイスピのスコア行は0件へ戻した。
- `public.games`の有効行ポリシーと、3RPCの`anon`/`authenticated`向け実行権限を確認した。既存の共有ランキング関数や他ゲームのセキュリティ助言は変更していない。

## 残る確認

ランキング連携の実通信は確認済みだが、結果画面を含む一連の操作をiPhone 17 Pro Safariで確認する作業は残っている。また、通信断後の再送や同一プレイの重複送信は、今回の登録確認とは別の受入検査として扱う。
