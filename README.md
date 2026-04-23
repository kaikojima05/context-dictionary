# context-dictionary

CLI コーディングエージェント（Claude Code, Copilot CLI, Codex など）との作業セッションを構造化して記録・検索するためのシステム。

セッションごとの要約、学び、意思決定、フォローアップなどを REST API 経由で蓄積し、過去のコンテキストを素早く引き出せるようにする。

## 技術スタック

- **Runtime**: Node.js + TypeScript (ESM)
- **Server**: Fastify
- **ORM**: Prisma
- **DB**: MySQL 8.0 (Docker)
- **CLI**: Commander

## セットアップ

### 前提条件

- Node.js 18+
- Docker / Docker Compose

### 手順

```bash
# 依存パッケージのインストール
npm install

# MySQL コンテナの起動
docker compose up -d

# Prisma クライアントの生成 & マイグレーション
npx prisma generate
npx prisma migrate dev

# 開発サーバーの起動 (http://localhost:3210)
npm run dev
```

### 環境変数

`.env` に以下が設定されている（デフォルト値で動作する）:

| 変数 | デフォルト値 | 説明 |
|---|---|---|
| `DATABASE_URL` | `mysql://root:diary_root@localhost:33060/context_dictionary` | MySQL 接続文字列 |
| `PORT` | `3210` | API サーバーのポート |

### DB クライアント

Sequel Ace などのGUIクライアントから `localhost:33060` に接続して確認できる。

## 使い方

### REST API

Base URL: `http://localhost:3210`

| メソッド | パス | 概要 |
|---|---|---|
| `POST` | `/api/entries` | エントリ作成 |
| `GET` | `/api/entries` | エントリ一覧（フィルタ・ページング対応） |
| `GET` | `/api/entries/:id` | エントリ詳細 |
| `PATCH` | `/api/entries/:id` | エントリ更新 |
| `POST` | `/api/entries/:id/follow-ups` | フォローアップ追加 |
| `PATCH` | `/api/follow-ups/:id` | フォローアップの解決状態更新 |
| `GET` | `/api/tags` | タグ一覧（使用回数付き） |
| `GET` | `/api/search?q=...` | 全文検索 |
| `GET` | `/health` | ヘルスチェック |

詳細は [docs/api.md](docs/api.md) を参照。

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
| `npm run db:migrate` | Prisma マイグレーション実行 |
| `npm run db:generate` | Prisma クライアント生成 |
| `npm run db:studio` | Prisma Studio 起動 |
