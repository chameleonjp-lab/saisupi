# 計測と計画用検証の資料

作成日: 2026-09-14

[実装計画書](../IMPLEMENTATION_PLAN.md) / [受入検査](../ACCEPTANCE_TESTS.md)

## 1. 時計の根拠と限界

W3CのHigh Resolution Timeは、システム時計の調整で逆行しない時計と `performance.now()` を説明している。一方で、公開される時間分解能はプライバシーや安全性のために制限される場合があり、絶対的な測定精度を一律保証するものではない。

また、時計の原点はページや実行環境に関係する。前のページで保存した `performance.now()` の値を、再読み込み後の値と直接比較する設計にしない。

出典: [High Resolution Time](https://www.w3.org/TR/hr-time-3/)、調査時の[2026-09-01 Working Draft](https://www.w3.org/TR/2026/WD-hr-time-3-20260901/)。作業草案であることを含めて記録し、確定した最終仕様と表記しない。

本作の方針は同じ時計で開始と終了を採り、その差を保持することである。0.01秒は記録・表示の単位であり、端末の入力遅延や画面表示の誤差まで0.01秒以下になるとの保証ではない。

## 2. 0.01秒の実装案の境界例

端数切捨てはユーザーが指定した丸め方ではなく、採用確認が必要な案である。以下の整数ミリ秒の8例について、計画用に `elapsedMs // 10` を実行して期待値と一致することを確認した。

| 経過ミリ秒 | 0.01秒単位整数 | 表示 |
|---:|---:|---|
| 0 | 0 | 0.00秒 |
| 9 | 0 | 0.00秒 |
| 10 | 1 | 0.01秒 |
| 19 | 1 | 0.01秒 |
| 12349 | 1234 | 12.34秒 |
| 12350 | 1235 | 12.35秒 |
| 99999 | 9999 | 99.99秒 |
| 100000 | 10000 | 100.00秒 |

変換関数の0表示が正しいことと、0の値を正式な完走スコアとして受け付けることは別である。正式記録には開始・10目標の達成・正常終了・正の値が必要になる。

JavaScriptの実装時には小数ミリ秒、境界の直前直後、不正値も追加検査する。本表の成功をブラウザの時計や実ゲームの計測成功とは呼ばない。

## 3. 配置案Aの到達可能性

### 条件

元の `dice.js` の面更新規則を転記した独立した参照モデルを使った。盤面は7×7で障害物なし。開始位置は `(3,3)`、開始姿勢は `(上,下,前,後,左,右)=(1,6,2,5,3,4)`。盤外への移動は許可しない。

探索状態は位置と6面の組である。初期状態から上下左右へ1マスずつ転がすすべての状態を、未訪問のものから順に調べた。配置案Aの10座標について、上面に1〜6のすべてが現れるかを確認した。

### 実行結果

| 項目 | 結果 |
|---|---|
| 到達できた位置・姿勢の組 | 588 |
| 探索中に現れた姿勢の種類 | 24 |
| 配置案の重複・範囲・中央との重なり | 不正なし |
| 10座標×上面6種 | 60条件すべて到達可能 |
| 上下往復・左右往復 | 元の姿勢へ戻る |
| 対面の合計 | 探索した姿勢で7を維持 |

588はこの開始状態から到達できる組の数である。7×7×24の全組へ到達するという意味ではない。

移動が逆方向へ戻せ、目標の達成が床をふさがず姿勢も変えない前提では、一つ達成した後にも同じ連結した状態集合を移動できる。したがって、この配置案ではどの目の組でも各目標を順次達成できる。これはこの参照モデルと上記前提に基づく推論であり、新作の実装を検査した結果ではない。

### 再現用の参照コード

以下は文書内の計画検証用コードであり、アプリへ組み込むファイルではない。元コードの転記誤りは実装検査で独立に照合する。

```python
from collections import deque

BASE = (1, 6, 2, 5, 3, 4)
DELTAS = {
    'up': (-1, 0), 'down': (1, 0),
    'left': (0, -1), 'right': (0, 1),
}
TARGETS = [
    (1, 1), (1, 3), (1, 5), (2, 2), (2, 4),
    (4, 2), (4, 4), (5, 1), (5, 3), (5, 5),
]

def roll(orientation, direction):
    top, bottom, front, back, left, right = orientation
    return {
        'up': (front, back, bottom, top, left, right),
        'down': (back, front, top, bottom, left, right),
        'left': (right, left, front, back, top, bottom),
        'right': (left, right, front, back, bottom, top),
    }[direction]

start = (3, 3, BASE)
seen = {start}
queue = deque([start])
while queue:
    row, column, orientation = queue.popleft()
    for direction, (dr, dc) in DELTAS.items():
        nr, nc = row + dr, column + dc
        if not (0 <= nr < 7 and 0 <= nc < 7):
            continue
        state = (nr, nc, roll(orientation, direction))
        if state not in seen:
            seen.add(state)
            queue.append(state)

assert len(TARGETS) == len(set(TARGETS)) == 10
assert (3, 3) not in TARGETS
for cell in TARGETS:
    values = {o[0] for r, c, o in seen if (r, c) == cell}
    assert values == set(range(1, 7))

orientations = {state[2] for state in seen}
for orientation in orientations:
    assert sorted(orientation) == [1, 2, 3, 4, 5, 6]
    assert orientation[0] + orientation[1] == 7
    assert orientation[2] + orientation[3] == 7
    assert orientation[4] + orientation[5] == 7
    assert roll(roll(orientation, 'up'), 'down') == orientation
    assert roll(roll(orientation, 'left'), 'right') == orientation

print(len(seen), len(orientations))  # 588 24
```

面の更新規則の出典: [サイノメ dice.js](https://github.com/chameleonjp-lab/sainome/blob/2103b8a91f214fc8698d119113417d5360f990f0/js/dice.js)。

## 4. この調査でまだ分からないこと

固定10目標の最短巡回手数、目の分布ごとの難易度差、人間の適切なクリア時間、iPhoneでの入力・描画の遅れは未測定である。前の会話の別条件の最短手数を流用しない。

この段階で実行したのは参照モデルと端数の例だけである。ゲームの初期化、上昇イベント、実際の6面表示、保存、ランキング、連続再戦、画面離脱は今後の実装検査で確認する。
