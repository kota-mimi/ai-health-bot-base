import { onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import * as dotenv from 'dotenv';
import { LineBotService } from './services/lineBot';
import { FirestoreService } from './services/firestoreService';
import AIHealthService from './services/aiService';
import { admin } from './lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { checkUsageLimit, recordUsage } from './utils/usageLimits';
import { findFoodMatch, FOOD_DATABASE } from './utils/foodDatabase';

// 環境変数の読み込み
dotenv.config();

// グローバル設定
setGlobalOptions({
  region: 'asia-northeast1', // 東京リージョン
  maxInstances: 10,
});

// 画像キャッシュ（メモリに一時保存）
const imageCache = new Map<string, Buffer>();
const processingUsers = new Map<string, boolean>();

// 処理中フラグ管理
function isProcessing(userId: string): boolean {
  return processingUsers.get(userId) || false;
}

function setProcessing(userId: string, processing: boolean) {
  if (processing) {
    processingUsers.set(userId, true);
  } else {
    processingUsers.delete(userId);
  }
}

// 学習済み食事をFirestoreから検索
async function findLearnedFood(userId: string, text: string) {
  try {
    const db = admin.firestore();
    const userFoodRef = db.collection('learned_foods').doc(userId);
    const doc = await userFoodRef.get();
    
    if (!doc.exists) return null;
    
    const learnedFoods = doc.data();
    const normalizedText = text.toLowerCase().replace(/\s/g, '');
    
    // 完全一致をチェック
    for (const [foodName, foodData] of Object.entries(learnedFoods || {})) {
      if (foodName === text || foodName.toLowerCase() === normalizedText) {
        return { food: foodName, data: foodData, confidence: 'high' };
      }
    }
    
    // 部分一致をチェック
    for (const [foodName, foodData] of Object.entries(learnedFoods || {})) {
      if (text.includes(foodName) || foodName.includes(text) ||
          normalizedText.includes(foodName.toLowerCase()) || foodName.toLowerCase().includes(normalizedText)) {
        return { food: foodName, data: foodData, confidence: 'medium' };
      }
    }
    
    return null;
  } catch (error) {
    console.error('❌ 学習済み食事の検索エラー:', error);
    return null;
  }
}

// 学習済み食事をFirestoreに保存
async function addToLearnedFoods(userId: string, mealName: string, nutritionData: any) {
  try {
    const db = admin.firestore();
    const userFoodRef = db.collection('learned_foods').doc(userId);
    
    await userFoodRef.set({
      [mealName]: {
        calories: nutritionData.calories || 0,
        protein: nutritionData.protein || 0,
        fat: nutritionData.fat || 0,
        carbs: nutritionData.carbs || 0,
        learnedAt: FieldValue.serverTimestamp(),
        usageCount: FieldValue.increment(1),
        isPatternMatched: nutritionData.isPatternMatched || false,
        matchConfidence: nutritionData.matchConfidence || 'ai_analyzed'
      }
    }, { merge: true });
    
    console.log(`📚 学習済み食事に追加: ${mealName} (ユーザー: ${userId})`);
  } catch (error) {
    console.error('❌ 学習済み食事の保存エラー:', error);
  }
}

// カウンセリング完了状態をチェック
async function isCounselingCompleted(userId: string): Promise<boolean> {
  try {
    const db = admin.firestore();
    const counselingRef = db.collection('users').doc(userId).collection('counseling').doc('result');
    const counselingSnap = await counselingRef.get();
    
    if (!counselingSnap.exists) {
      return false;
    }
    
    const counselingData = counselingSnap.data();
    const aiAnalysis = counselingData?.aiAnalysis;
    
    return !!(
      aiAnalysis?.nutritionPlan?.dailyCalories &&
      counselingData?.answers
    );
  } catch (error) {
    console.error('カウンセリング状態チェックエラー:', error);
    return false;
  }
}

// カウンセリング誘導メッセージを送信
async function sendCounselingPrompt(lineBotService: LineBotService, replyToken: string, actionName: string) {
  const counselingMessage = {
    type: 'template',
    altText: `${actionName}を利用するには初期設定が必要です`,
    template: {
      type: 'buttons',
      text: `${actionName}を利用するには、まず初期設定（カウンセリング）を完了する必要があります。\\n\\nあなたについていくつか教えてもらえる？`,
      actions: [{
        type: 'uri',
        label: 'カウンセリング開始',
        uri: process.env.NEXT_PUBLIC_LIFF_ID ? 
          `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}/counseling` : 
          `${process.env.NEXT_PUBLIC_APP_URL}/counseling`
      }]
    }
  };

  await lineBotService.replyMessage(replyToken, [counselingMessage]);
}

// 食事記録処理
async function processMealRecord(userId: string, imageBuffer: Buffer | null, text: string | null, replyToken: string, lineBotService: LineBotService) {
  const firestoreService = new FirestoreService();
  const aiService = new AIHealthService();

  try {
    let analysisResult: any = null;

    if (imageBuffer) {
      // 画像分析
      console.log('🖼️ 画像分析を開始...');
      analysisResult = await aiService.analyzeFoodImage(imageBuffer, userId);
    } else if (text) {
      // テキスト分析
      console.log('📝 テキスト食事分析を開始...');
      
      // まず学習済み食事をチェック
      const learnedFood = await findLearnedFood(userId, text);
      if (learnedFood && learnedFood.confidence === 'high') {
        analysisResult = {
          foods: [{
            name: learnedFood.food,
            ...learnedFood.data
          }],
          totalCalories: learnedFood.data.calories,
          totalProtein: learnedFood.data.protein,
          totalFat: learnedFood.data.fat,
          totalCarbs: learnedFood.data.carbs,
          description: `学習済みの食事: ${learnedFood.food}`,
          analysisMethod: 'learned',
          confidence: 0.95
        };
        console.log('📚 学習済み食事を使用:', learnedFood.food);
      } else {
        // データベースマッチングを試行
        const dbMatch = findFoodMatch(text);
        if (dbMatch) {
          analysisResult = {
            foods: [{
              name: dbMatch.food.name,
              calories: dbMatch.food.calories,
              protein: dbMatch.food.protein,
              fat: dbMatch.food.fat,
              carbs: dbMatch.food.carbs,
              weight: 100, // デフォルト重量
              confidence: dbMatch.confidence === 'high' ? 0.9 : dbMatch.confidence === 'medium' ? 0.7 : 0.5
            }],
            totalCalories: dbMatch.food.calories,
            totalProtein: dbMatch.food.protein,
            totalFat: dbMatch.food.fat,
            totalCarbs: dbMatch.food.carbs,
            description: `データベースマッチ: ${dbMatch.food.name}`,
            analysisMethod: 'database',
            confidence: dbMatch.confidence === 'high' ? 0.9 : dbMatch.confidence === 'medium' ? 0.7 : 0.5
          };
          console.log('🗄️ データベースマッチ使用:', dbMatch.food.name);
        } else {
          // AI分析
          analysisResult = await aiService.analyzeTextMeal(text, userId);
        }
      }
    }

    if (!analysisResult) {
      throw new Error('分析結果が取得できませんでした');
    }

    // 食事記録を保存
    const today = new Date().toISOString().split('T')[0];
    const mealRecord = {
      ...analysisResult,
      date: today,
      userId: userId,
      recordedAt: new Date().toISOString()
    };

    await firestoreService.saveMealRecord(userId, mealRecord);

    // 学習用に食事データを保存（confidence が高い場合）
    if (analysisResult.confidence > 0.7 && analysisResult.foods && analysisResult.foods.length === 1) {
      const food = analysisResult.foods[0];
      if (text && food.name) {
        await addToLearnedFoods(userId, text, food);
      }
    }

    // 使用回数を記録
    await recordUsage(userId, 'ai');

    // 成功メッセージを送信
    const successMessage = lineBotService.createTextMessage(
      `🍽️ 食事を記録したよ！\\n\\n` +
      `📊 ${analysisResult.description}\\n` +
      `🔥 ${analysisResult.totalCalories}kcal\\n` +
      `🥩 タンパク質: ${analysisResult.totalProtein}g\\n` +
      `🍞 炭水化物: ${analysisResult.totalCarbs}g\\n` +
      `🧈 脂質: ${analysisResult.totalFat}g\\n\\n` +
      `記録完了！お疲れさま✨`
    );

    await lineBotService.replyMessage(replyToken, [successMessage]);
    console.log('✅ 食事記録処理完了');

  } catch (error) {
    console.error('❌ 食事記録処理エラー:', error);
    
    const errorMessage = lineBotService.createTextMessage(
      '❌ 申し訳ありません。食事の分析でエラーが発生しました。\\n' +
      'もう一度お試しいただくか、違う角度から写真を撮り直してみてください。'
    );
    
    await lineBotService.replyMessage(replyToken, [errorMessage]);
  }
}

// LINE Webhook処理 (Firebase Functions Gen2)
export const lineWebhook = onRequest({
  memory: '1GiB',
  timeoutSeconds: 540, // 9分（余裕を持たせる）
  maxInstances: 5,
}, async (req, res) => {
  console.log('🚀 LINE Webhook 処理開始');
  
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const lineBotService = new LineBotService();
  const firestoreService = new FirestoreService();

  try {
    const signature = req.headers['x-line-signature'] as string;
    const body = JSON.stringify(req.body);
    
    // 署名検証
    if (!lineBotService.validateSignature(signature, body)) {
      console.error('❌ LINE署名検証失敗');
      res.status(401).send('Unauthorized');
      return;
    }

    const events = req.body.events || [];
    console.log(`📨 ${events.length}個のイベントを受信`);

    // 各イベントを処理
    for (const event of events) {
      const { type, replyToken, source } = event;
      const userId = source?.userId;

      if (!userId) {
        console.log('⚠️ ユーザーIDが見つかりません');
        continue;
      }

      console.log(`📩 イベント処理: ${type} (ユーザー: ${userId})`);

      // 処理中チェック
      if (isProcessing(userId)) {
        console.log('⏳ ユーザーが処理中のためスキップ');
        continue;
      }

      try {
        setProcessing(userId, true);

        switch (type) {
          case 'message':
            const { message } = event;
            
            switch (message.type) {
              case 'image':
                console.log('🖼️ 画像メッセージを受信');
                
                // カウンセリング完了チェック
                const counselingCompleted = await isCounselingCompleted(userId);
                if (!counselingCompleted) {
                  await sendCounselingPrompt(lineBotService, replyToken, '画像での食事記録');
                  break;
                }

                // 使用制限チェック
                const canUseImage = await checkUsageLimit(userId, 'ai');
                if (!canUseImage.allowed) {
                  const limitMessage = lineBotService.createTextMessage(
                    `⚠️ 本日の画像分析回数上限（${canUseImage.limit}回）に達しました。\\n` +
                    '明日の00:00にリセットされます。'
                  );
                  await lineBotService.replyMessage(replyToken, [limitMessage]);
                  break;
                }

                // 画像取得
                const imageBuffer = await lineBotService.getImageContent(message.id);
                if (!imageBuffer) {
                  const errorMessage = lineBotService.createTextMessage('❌ 画像の取得に失敗しました。');
                  await lineBotService.replyMessage(replyToken, [errorMessage]);
                  break;
                }

                // 画像食事記録処理
                await processMealRecord(userId, imageBuffer, null, replyToken, lineBotService);
                break;

              case 'text':
                const text = message.text;
                console.log(`💬 テキストメッセージ: ${text}`);

                // 体重記録のパターンマッチング
                const weightMatch = text.match(/^(\d+(?:\.\d+)?)(kg|キロ)?$/);
                if (weightMatch) {
                  const weight = parseFloat(weightMatch[1]);
                  const today = new Date().toISOString().split('T')[0];
                  
                  await firestoreService.saveWeightRecord(userId, weight, today);
                  
                  const weightMessage = lineBotService.createTextMessage(
                    `⚖️ 体重を記録したよ！\\n\\n${weight}kg\\n\\n記録完了！今日もお疲れさま✨`
                  );
                  
                  await lineBotService.replyMessage(replyToken, [weightMessage]);
                  break;
                }

                // 食事テキスト分析
                if (text && text.length > 1) {
                  // カウンセリング完了チェック
                  const counselingCompleted = await isCounselingCompleted(userId);
                  if (!counselingCompleted) {
                    await sendCounselingPrompt(lineBotService, replyToken, 'テキストでの食事記録');
                    break;
                  }

                  // 使用制限チェック
                  const canUseText = await checkUsageLimit(userId, 'ai');
                  if (!canUseText.allowed) {
                    const limitMessage = lineBotService.createTextMessage(
                      `⚠️ 本日の食事分析回数上限（${canUseText.limit}回）に達しました。\\n` +
                      '明日の00:00にリセットされます。'
                    );
                    await lineBotService.replyMessage(replyToken, [limitMessage]);
                    break;
                  }

                  // テキスト食事記録処理
                  await processMealRecord(userId, null, text, replyToken, lineBotService);
                } else {
                  // 一般的な挨拶など
                  const greetingMessage = lineBotService.createTextMessage(
                    'こんにちは！\\n\\n' +
                    '🍽️ 食事の写真を送るか、食べたものを教えてね\\n' +
                    '⚖️ 体重は「65kg」のように数字で教えて\\n\\n' +
                    '何か質問があれば気軽に話しかけてね！'
                  );
                  
                  await lineBotService.replyMessage(replyToken, [greetingMessage]);
                }
                break;

              default:
                console.log(`❓ 未対応のメッセージタイプ: ${message.type}`);
                break;
            }
            break;

          case 'follow':
            console.log('👋 友達追加イベント');
            
            // ユーザー情報を取得・保存
            const profile = await lineBotService.getUserProfile(userId);
            if (profile) {
              await firestoreService.saveUser(userId, {
                profile: {
                  name: (profile as any).displayName || 'LINE User',
                  pictureUrl: (profile as any).pictureUrl || ''
                },
                followedAt: new Date()
              } as any);
            }

            // ウェルカムメッセージ
            const welcomeMessage = {
              type: 'template',
              altText: 'ヘルシーくんへようこそ！',
              template: {
                type: 'buttons',
                text: 'ヘルシーくんへようこそ！🌟\\n\\nAIが写真から食事を分析して、カロリーや栄養素を自動計算するよ。\\n\\nまずは初期設定をお願いします。',
                actions: [{
                  type: 'uri',
                  label: 'カウンセリング開始',
                  uri: process.env.NEXT_PUBLIC_LIFF_ID ? 
                    `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}/counseling` : 
                    `${process.env.NEXT_PUBLIC_APP_URL}/counseling`
                }]
              }
            };

            await lineBotService.replyMessage(replyToken, [welcomeMessage]);
            break;

          case 'unfollow':
            console.log('👋 ブロック・友達削除イベント');
            // 必要に応じてユーザー状態を更新
            break;

          default:
            console.log(`❓ 未対応のイベントタイプ: ${type}`);
            break;
        }

      } catch (eventError) {
        console.error(`❌ イベント処理エラー (${type}):`, eventError);
      } finally {
        setProcessing(userId, false);
      }
    }

    res.status(200).send('OK');
    console.log('✅ LINE Webhook 処理完了');

  } catch (error) {
    console.error('❌ LINE Webhook エラー:', error);
    res.status(500).send('Internal Server Error');
  }
});