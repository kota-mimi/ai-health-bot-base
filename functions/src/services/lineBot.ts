import type { LineMessage } from '../types';

export class LineBotService {
  private accessToken: string;
  private channelSecret: string;
  private baseUrl = 'https://api.line.me/v2/bot';

  constructor() {
    this.accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
    this.channelSecret = process.env.LINE_CHANNEL_SECRET || '';
    
    if (!this.accessToken || !this.channelSecret) {
      throw new Error('LINE_CHANNEL_ACCESS_TOKEN or LINE_CHANNEL_SECRET is not set');
    }
  }

  // LINE署名検証
  validateSignature(signature: string, body: string): boolean {
    try {
      const crypto = require('crypto');
      const hash = crypto.createHmac('sha256', this.channelSecret).update(body).digest('base64');
      return hash === signature;
    } catch (error) {
      console.error('署名検証エラー:', error);
      return false;
    }
  }

  private async makeRequest(endpoint: string, method: 'GET' | 'POST' = 'POST', body?: any) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LINE API Error: ${response.status} ${error}`);
    }

    return method === 'GET' ? response.json() : response;
  }

  // ユーザープロファイル取得
  async getUserProfile(userId: string) {
    try {
      return await this.makeRequest(`/profile/${userId}`, 'GET');
    } catch (error) {
      console.error('ユーザープロファイル取得エラー:', error);
      return null;
    }
  }

  // リプライメッセージ送信
  async replyMessage(replyToken: string, messages: any[]) {
    try {
      return await this.makeRequest('/message/reply', 'POST', {
        replyToken,
        messages,
      });
    } catch (error) {
      console.error('リプライメッセージ送信エラー:', error);
      throw error;
    }
  }

  // プッシュメッセージ送信
  async pushMessage(userId: string, messages: any[]) {
    try {
      return await this.makeRequest('/message/push', 'POST', {
        to: userId,
        messages,
      });
    } catch (error) {
      console.error('プッシュメッセージ送信エラー:', error);
      throw error;
    }
  }

  // マルチキャストメッセージ送信
  async multicastMessage(userIds: string[], messages: any[]) {
    try {
      return await this.makeRequest('/message/multicast', 'POST', {
        to: userIds,
        messages,
      });
    } catch (error) {
      console.error('マルチキャストメッセージ送信エラー:', error);
      throw error;
    }
  }

  // ブロードキャストメッセージ送信
  async broadcastMessage(messages: any[]) {
    try {
      return await this.makeRequest('/message/broadcast', 'POST', {
        messages,
      });
    } catch (error) {
      console.error('ブロードキャストメッセージ送信エラー:', error);
      throw error;
    }
  }

  // 画像コンテンツの取得
  async getImageContent(messageId: string): Promise<Buffer | null> {
    try {
      const response = await fetch(`${this.baseUrl}/message/${messageId}/content`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get image content: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error('画像コンテンツ取得エラー:', error);
      return null;
    }
  }

  // Flexメッセージのテンプレート作成ヘルパー
  createFlexMessage(altText: string, contents: any): any {
    return {
      type: 'flex',
      altText,
      contents
    };
  }

  // 簡単なテキストメッセージ作成ヘルパー
  createTextMessage(text: string): any {
    return {
      type: 'text',
      text
    };
  }

  // クイックリプライ付きテキストメッセージ作成ヘルパー
  createQuickReplyMessage(text: string, quickReplyItems: any[]): any {
    return {
      type: 'text',
      text,
      quickReply: {
        items: quickReplyItems
      }
    };
  }
}