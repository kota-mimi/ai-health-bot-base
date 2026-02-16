import { NextRequest, NextResponse } from 'next/server';

// Firebase Functions への移行通知
// 
// このエンドポイントは Firebase Cloud Functions (Gen 2) に移行されました。
// 新しいエンドポイント: https://asia-northeast1-{project-id}.cloudfunctions.net/lineWebhook
//
// Vercel でのタイムアウト制限（30秒）により、Gemini Pro の画像解析処理が
// 完了できないため、Firebase Functions で処理するように変更されました。

export async function POST(req: NextRequest) {
  console.log('🚨 この webhook エンドポイントは Firebase Functions に移行されました');
  console.log('LINE Developer Console で webhook URL を更新してください');
  console.log('新しいURL: https://asia-northeast1-{project-id}.cloudfunctions.net/lineWebhook');
  
  return NextResponse.json(
    { 
      error: 'WEBHOOK_MIGRATED',
      message: 'This webhook has been migrated to Firebase Functions',
      newEndpoint: 'https://asia-northeast1-{project-id}.cloudfunctions.net/lineWebhook',
      instructions: 'Please update your LINE Developer Console webhook URL'
    }, 
    { status: 410 } // Gone
  );
}

export async function GET() {
  return NextResponse.json(
    { 
      status: 'migrated',
      message: 'LINE Webhook migrated to Firebase Functions Gen2',
      reason: 'Vercel timeout limitation (30s) insufficient for Gemini Pro image analysis',
      newEndpoint: 'https://asia-northeast1-{project-id}.cloudfunctions.net/lineWebhook'
    }
  );
}