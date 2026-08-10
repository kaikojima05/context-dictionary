# context-dictionary

CLI コーディングエージェント（Claude Code, Copilot CLI, Codex など）との作業セッションを構造化して記録・検索するためのシステム。

セッションごとの要約、学び、意思決定、フォローアップなどを REST API またはlocal stdio MCP経由で蓄積し、過去のコンテキストを素早く引き出せるようにする。

## 技術スタック

- **Runtime**: Node.js + TypeScript (ESM)
- **Server**: Fastify
- **ORM**: Prisma
- **DB**: MySQL 8.0 (Docker)
- **CLI**: Commander
- **MCP**: Model Context Protocol TypeScript SDK 1.30.0（stdio）

## セットアップ

### 前提条件

- Docker / Docker Compose

### 起動

```bash
# MySQL + API サーバーをまとめて起動
docker compose up -d

# 初回のみ: マイグレーション実行
docker compose exec app npx prisma migrate deploy
```

これだけで API サーバーが `http://localhost:3210` で立ち上がる。

### 停止

```bash
docker compose down
```

### DB クライアント

Sequel Ace などの GUI クライアントから `localhost:33060` に接続して確認できる。

### ローカル開発（コンテナ外で実行する場合）

コンテナを使わず直接実行したい場合は、`.env` の `DATABASE_URL` を確認した上で:

```bash
npm install
docker compose up -d mysql   # DB のみ起動
npx prisma generate
npx prisma migrate dev
npm run dev
```

## 使い方

### REST API

Base URL: `http://localhost:3210`

| メソッド | パス | 概要 |
|---|---|---|
| `POST` | `/api/insights` | Insight作成 |
| `GET` | `/api/insights` | Insight一覧（フィルタ・ページング対応） |
| `GET` | `/api/insights/:id` | Insight詳細 |
| `PATCH` | `/api/insights/:id` | Insight更新 |
| `POST` | `/api/insights/:id/follow-ups` | フォローアップ追加 |
| `PATCH` | `/api/follow-ups/:id` | フォローアップの解決状態更新 |
| `GET` | `/api/tags` | タグ一覧（使用回数付き） |
| `GET` | `/api/search?q=...` | 全文検索 |
| `GET` | `/health` | ヘルスチェック |

詳細は [docs/api.md](docs/api.md) を参照。

### MCP server

MCP clientからはlocal stdio processとして起動する。logはstdoutへ出さない。

```bash
npm run mcp
```

公開tool:

| tool | 概要 |
|---|---|
| `search` | repo・typeの段階緩和、ID重複除外、決定的rankingを行う検索 |
| `get` | 明示IDのInsightとversionを取得 |
| `upsert` | create、または明示ID・expectedVersion一致時だけupdate |
| `follow_up` | follow-upのadd・resolve・reopen |

読み取りtoolはread-only annotation、書き込みtoolは非read-only annotationを公開する。実際の書き込み承認はclient設定でも強制する。

### CLI

```bash
# エントリの作成
npx tsx src/cli.ts add -a claude-code -s "認証をJWTに移行した" -t auth,refactor -m productive

# エントリ一覧
npx tsx src/cli.ts list -a claude-code -n 5

# エントリ詳細
npx tsx src/cli.ts show 1

# 検索
npx tsx src/cli.ts search "JWT"
```

## npm scripts

| コマンド | 説明 |
|---|---|
| `npm run dev` | 開発サーバー起動 |
| `npm run mcp` | local stdio MCP server起動 |
| `npm test` | service・REST・MCP protocol test |
| `npm run typecheck` | TypeScript型検査 |
| `npm run db:migrate` | Prisma マイグレーション実行 |
| `npm run db:generate` | Prisma クライアント生成 |
| `npm run db:studio` | Prisma Studio 起動 |
