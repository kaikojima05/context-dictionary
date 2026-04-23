# context-dictionary API Reference

Base URL: `http://localhost:3210`

---

## Entries

### POST /api/entries

日記エントリを作成する。

**Request Body**

| Field | Type | Required | Description |
|---|---|---|---|
| agent | string (max 50) | Yes | Agent 名 (`claude-code`, `copilot-cli`, `codex` 等) |
| summary | string | Yes | セッションの要約 (1-3文) |
| sessionId | string (max 100) | No | セッション識別ID |
| learnings | string[] | No | 学んだことのリスト |
| decisions | Decision[] | No | 意思決定のリスト |
| context | object | No | 任意のメタデータ (repo, branch, files 等) |
| mood | string (max 20) | No | `productive`, `stuck`, `exploratory`, `debugging` |
| tags | string[] | No | タグ名のリスト (存在しないタグは自動作成) |
| followUps | string[] | No | フォローアップ項目のリスト |

**Decision 型**

```json
{ "decision": "string", "rationale": "string" }
```

**Example**

```bash
curl -X POST http://localhost:3210/api/entries \
  -H 'Content-Type: application/json' \
  -d '{
    "agent": "claude-code",
    "summary": "認証モジュールをJWTに移行した",
    "learnings": ["Fastify には @fastify/jwt がある"],
    "decisions": [{"decision": "JWT に移行", "rationale": "API クライアントが Cookie を保持できないため"}],
    "tags": ["auth", "refactor"],
    "mood": "productive",
    "context": {"repo": "my-app", "branch": "feat/jwt"}
  }'
```

**Response** `201 Created`

```json
{
  "id": 1,
  "agent": "claude-code",
  "sessionId": null,
  "summary": "認証モジュールをJWTに移行した",
  "learnings": ["Fastify には @fastify/jwt がある"],
  "decisions": [{"decision": "JWT に移行", "rationale": "API クライアントが Cookie を保持でき��いため"}],
  "context": {"repo": "my-app", "branch": "feat/jwt"},
  "mood": "productive",
  "createdAt": "2026-04-22T04:45:20.559Z",
  "updatedAt": "2026-04-22T04:45:20.559Z",
  "tags": [
    {"entryId": 1, "tagId": 1, "tag": {"id": 1, "name": "auth"}},
    {"entryId": 1, "tagId": 2, "tag": {"id": 2, "name": "refactor"}}
  ],
  "followUps": []
}
```

---

### GET /api/entries

エントリ一覧を取得する。新しい順。

**Query Parameters**

| Param | Type | Default | Description |
|---|---|---|---|
| agent | string | - | Agent 名でフィルタ |
| tag | string | - | タグ名でフィルタ |
| from | string (ISO 8601) | - | この日時以降のエントリ |
| to | string (ISO 8601) | - | この日時以前のエントリ |
| q | string | - | summary の部分一致検索 |
| limit | number | 20 | 取得件数 |
| offset | number | 0 | スキップ件数 |

**Example**

```bash
# claude-code のエントリを5件取得
curl "http://localhost:3210/api/entries?agent=claude-code&limit=5"

# タグ "refactor" でフィルタ
curl "http://localhost:3210/api/entries?tag=refactor"

# 日付範囲で絞り込み
curl "http://localhost:3210/api/entries?from=2026-04-01&to=2026-04-30"
```

**Response** `200 OK` — Entry の配列

---

### GET /api/entries/:id

単一エントリを取得する。

**Example**

```bash
curl http://localhost:3210/api/entries/1
```

**Response** `200 OK` — Entry オブジェクト
**Error** `404 Not Found` — `{"error": "Entry not found"}`

---

### PATCH /api/entries/:id

エントリを更新する。送信したフィールドのみ更新される。`tags` を送信した場合、既存のタグ関連付けは全て削除され、新しいタグで置き換えられる。

**Request Body** — POST /api/entries と同じフィールド (全て optional)

**Example**

```bash
curl -X PATCH http://localhost:3210/api/entries/1 \
  -H 'Content-Type: application/json' \
  -d '{"mood": "debugging", "tags": ["auth", "bugfix"]}'
```

**Response** `200 OK` — 更新後の Entry オブジェクト

---

## Follow-ups

### POST /api/entries/:id/follow-ups

エントリにフォローアップ項目を追加する。

**Request Body**

| Field | Type | Required | Description |
|---|---|---|---|
| content | string | Yes | フォローアップ内容 |

**Example**

```bash
curl -X POST http://localhost:3210/api/entries/1/follow-ups \
  -H 'Content-Type: application/json' \
  -d '{"content": "リフレッシュトークンの有効期限を確認する"}'
```

**Response** `200 OK`

```json
{
  "id": 1,
  "entryId": 1,
  "content": "リフレッシュトークンの有効期限を確認する",
  "resolved": false,
  "createdAt": "2026-04-22T05:00:00.000Z"
}
```

---

### PATCH /api/follow-ups/:id

フォローアップの解決状態を更新する。

**Request Body**

| Field | Type | Required | Description |
|---|---|---|---|
| resolved | boolean | Yes | 解決済みかどうか |

**Example**

```bash
curl -X PATCH http://localhost:3210/api/follow-ups/1 \
  -H 'Content-Type: application/json' \
  -d '{"resolved": true}'
```

**Response** `200 OK` — 更新後の FollowUp オブジェクト

---

## Tags

### GET /api/tags

全タグを使用回数付きで取得する。名前昇順。

**Example**

```bash
curl http://localhost:3210/api/tags
```

**Response** `200 OK`

```json
[
  {"id": 1, "name": "auth", "count": 3},
  {"id": 2, "name": "docker", "count": 1},
  {"id": 3, "name": "refactor", "count": 2}
]
```

---

## Search

### GET /api/search

summary に対する全文検索 (MySQL FULLTEXT)。

**Query Parameters**

| Param | Type | Required | Description |
|---|---|---|---|
| q | string | Yes | 検索クエリ |

**Example**

```bash
curl "http://localhost:3210/api/search?q=JWT"
```

**Response** `200 OK` — Entry の配列
**Error** `400 Bad Request` �� `{"error": "Query parameter 'q' is required"}`

---

## Health Check

### GET /health

サーバーの生存確認。

```bash
curl http://localhost:3210/health
```

**Response** `200 OK` — `{"status": "ok"}`
