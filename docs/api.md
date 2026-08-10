# context-dictionary API Reference

Base URL: `http://localhost:3210`

---

## Insights

### POST /api/insights

知見を登録する。

**Request Body**

| Field | Type | Required | Description |
|---|---|---|---|
| type | string | Yes | `discovery`, `decision`, `solution`, `issue`, `caveat` |
| content | string | Yes | 知見の概要 |
| detail | string | No | 詳細な説明・手順・コード等 (最大16MB) |
| rationale | string | No | 判断理由・背景 |
| agent | string (max 50) | Yes | Agent 名 (`claude-code`, `copilot-cli` 等) |
| repo | string (max 200) | No | リポジトリ名 |
| branch | string (max 200) | No | ブランチ名 |
| sessionId | string (max 100) | No | セッション識別ID |
| version | positive integer | Response only | 楽観ロック用version。更新ごとに増加 |
| tags | string[] | No | タグ名のリスト (存在しないタグは自動作成) |
| followUps | string[] | No | フォローアップ項目のリスト |
| relations | Relation[] | No | 関連する知見へのリンク |

**type の種類**

| Type | 意味 | 例 |
|---|---|---|
| `discovery` | わかった事実・仕様 | 「Stripe API は webhook の再送を最大3日間行う」 |
| `decision` | 設計判断とその理由 | 「JWT に移行した（理由: API クライアントが Cookie を保持できない）」 |
| `solution` | 問題に対する解決方法 | 「N+1 問題を Prisma の include で解消した」 |
| `issue` | 構造的問題・後で対処すべきこと | 「認証ミドルウェアの責務が肥大化している」 |
| `caveat` | 注意点・ハマりどころ | 「MySQL の FULLTEXT は3文字未満の単語を無視する」 |

**Relation 型**

```json
{ "targetId": 1, "type": "relates_to" }
```

relation type: `relates_to`, `resolves`, `supersedes`

**Example**

```bash
curl -X POST http://localhost:3210/api/insights \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "discovery",
    "content": "Stripe API は webhook の再送を最大3日間行う",
    "agent": "claude-code",
    "repo": "billing-service",
    "branch": "feat/stripe-webhook",
    "tags": ["stripe", "webhook"]
  }'
```

**Response** `201 Created`

```json
{
  "id": 1,
  "type": "discovery",
  "content": "Stripe API は webhook の再送を最大3日間行う",
  "rationale": null,
  "agent": "claude-code",
  "repo": "billing-service",
  "branch": "feat/stripe-webhook",
  "sessionId": null,
  "createdAt": "2026-04-23T10:00:00.000Z",
  "updatedAt": "2026-04-23T10:00:00.000Z",
  "tags": [
    {"insightId": 1, "tagId": 1, "tag": {"id": 1, "name": "stripe"}},
    {"insightId": 1, "tagId": 2, "tag": {"id": 2, "name": "webhook"}}
  ],
  "followUps": [],
  "relationsAsSource": [],
  "relationsAsTarget": []
}
```

---

### POST /api/insights/bulk

複数の知見を一括登録する。

**Request Body** — `POST /api/insights` と同じ形式のオブジェクトの配列

**Example**

```bash
curl -X POST http://localhost:3210/api/insights/bulk \
  -H 'Content-Type: application/json' \
  -d '[
    {
      "type": "solution",
      "content": "N+1 問題を Prisma の include で解消した",
      "agent": "copilot-cli",
      "tags": ["performance", "prisma"]
    },
    {
      "type": "issue",
      "content": "認証ミドルウェアの責務が肥大化している",
      "agent": "copilot-cli",
      "tags": ["auth", "tech-debt"]
    }
  ]'
```

**Response** `201 Created` — Insight の配列

---

### GET /api/insights

知見一覧を取得する。新しい順。

**Query Parameters**

| Param | Type | Default | Description |
|---|---|---|---|
| agent | string | - | Agent 名でフィルタ |
| type | string | - | 知見タイプでフィルタ |
| tag | string | - | タグ名でフィルタ |
| repo | string | - | リポジトリ名でフィルタ |
| from | string (ISO 8601) | - | この日時以降 |
| to | string (ISO 8601) | - | この日時以前 |
| q | string | - | content の部分一致検索 |
| limit | number | 20 | 取得件数 |
| offset | number | 0 | スキップ件数 |

**Example**

```bash
# decision タイプの知見を取得
curl "http://localhost:3210/api/insights?type=decision&limit=10"

# タグ "auth" でフィルタ
curl "http://localhost:3210/api/insights?tag=auth"

# リポジトリで絞り込み
curl "http://localhost:3210/api/insights?repo=billing-service"
```

**Response** `200 OK` — Insight の配列

---

### GET /api/insights/:id

単一の知見を取得する。

**Response** `200 OK` — Insight オブジェクト (関連知見を含む)
**Error** `404 Not Found` — `{"error": "Insight not found"}`

---

### PATCH /api/insights/:id

知見を更新する。送信したフィールドのみ更新される。

**Request Body** — POST /api/insights と同じフィールド (全て optional)

**Response** `200 OK` — 更新後の Insight オブジェクト

RESTの既存PATCH契約は互換性のためlast-write-winsを維持する。MCPの`upsert`は明示IDと`expectedVersion`一致を必須とする。

---

## Follow-ups

### POST /api/insights/:id/follow-ups

知見にフォローアップ項目を追加する。

**Request Body**

| Field | Type | Required | Description |
|---|---|---|---|
| content | string | Yes | フォローアップ内容 |

**Response** `200 OK`

---

### PATCH /api/follow-ups/:id

フォローアップの解決状態を更新する。

**Request Body**

| Field | Type | Required | Description |
|---|---|---|---|
| resolved | boolean | Yes | 解決済みかどうか |

**Response** `200 OK` — 更新後の FollowUp オブジェクト

FollowUpには`updatedAt`と、解決時だけ`resolvedAt`が含まれる。再openすると`resolvedAt`は`null`へ戻る。

---

## Tags

### GET /api/tags

全タグを使用回数付きで取得する。名前昇順。

**Response** `200 OK`

```json
[
  {"id": 1, "name": "auth", "count": 3},
  {"id": 2, "name": "stripe", "count": 1}
]
```

---

## Search

### GET /api/search

content に対する全文検索 (MySQL FULLTEXT)。

**Query Parameters**

| Param | Type | Required | Description |
|---|---|---|---|
| q | string | Yes | 検索クエリ |
| type | string | No | 知見タイプでフィルタ |
| agent | string | No | Agent 名でフィルタ |

**Example**

```bash
curl "http://localhost:3210/api/search?q=webhook&type=discovery"
```

**Response** `200 OK` — Insight の配列

---

## Health Check

### GET /health

サーバーの生存確認。

**Response** `200 OK` — `{"status": "ok"}`
