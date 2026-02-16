# LINE Bot & LIFF 設定手順

## 1. LINE Developers Consoleでの設定

### 1.1 Messaging API チャンネルの作成
1. [LINE Developers Console](https://developers.line.biz/console/) にアクセス
2. 新規プロバイダーまたは既存プロバイダーを選択
3. 「新しいチャンネルを作成」→「Messaging API」を選択
4. チャンネル情報を入力：
   - チャンネル名: `LINE健康管理Bot`
   - チャンネル説明: `AIを活用した健康管理サービス`
   - 大業界: `医療・ヘルスケア`
   - 小業界: `その他`

### 1.2 基本設定の確認
- **チャンネルID**: メモしておく
- **チャンネルシークレット**: `.env.local`に設定
- **チャンネルアクセストークン**: 発行して`.env.local`に設定

### 1.3 Webhook設定
- Webhook URL: `https://your-domain.com/api/webhook`
- Webhookの利用: `オン`
- 応答メッセージ: `オフ`（カスタムメッセージを使用）

### 1.4 LIFF アプリの作成
1. 同じチャンネル内で「LIFF」タブを選択
2. 「追加」をクリック
3. LIFF設定：
   - LIFFアプリ名: `健康管理アプリ`
   - サイズ: `Full`
   - エンドポイントURL: `https://your-domain.com`
   - Scope: `profile`, `openid`
   - ボットリンク機能: `オン（Aggressive）`

### 1.5 プロフィール設定
- Bot基本設定で「自動応答メッセージ」を`無効`
- Bot基本設定で「あいさつメッセージ」を`有効`
- あいさつメッセージでLIFF URLを含むメッセージを設定



`.env.local` ファイルに以下を追加：


```envLINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token_here
LINE_CHANNEL_SECRET=your_channel_secret_here
NEXT_PUBLIC_LIFF_ID=your_liff_id_here

# Webhook Security
WEBHOOK_SECRET=your_random_webhook_secret
```

## 3. 開発環境での確認

1. ngrok等でローカル環境を公開
2. Webhook URLを設定
3. LINE公式アカウントを友達追加してテスト

## 4. 本番環境でのデプロイ

1. Vercelにデプロイ
2. 本番URLでLIFF設定を更新


claide