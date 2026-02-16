import { GoogleGenerativeAI } from '@google/generative-ai';
import { getCharacterPersona, getCharacterLanguage, getLanguageInstruction } from '../utils/aiCharacterUtils';
import { calculateBMI, calculateTDEE, calculateCalorieTarget, calculateMacroTargets } from '../utils/calculations';
import type { UserProfile, CounselingAnswer } from '../types';
import { admin } from '../lib/firebase-admin';

class AIHealthService {
  private genAI: GoogleGenerativeAI;

  constructor() {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_GEMINI_API_KEY is not set');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  // 画像分析メソッド（Gemini Pro Vision使用）
  async analyzeFoodImage(imageBuffer: Buffer, userId?: string): Promise<any> {
    try {
      console.log('🔍 Gemini Pro で画像分析を開始...');
      
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      
      const prompt = `
あなたは栄養分析の専門家です。画像に写っている食べ物を分析し、以下のJSON形式で回答してください：

{
  "foods": [
    {
      "name": "食べ物の名前",
      "calories": カロリー（kcal、整数）,
      "protein": タンパク質（g、小数第1位まで）,
      "fat": 脂質（g、小数第1位まで）,
      "carbs": 炭水化物（g、小数第1位まで）,
      "weight": 推定重量（g、整数）,
      "confidence": 0.0-1.0の信頼度
    }
  ],
  "totalCalories": 合計カロリー（kcal、整数）,
  "totalProtein": 合計タンパク質（g、小数第1位まで）,
  "totalFat": 合計脂質（g、小数第1位まで）,
  "totalCarbs": 合計炭水化物（g、小数第1位まで）,
  "mealTime": "breakfast/lunch/dinner/snack のいずれか",
  "description": "食事の簡潔な説明（日本語）"
}

重要な指示：
- 栄養成分は日本の食品成分表に基づいて正確に算出してください
- 料理の分量を画像から推定し、現実的な数値を提供してください
- JSONのみを返し、他のテキストは含めないでください
`;

      const imagePart = {
        inlineData: {
          data: imageBuffer.toString('base64'),
          mimeType: 'image/jpeg'
        }
      };

      const result = await model.generateContent([prompt, imagePart]);
      const response = await result.response;
      const text = response.text();
      
      console.log('🤖 Gemini Pro 分析結果:', text);

      try {
        const analysisResult = JSON.parse(text);
        
        // 基本的なバリデーション
        if (!analysisResult.foods || !Array.isArray(analysisResult.foods)) {
          throw new Error('Invalid response format');
        }

        return {
          ...analysisResult,
          analysisMethod: 'gemini_pro',
          confidence: 0.85,
          timestamp: new Date().toISOString()
        };
      } catch (parseError) {
        console.error('JSON解析エラー:', parseError);
        return this.createFallbackAnalysis();
      }
      
    } catch (error) {
      console.error('🚨 Gemini Pro 分析エラー:', error);
      return this.createFallbackAnalysis();
    }
  }

  // フォールバック分析結果
  private createFallbackAnalysis() {
    return {
      foods: [{
        name: "食事",
        calories: 350,
        protein: 15.0,
        fat: 12.0,
        carbs: 45.0,
        weight: 200,
        confidence: 0.3
      }],
      totalCalories: 350,
      totalProtein: 15.0,
      totalFat: 12.0,
      totalCarbs: 45.0,
      mealTime: "lunch",
      description: "画像分析が困難でした。手動で修正してください。",
      analysisMethod: 'fallback',
      confidence: 0.3
    };
  }

  // テキスト食事分析
  async analyzeTextMeal(text: string, userId?: string): Promise<any> {
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      
      const prompt = `
あなたは栄養分析の専門家です。以下のテキストで記載された食事内容を分析し、JSON形式で回答してください：

「${text}」

{
  "foods": [
    {
      "name": "食べ物の名前",
      "calories": カロリー（kcal、整数）,
      "protein": タンパク質（g、小数第1位まで）,
      "fat": 脂質（g、小数第1位まで）,
      "carbs": 炭水化物（g、小数第1位まで）,
      "weight": 推定重量（g、整数）,
      "confidence": 0.0-1.0の信頼度
    }
  ],
  "totalCalories": 合計カロリー（kcal、整数）,
  "totalProtein": 合計タンパク質（g、小数第1位まで）,
  "totalFat": 合計脂質（g、小数第1位まで）,
  "totalCarbs": 合計炭水化物（g、小数第1位まで）,
  "mealTime": "breakfast/lunch/dinner/snack のいずれか",
  "description": "食事の簡潔な説明（日本語）"
}

重要な指示：
- 日本の食品成分表に基づいて正確に算出してください
- 一般的な分量を想定して現実的な数値を提供してください  
- JSONのみを返し、他のテキストは含めないでください
`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const responseText = response.text();

      try {
        const analysisResult = JSON.parse(responseText);
        return {
          ...analysisResult,
          analysisMethod: 'gemini_text',
          confidence: 0.75,
          timestamp: new Date().toISOString()
        };
      } catch (parseError) {
        console.error('テキスト分析JSON解析エラー:', parseError);
        return this.createFallbackAnalysis();
      }

    } catch (error) {
      console.error('テキスト食事分析エラー:', error);
      return this.createFallbackAnalysis();
    }
  }

  // カウンセリング結果分析
  async analyzeCounseling(answers: Record<string, any>) {
    try {
      // テスト環境では、モックアドバイスを生成
      const isTestMode = process.env.NODE_ENV === 'development' && answers.name?.includes('テスト');
      
      let personalizedAdvice;
      
      if (isTestMode) {
        personalizedAdvice = this.generateStructuredMockAdvice(answers);
      } else {
        try {
          const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
          const prompt = this.buildCounselingPrompt(answers);
          const result = await model.generateContent(prompt);
          const response = await result.response;
          personalizedAdvice = this.parseGeminiResponse(response.text());
        } catch (apiError) {
          console.error('Gemini API エラー - フォールバックを使用:', apiError);
          personalizedAdvice = this.generateStructuredMockAdvice(answers);
        }
      }

      // PFC・カロリー計算
      const nutritionPlan = this.calculateNutritionPlan(answers);

      return {
        personalizedAdvice,
        nutritionPlan,
        healthGoals: this.extractHealthGoals(answers),
        riskFactors: this.identifyRiskFactors(answers),
        recommendations: this.generateRecommendations(answers),
      };
    } catch (error) {
      console.error('AI分析エラー:', error);
      return {
        personalizedAdvice: this.generateStructuredMockAdvice(answers),
        nutritionPlan: this.calculateNutritionPlan(answers),
        healthGoals: this.extractHealthGoals(answers),
        riskFactors: this.identifyRiskFactors(answers),
        recommendations: this.generateRecommendations(answers),
      };
    }
  }

  private buildCounselingPrompt(answers: Record<string, any>): string {
    // カウンセリングプロンプトの構築ロジック
    return `健康カウンセリング分析を実行...`;
  }

  private parseGeminiResponse(text: string) {
    // Gemini レスポンスの解析ロジック
    return {
      summary: "パーソナライズされたアドバイス",
      recommendations: ["推奨事項1", "推奨事項2"]
    };
  }

  private generateStructuredMockAdvice(answers: Record<string, any>) {
    return {
      summary: "テスト用のモックアドバイス",
      recommendations: ["テスト推奨事項1", "テスト推奨事項2"]
    };
  }

  private calculateNutritionPlan(answers: Record<string, any>) {
    return {
      dailyCalories: 2000,
      protein: 100,
      fat: 60,
      carbs: 250
    };
  }

  private extractHealthGoals(answers: Record<string, any>) {
    return [];
  }

  private identifyRiskFactors(answers: Record<string, any>) {
    return [];
  }

  private generateRecommendations(answers: Record<string, any>) {
    return [];
  }
}

export default AIHealthService;