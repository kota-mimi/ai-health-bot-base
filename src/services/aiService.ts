import { GoogleGenerativeAI } from '@google/generative-ai';
import { getCharacterPersona, getCharacterLanguage, getLanguageInstruction } from '@/utils/aiCharacterUtils';
import { calculateBMI, calculateTDEE, calculateCalorieTarget, calculateMacroTargets } from '@/utils/calculations';
import type { UserProfile, CounselingAnswer } from '@/types';
import { admin } from '@/lib/firebase-admin';

class AIHealthService {
  private genAI: GoogleGenerativeAI;

  constructor() {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_GEMINI_API_KEY is not set');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  // カウンセリング結果を分析してパーソナライズアドバイスを生成
  async analyzeCounseling(answers: Record<string, any>) {
    try {
      // テスト環境では、モックアドバイスを生成
      const isTestMode = process.env.NODE_ENV === 'development' && answers.name?.includes('テスト');
      
      let personalizedAdvice;
      
      if (isTestMode) {
        personalizedAdvice = this.generateStructuredMockAdvice(answers);
      } else {
        try {
          const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
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
      // 開発環境では常にフォールバックアドバイスを使用
      return {
        personalizedAdvice: this.generateStructuredMockAdvice(answers),
        nutritionPlan: this.calculateNutritionPlan(answers),
        healthGoals: this.extractHealthGoals(answers),
        riskFactors: this.identifyRiskFactors(answers),
        recommendations: this.generateRecommendations(answers),
      };
    }
  }

  // カウンセリングプロンプトを構築
  private buildCounselingPrompt(answers: Record<string, any>): string {
    const genderText = answers.gender === 'male' ? '男性' : answers.gender === 'female' ? '女性' : 'その他';
    
    const goalText = {
      'weight_loss': '体重を落としたい',
      'healthy_beauty': '健康的にキレイになりたい',
      'weight_gain': '体重を増やしたい',
      'muscle_gain': '筋肉をつけたい',
      'lean_muscle': '筋肉をつけながら痩せたい',
      'fitness_improve': '運動不足解消・体力を助けたい',
      'other': 'その他'
    }[answers.primaryGoal] || answers.primaryGoal;

    const sleepDurationText = {
      'under_3h': '3時間未満',
      '4_5h': '4~5時間',
      '6_7h': '6~7時間', 
      '8h_plus': '8時間以上'
    }[answers.sleepDuration] || answers.sleepDuration;

    const sleepQualityText = {
      'good': '良い',
      'normal': '普通',
      'bad': '悪い'
    }[answers.sleepQuality] || answers.sleepQuality;

    const activityLevelText = {
      'low': '低い（座っていることが多い）',
      'slightly_low': 'やや低い（週1-2回軽い運動）',
      'normal': '普通（週2-3回運動）',
      'high': '高い（週3-5回運動）',
      'very_high': 'かなり高い（アスリートレベル）'
    }[answers.activityLevel] || answers.activityLevel;

    return `
あなたは経験豊富な管理栄養士・健康コンサルタントです。
以下の詳細なカウンセリング結果を分析して、個別化された健康アドバイスを日本語で生成してください。

## ユーザー情報
### 基本情報
- 名前: ${answers.name}
- 年齢: ${answers.age}歳
- 性別: ${genderText}
- 身長: ${answers.height}cm
- 現在体重: ${answers.weight}kg
- 目標体重: ${answers.targetWeight || '設定なし'}kg
- 達成希望日: ${answers.targetDate || '設定なし'}
- 主な目標: ${goalText}
- 気になる部位: ${answers.targetAreas || '特になし'}

### 睡眠状況  
- 睡眠時間: ${sleepDurationText}
- 睡眠の質: ${sleepQualityText}

### 活動・運動状況
- 活動レベル: ${activityLevelText}
- 運動習慣: ${answers.exerciseHabit === 'yes' ? 'あり' : 'なし'}
- 運動頻度: ${answers.exerciseFrequency}
- 運動環境: ${answers.exerciseEnvironment || '設定なし'}

### 食事習慣
- 食事回数: ${answers.mealFrequency}回/日
- 間食頻度: ${answers.snackFrequency}
- 飲酒頻度: ${answers.alcoholFrequency}
- 食事制限・希望: ${answers.dietaryRestrictions || 'なし'}

### 健康状態
- 持病・既往歴: ${answers.medicalConditions || 'なし'}
- アレルギー: ${answers.allergies || 'なし'}

## 指示
以下の3つのセクションに分けて、それぞれ**5行以内**で簡潔にアドバイスを作成してください：

### 良いところ（5行以内）
この人の良い習慣や取り組みを具体的に褒める

### 改善ポイント（5行以内）
最も重要な改善点を1-2つに絞って指摘する

### アドバイス（5行以内）
目標達成のための具体的で実践しやすい提案を簡潔に

**重要**: 各セクションは必ず5行以内で、簡潔で親しみやすい内容にしてください。

**絶対禁止ワード**：「やあ」「〇〇さ」「〇〇だとか」「〇〇とか」「〇〇ですとか」「〇〇みたいな」「〇〇ような」「〇〇か」「〇〇な」「なんて」「って感じで」「かもしれません」「だと思います」「でしょうか」「だが」「しかし」「である」「のである」「おう」「おお」「おい」「だぜ」「〜ぜ」などの古風・不自然・荒っぽい表現は一切使わない。
絵文字、マークダウン記号（**、***、---など）は一切使わない。
プレーンテキストで回答する。
`;
  }

  // 栄養プランを計算
  private calculateNutritionPlan(answers: Record<string, any>) {
    const profile: UserProfile = {
      name: answers.name,
      age: answers.age,
      gender: answers.gender,
      height: answers.height,
      weight: answers.weight,
      activityLevel: answers.activityLevel,
      goals: [{ type: answers.primaryGoal, targetValue: answers.targetWeight }]
    };

    const bmi = calculateBMI(profile.weight, profile.height);
    const tdee = calculateTDEE(profile);
    const calorieTarget = calculateCalorieTarget(profile, profile.goals);
    const macroTargets = calculateMacroTargets(calorieTarget);

    return {
      bmi,
      bmiCategory: this.getBMICategory(bmi),
      tdee: Math.round(tdee),
      dailyCalories: calorieTarget,
      macros: {
        protein: macroTargets.protein,
        carbs: macroTargets.carbohydrates,
        fat: macroTargets.fat,
        fiber: macroTargets.fiber,
      },
      waterIntake: this.calculateWaterIntake(profile.weight, profile.activityLevel),
    };
  }

  // BMIカテゴリを取得
  private getBMICategory(bmi: number): string {
    if (bmi < 18.5) return '低体重';
    if (bmi < 25) return '普通体重';
    if (bmi < 30) return '過体重';
    return '肥満';
  }

  // 水分摂取量計算
  private calculateWaterIntake(weight: number, activityLevel: string): number {
    const baseIntake = weight * 35; // 基本: 35ml/kg
    const multipliers = {
      low: 1,
      slightly_low: 1.1,
      normal: 1.2,
      high: 1.3,
      very_high: 1.4,
    };
    
    const multiplier = multipliers[activityLevel as keyof typeof multipliers] || 1;
    return Math.round(baseIntake * multiplier);
  }

  // 健康目標を抽出
  private extractHealthGoals(answers: Record<string, any>) {
    const goals = [];
    
    if (answers.primaryGoal === 'weight_loss') {
      goals.push({
        type: 'weight_loss',
        title: '体重減少',
        target: answers.targetWeight ? `${answers.targetWeight}kg` : '健康的な体重',
        deadline: '3ヶ月',
      });
    } else if (answers.primaryGoal === 'muscle_gain') {
      goals.push({
        type: 'muscle_gain',
        title: '筋肉増強',
        target: '筋力向上',
        deadline: '6ヶ月',
      });
    } else if (answers.primaryGoal === 'maintenance') {
      goals.push({
        type: 'maintenance',
        title: '現状維持',
        target: '健康な生活習慣の継続',
        deadline: '継続的',
      });
    }

    return goals;
  }

  // リスクファクターを特定
  private identifyRiskFactors(answers: Record<string, any>) {
    const risks = [];
    const bmi = calculateBMI(answers.weight, answers.height);

    if (bmi >= 30) {
      risks.push({
        type: 'obesity',
        level: 'high',
        message: 'BMI値が高めです。生活習慣病のリスクが高まる可能性があります。',
      });
    }

    // 睡眠リスクの評価
    if (answers.sleepDuration === 'under_3h' || answers.sleepDuration === '4_5h') {
      risks.push({
        type: 'sleep',
        level: 'high',
        message: '睡眠時間が不足しています。質の良い睡眠を心がけましょう。',
      });
    }

    if (answers.sleepQuality === 'bad') {
      risks.push({
        type: 'sleep_quality',
        level: 'medium',
        message: '睡眠の質に問題がありそうです。睡眠環境を見直してみましょう。',
      });
    }

    // 活動レベルのリスク
    if (answers.activityLevel === 'low') {
      risks.push({
        type: 'activity',
        level: 'medium',
        message: '活動量が少ないようです。少しずつ運動を取り入れてみましょう。',
      });
    }

    // 飲酒リスク
    if (answers.alcoholFrequency === 'daily' || answers.alcoholFrequency === 'almost_daily') {
      risks.push({
        type: 'alcohol',
        level: 'medium',
        message: '飲酒頻度が高めです。適量を意識して健康的な飲酒を心がけましょう。',
      });
    }

    return risks;
  }

  // 推奨事項を生成
  private generateRecommendations(answers: Record<string, any>) {
    const recommendations = [];

    // 食事の推奨
    const nutritionItems = [];
    
    if (answers.primaryGoal === 'weight_loss') {
      nutritionItems.push(
        '野菜を食事の半分以上に',
        'タンパク質を毎食に取り入れる',
        '間食は低カロリーなものを選ぶ'
      );
    } else if (answers.primaryGoal === 'muscle_gain') {
      nutritionItems.push(
        'タンパク質を体重×1.5-2g摂取',
        '炭水化物を運動後に摂取',
        '分割食事で栄養バランス重視'
      );
    }

    if (answers.mealFrequency === '1' || answers.mealFrequency === '2') {
      nutritionItems.push('食事回数を3回以上に増やす');
    }

    if (answers.snackFrequency === 'daily' || answers.snackFrequency === 'almost_daily') {
      nutritionItems.push('間食を健康的な食品に変更');
    }

    if (nutritionItems.length > 0) {
      recommendations.push({
        category: 'nutrition',
        title: '食事管理',
        items: nutritionItems,
      });
    }

    // 運動の推奨
    const exerciseItems = [];
    
    if (answers.activityLevel === 'low') {
      exerciseItems.push(
        '1日30分のウォーキングから始める',
        '階段を積極的に使う',
        'デスクワーク中は1時間に1度立ち上がる'
      );
    } else if (answers.exerciseHabit === 'no') {
      exerciseItems.push(
        '週2-3回の軽い運動から開始',
        '自宅でできる筋トレメニューを取り入れる'
      );
    }

    if (exerciseItems.length > 0) {
      recommendations.push({
        category: 'exercise',
        title: '運動習慣',
        items: exerciseItems,
      });
    }

    // 睡眠の推奨
    const sleepItems = [];
    
    if (answers.sleepDuration === 'under_3h' || answers.sleepDuration === '4_5h') {
      sleepItems.push('睡眠時間を7-8時間確保する');
    }
    
    if (answers.sleepQuality === 'bad') {
      sleepItems.push(
        '就寝前のスマホ使用を控える',
        '寝室環境を整える（温度・明るさ）'
      );
    }

    if (sleepItems.length > 0) {
      recommendations.push({
        category: 'sleep',
        title: '睡眠改善',
        items: sleepItems,
      });
    }

    // 生活習慣の推奨
    const lifestyleItems = [
      '規則正しい食事時間を心がける',
      '十分な水分補給を意識する'
    ];

    if (answers.alcoholFrequency === 'daily' || answers.alcoholFrequency === 'almost_daily') {
      lifestyleItems.push('飲酒は適量に控える');
    }

    recommendations.push({
      category: 'lifestyle',
      title: '生活習慣',
      items: lifestyleItems,
    });

    return recommendations;
  }

  // Geminiのレスポンスをパース
  private parseGeminiResponse(responseText: string): any {
    const sections = {
      positivePoints: "",
      improvements: "",
      advice: ""
    };

    try {
      // セクションごとに分割してパース
      const positiveMatch = responseText.match(/### 良いところ[^#]*?\n([\s\S]*?)(?=###|$)/);
      const improvementsMatch = responseText.match(/### 改善ポイント[^#]*?\n([\s\S]*?)(?=###|$)/);
      const adviceMatch = responseText.match(/### アドバイス[^#]*?\n([\s\S]*?)(?=###|$)/);

      if (positiveMatch) sections.positivePoints = positiveMatch[1].trim();
      if (improvementsMatch) sections.improvements = improvementsMatch[1].trim();
      if (adviceMatch) sections.advice = adviceMatch[1].trim();

      // セクションが見つからない場合はフォールバック
      if (!sections.positivePoints || !sections.improvements || !sections.advice) {
        return {
          positivePoints: "あなたの健康への意識と取り組みは素晴らしいです。",
          improvements: "継続的な取り組みでさらに改善できそうです。",
          advice: responseText.length > 500 ? responseText.substring(0, 200) + "..." : responseText
        };
      }

      return sections;
    } catch (error) {
      console.error('Geminiレスポンス解析エラー:', error);
      return {
        positivePoints: "あなたの健康への意識と取り組みは素晴らしいです。",
        improvements: "継続的な取り組みでさらに改善できそうです。",
        advice: "健康的な生活を心がけましょう。"
      };
    }
  }

  // 構造化されたモックアドバイスを生成（Flexメッセージ用）
  private generateStructuredMockAdvice(answers: Record<string, any>): any {
    const name = answers.name || 'ユーザー';
    const bmi = calculateBMI(answers.weight, answers.height);
    const bmiCategory = this.getBMICategory(bmi);
    
    const goalText = {
      'weight_loss': '体重を落とす',
      'healthy_beauty': '健康的にキレイになる', 
      'weight_gain': '体重を増やす',
      'muscle_gain': '筋肉をつける',
      'lean_muscle': '筋肉をつけながら痩せる',
      'fitness_improve': '運動不足解消・体力向上',
      'other': 'その他の目標'
    }[answers.primaryGoal] || answers.primaryGoal;

    // 良いところを分析
    const positivePoints = this.generatePositivePoints(answers);
    
    // 改善ポイントを分析
    const improvements = this.generateImprovements(answers);
    
    // 具体的なアドバイスを生成
    const advice = this.generateSpecificAdvice(answers, goalText);

    return {
      positivePoints,
      improvements, 
      advice
    };
  }

  // 良いところを生成（5行以内）
  private generatePositivePoints(answers: Record<string, any>): string {
    const points = [];
    
    if (answers.exerciseHabit === 'yes') points.push('運動習慣を継続中');
    if (answers.mealFrequency === '3') points.push('1日3食の規則正しい食事');
    if (answers.sleepDuration === '6_7h' || answers.sleepDuration === '8h_plus') points.push('十分な睡眠時間');
    if (answers.alcoholFrequency === 'never' || answers.alcoholFrequency === 'rarely') points.push('飲酒を控えめに');

    if (points.length === 0) {
      return '健康改善への意識が高く、カウンセリングを受けることで前向きに取り組む姿勢が素晴らしいです。';
    }

    return points.slice(0, 2).join('、') + 'など、良い習慣が身についています。この調子で継続していきましょう！';
  }

  // 改善ポイントを生成（5行以内）
  private generateImprovements(answers: Record<string, any>): string {
    const improvements = [];
    
    if (answers.activityLevel === 'low') improvements.push('日常の活動量を少し増やす');
    if (answers.sleepDuration === 'under_3h' || answers.sleepDuration === '4_5h') improvements.push('睡眠時間をもう1-2時間延ばす');
    if (answers.sleepQuality === 'bad') improvements.push('睡眠環境の見直し');
    if (answers.snackFrequency === 'daily') improvements.push('間食を健康的な食品に変更');
    
    if (improvements.length === 0) {
      return '現在の生活習慣を維持しながら、週2-3回の運動を追加することで目標達成がより確実になります。';
    }

    return improvements.slice(0, 2).join('、') + 'から始めることで、着実に目標に近づけます。';
  }

  // 具体的なアドバイスを生成（5行以内）
  private generateSpecificAdvice(answers: Record<string, any>, goalText: string): string {
    if (answers.primaryGoal === 'muscle_gain' || answers.primaryGoal === 'lean_muscle') {
      return '週2回の筋トレから開始し、大きな筋肉群（胸・背中・脚）を鍛えましょう。トレーニング後30分以内にタンパク質摂取を心がけることで効率的に筋肉をつけられます。';
    } else if (answers.primaryGoal === 'weight_loss') {
      return '食事は野菜中心にして、週3回の有酸素運動から始めましょう。無理な食事制限よりも、バランスの良い食事と継続可能な運動が重要です。';
    } else {
      return 'バランスの取れた食事、適度な運動、質の良い睡眠の3つを基本とし、無理なく継続できる範囲で改善していきましょう。小さな変化の積み重ねが成功の鍵です。';
    }
  }

  // テスト用のモックアドバイスを生成（後方互換性のため残す）
  private generateMockAdvice(answers: Record<string, any>): string {
    const name = answers.name || 'ゲスト';
    const bmi = calculateBMI(answers.weight, answers.height);
    const bmiCategory = this.getBMICategory(bmi);
    
    const goalText = {
      'weight_loss': '体重を落とす',
      'healthy_beauty': '健康的にキレイになる',
      'weight_gain': '体重を増やす',
      'muscle_gain': '筋肉をつける',
      'lean_muscle': '筋肉をつけながら痩せる',
      'fitness_improve': '運動不足解消・体力向上',
      'other': 'その他の目標'
    }[answers.primaryGoal] || answers.primaryGoal;

    return `${name}さん、詳細なカウンセリングにご協力いただき、ありがとうございます！

分析結果をお伝えします。現在のBMIは${bmi.toFixed(1)}（${bmiCategory}）で、「${goalText}」という目標に向けて、以下のアドバイスをお送りします。

【食事について】
現在の食事回数は${answers.mealFrequency}回/日ということですね。バランスの良い食事を心がけ、特にタンパク質を意識的に摂取することをお勧めします。間食は${answers.snackFrequency}とのことですので、栄養価の高いものを選びましょう。

【運動について】
活動レベルは「${answers.activityLevel}」で、運動習慣は「${answers.exerciseHabit === 'yes' ? 'あり' : 'なし'}」ですね。${answers.exerciseHabit === 'yes' ? 'これまでの運動習慣を活かしつつ、' : 'まずは軽い運動から始めて、'}目標達成に向けて継続していきましょう。

【睡眠について】
睡眠時間は${answers.sleepDuration}、睡眠の質は${answers.sleepQuality}とのこと。良質な睡眠は健康管理の基本です。規則正しい生活リズムを心がけてください。

あなたの生活スタイルに合わせて、無理なく継続できる健康習慣を身につけていきましょう。一歩一歩着実に進んでいけば、必ず目標達成できます。応援しています！`;
  }


  // テキストが体重記録の意図かどうかを判定
  async analyzeWeightRecordIntent(text: string) {
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
      
      const prompt = `
テキスト「${text}」を分析して、体重記録の意図があるかどうか以下のJSONで返してください：

{
  "isWeightRecord": boolean,
  "weight": number,
  "confidence": number
}

判定基準：
- 数値＋体重単位：「65kg」「64.5キロ」「63.2」「81.5kg」「80kg」
- 体重記録の表現：「体重65kg」「今日の体重は64キロ」「体重記録 65.5」
- 質問・相談は除外：「体重どうやって減らす？」「何キロがいい？」

例：
- 「65kg」→ isWeightRecord: true, weight: 65
- 「81.5kg」→ isWeightRecord: true, weight: 81.5
- 「体重64.5キロ」→ isWeightRecord: true, weight: 64.5
- 「今日の体重は63kg」→ isWeightRecord: true, weight: 63
- 「体重どうやって減らす？」→ isWeightRecord: false

**重要：「81.5kg」「65kg」など数値+単位の単独入力は必ず体重記録として判定してください**
`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const jsonText = response.text().replace(/```json|```/g, '').trim();
      
      return JSON.parse(jsonText);
    } catch (error) {
      console.error('体重記録意図分析エラー:', error);
      // フォールバック: 体重パターンマッチング
      const weightMatch = text.match(/(\d+(?:\.\d+)?)(?:kg|キロ|キログラム)?/);
      const hasWeightKeyword = /体重|kg|キロ|キログラム/.test(text);
      
      if (weightMatch && hasWeightKeyword) {
        const weight = parseFloat(weightMatch[1]);
        
        return {
          isWeightRecord: true,
          weight: weight,
          confidence: 0.8
        };
      }
      
      return {
        isWeightRecord: false,
        weight: null,
        confidence: 0.5
      };
    }
  }

  // テキストが食事記録の意図かどうかを判定
  async analyzeFoodRecordIntent(text: string) {
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
      
      const prompt = `
テキスト「${text}」を分析して、食事記録の意図があるかどうか以下のJSONで返してください：

{
  "isFoodRecord": boolean,
  "isDefiniteRecord": boolean,
  "hasSpecificMealTime": boolean,
  "mealTime": string,
  "isMultipleMealTimes": boolean,
  "mealTimes": [{"mealTime": string, "foodText": string}],
  "foodText": string,
  "confidence": number
}

判定基準：
- 食べ物の名前が含まれている（例：「唐揚げ」「からあげ」「ラーメン」「らーめん」「りんご」）
- 食事に関する動詞（食べた、たべた、飲んだ、のんだ、摂取した、記録して、きろくして、記録しといて、記録しとく）※動詞なしでも食事名があれば記録可能
- 明確な記録意図：「記録して」「きろくして」「記録しといて」「記録しとく」「食べた」「たべた」「摂取した」「昼 ラーメン」「夜 カツ丼」
- **重要：一回のテキストで2つ以上の食事時間が含まれている場合は必ずisMultipleMealTimes: trueにする**
- 曖昧な表現：「食べた！」「美味しかった」「おいしかった」（確認が必要）
- 食事時間：「朝」「あさ」「昼」「ひる」「夜」「よる」「朝食」「昼食」「夕食」「朝ごはん」「朝ご飯」「昼ごはん」「昼ご飯」「夜ごはん」「夜ご飯」「晩ごはん」「晩ご飯」「間食」「おやつ」
- 質問・相談は除外：「～はダイエットに良い？」「～のカロリーは？」

**重要: foodTextには分量を含む食事部分全体を入れる**

例：
- 「唐揚げ食べた記録して」→ isFoodRecord: true, isDefiniteRecord: true, foodText: "唐揚げ"
- 「からあげたべたきろくして」→ isFoodRecord: true, isDefiniteRecord: true, foodText: "からあげ"
- 「朝にパン食べた記録して」→ hasSpecificMealTime: true, mealTime: "breakfast", foodText: "パン"
- 「あさにぱんたべた」→ hasSpecificMealTime: true, mealTime: "breakfast", foodText: "ぱん"
- 「今日唐揚げ食べた！」→ isFoodRecord: true, isDefiniteRecord: false, foodText: "唐揚げ"
- 「きょうからあげたべた」→ isFoodRecord: true, isDefiniteRecord: false, foodText: "からあげ"
- 「唐揚げとご飯100g食べた！」→ isFoodRecord: true, isDefiniteRecord: true, foodText: "唐揚げとご飯100g"
- 「昼に唐揚げ食べたから記録しといて」→ hasSpecificMealTime: true, mealTime: "lunch", foodText: "唐揚げ"
- 「ご飯100g」→ isFoodRecord: true, isDefiniteRecord: true, foodText: "ご飯100g"
- 「食パン2枚記録して」→ isFoodRecord: true, isDefiniteRecord: true, foodText: "食パン2枚"
- 「らーめん」→ isFoodRecord: true, isDefiniteRecord: true, foodText: "らーめん"
- 「昼 ラーメン」→ hasSpecificMealTime: true, mealTime: "lunch", foodText: "ラーメン"
- 「夜 カツ丼とオムライス」→ hasSpecificMealTime: true, mealTime: "dinner", foodText: "カツ丼とオムライス"
- 「今 昼 ラーメン 唐揚げ4個 チャーハン 記録」→ hasSpecificMealTime: true, mealTime: "lunch", foodText: "ラーメン 唐揚げ4個 チャーハン"
- 「朝にパンとコーヒー 昼にカツ丼 夜に納豆」→ isMultipleMealTimes: true, mealTimes: [{"mealTime": "breakfast", "foodText": "パンとコーヒー"}, {"mealTime": "lunch", "foodText": "カツ丼"}, {"mealTime": "dinner", "foodText": "納豆"}]
- 「朝に唐揚げ 夜に納豆 記録して」→ isMultipleMealTimes: true, mealTimes: [{"mealTime": "breakfast", "foodText": "唐揚げ"}, {"mealTime": "dinner", "foodText": "納豆"}]
- 「朝におにぎりと卵焼き 昼にカツ丼とラーメン 夜にヨーグルト」→ isMultipleMealTimes: true, mealTimes: [{"mealTime": "breakfast", "foodText": "おにぎりと卵焼き"}, {"mealTime": "lunch", "foodText": "カツ丼とラーメン"}, {"mealTime": "dinner", "foodText": "ヨーグルト"}]
- 「昼食でハンバーガー 間食でケーキ記録して」→ isMultipleMealTimes: true, mealTimes: [{"mealTime": "lunch", "foodText": "ハンバーガー"}, {"mealTime": "snack", "foodText": "ケーキ"}]
- 「朝 パン 夜 カツ丼」→ isMultipleMealTimes: true, mealTimes: [{"mealTime": "breakfast", "foodText": "パン"}, {"mealTime": "dinner", "foodText": "カツ丼"}]
- 「朝ごはんにパン食べた」→ hasSpecificMealTime: true, mealTime: "breakfast", foodText: "パン"
- 「昼ご飯でラーメン記録して」→ hasSpecificMealTime: true, mealTime: "lunch", foodText: "ラーメン"
- 「夜ごはんのカツ丼」→ hasSpecificMealTime: true, mealTime: "dinner", foodText: "カツ丼"
- 「晩ご飯に唐揚げ」→ hasSpecificMealTime: true, mealTime: "dinner", foodText: "唐揚げ"
`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const jsonText = response.text().replace(/```json|```/g, '').trim();
      
      return JSON.parse(jsonText);
    } catch (error) {
      console.error('食事記録意図分析エラー:', error);
      // フォールバック: 食べ物名が含まれているかチェック
      const hasFoodName = /カレー|ラーメン|うどん|そば|パン|おにぎり|弁当|サラダ|寿司|パスタ|ご飯|丼|定食|ハンバーグ|唐揚げ|焼き魚|天ぷら|味噌汁|スープ|野菜|肉|魚|卵|米|麺|牛肉|豚肉|鶏肉|りんご|バナナ|ヨーグルト|チーズ|コーヒー|紅茶/.test(text);
      const hasRecordIntent = /食べた|飲んだ|摂取|記録/.test(text);
      
      return {
        isFoodRecord: hasFoodName,
        isDefiniteRecord: hasFoodName, // 食べ物名があれば記録として扱う
        hasSpecificMealTime: false,
        mealTime: null,
        foodText: text,
        confidence: 0.5
      };
    }
  }

  // テキストから食事内容を分析
  async analyzeMealFromText(mealText: string, userId?: string) {
    try {
      const persona = getCharacterPersona(null);
      const language = getCharacterLanguage(null);
      const languageInstruction = getLanguageInstruction(language);

      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
      
      const prompt = `**CRITICAL: 必ず指定されたJSON形式のみで回答してください。挨拶や説明は一切不要です。**

${languageInstruction}

あなたは「${persona.name}」として振る舞ってください。

【キャラクター設定】
性格: ${persona.personality}
口調: ${persona.tone}

【重要なLINE応答ルール】
- nutritionAdviceは1-2行の短いメッセージ
- 適切な改行で読みやすく（長い文章は避ける）
- 句読点は最小限
- **必ず食事内容に具体的に言及する**
- **栄養バランス（良い点・改善点）を明確に指摘**
- キャラクターの口調を反映

**重要**: すべての食品名は必ず日本語で表記してください。英語や他の言語の食品名が含まれている場合は、日本語に翻訳して表記してください。

食事内容のテキスト「${mealText}」を分析して、以下の形式のJSONで返してください。

// 多言語対応指示（一時無効化 - 将来復活予定）
// **重要**: この食事は日本語、英語、韓国語、中国語、スペイン語など任意の言語で入力されています。言語に関係なく正確な栄養分析を行い、食品名は入力された言語のまま保持してください。

複数の食事が含まれている場合（「唐揚げとご飯100g」のような場合は必ずこの形式）：
**注意：すべてのname、displayName、baseFoodは必ず日本語で記載してください**
{
  "isMultipleMeals": true,
  "meals": [
    {
      "name": "唐揚げ",
      "displayName": "唐揚げ",
      "baseFood": "唐揚げ",
      "portion": "1人前",
      "calories": 推定カロリー数値（整数）,
      "protein": タンパク質のグラム数（小数点第1位まで）,
      "carbs": 炭水化物のグラム数（小数点第1位まで）,
      "fat": 脂質のグラム数（小数点第1位まで）
    },
    {
      "name": "ご飯100g",
      "displayName": "ご飯100g",
      "baseFood": "ご飯",
      "portion": "100g",
      "calories": 推定カロリー数値（整数）,
      "protein": タンパク質のグラム数（小数点第1位まで）,
      "carbs": 炭水化物のグラム数（小数点第1位まで）,
      "fat": 脂質のグラム数（小数点第1位まで）
    }
  ],
  "totalCalories": 合計カロリー（整数）,
  "totalProtein": 合計タンパク質（小数点第1位まで）,
  "totalCarbs": 合計炭水化物（小数点第1位まで）,
  "totalFat": 合計脂質（小数点第1位まで）
}

単一の食事の場合：
**注意：displayName、baseFoodは必ず日本語で記載してください**
{
  "isMultipleMeals": false,
  "foodItems": ["食品名（分量込み）"],
  "displayName": "ユーザーが入力した正確な表記",
  "baseFood": "基本食品名",
  "portion": "分量部分",
  "calories": 推定カロリー数値（整数）,
  "protein": タンパク質のグラム数（小数点第1位まで）,
  "carbs": 炭水化物のグラム数（小数点第1位まで）,
  "fat": 脂質のグラム数（小数点第1位まで）,
  "nutritionAdvice": "ヘルシーくんの親しみやすい口調で1-2行の短いアドバイス（改行含む）。食事内容に具体的に言及し、栄養バランスの良い点・改善点を明確に指摘。"
}

**重要：材料列挙は一つの料理として認識**
- 「鍋 白菜 豚肉 きのこ」→ 一つの鍋料理として分析
- 「カレー 人参 玉ねぎ 豚肉」→ 一つのカレーとして分析
- 「サラダ レタス トマト きゅうり」→ 一つのサラダとして分析
- 「ラーメン チャーシュー もやし」→ 一つのラーメンとして分析

**重要：複数食事の判定基準（必須遵守）**
- 「と」「、」「＋」「&」「および」「それから」「あと」などで複数の食事が結ばれている場合は**絶対にisMultipleMeals: trueにする**
- 明らかに異なる2つ以上の食べ物が含まれている場合は必ず分離する：
  * 「納豆とオムライス」→ 納豆とオムライス別々
  * 「パンとコーヒー」→ パンとコーヒー別々  
  * 「りんごとヨーグルト」→ りんごとヨーグルト別々
  * 「唐揚げとご飯100g」→ 唐揚げとご飯別々
  * 「焼き魚とみそ汁」→ 焼き魚とみそ汁別々
- **絶対に単一食事として扱ってはいけない組み合わせ例：**
  * 主食+おかず（ご飯と○○、パンと○○など）
  * 飲み物+食べ物（コーヒーと○○、牛乳と○○など）  
  * 明らかに別々の料理（○○と○○、○○、○○など）
- 複数の食べ物がある場合は、必ずmeals配列にそれぞれ個別に分けて入れる

注意：
- カロリーは整数、PFC（タンパク質・脂質・炭水化物）は小数点第1位まで正確に計算
- 単位は含めない（例：カロリー350、タンパク質23.4）
- 食品名・料理名は日本語で
// 多言語対応指示（一時無効化 - 将来復活予定）
// - **多言語対応**: 食品名・料理名は入力された言語のまま保持
//   * 英語入力 → 英語で出力 (例: "fried chicken" → name: "fried chicken")
//   * 韓国語入力 → 韓国語で出力 (例: "치킨" → name: "치킨")  
//   * 中国語入力 → 中国語で出力 (例: "炸鸡" → name: "炸鸡")
//   * 日本語以外でも正確な栄養分析を行う
- **重要: 分量が指定されている場合は必ずその分量で正確に計算する**
- **displayNameにはユーザーが入力した文字をそのまま記録（勝手に分量を追加しない）**
- **nameには基本的な食品名のみ（「(3個)」「(1人前)」などの分量表記は追加しない）**
- baseFoodは基本的な食品名、portionは分量部分を分離

**重要: 現実的なカロリー計算を行う**
- ご飯1杯(150g): 約250kcal
- ラーメン1杯: 約400-600kcal（具材により変動）
- 唐揚げ3個: 約150kcal
- 食パン1枚: 約160kcal
- バナナ1本: 約90kcal
- おにぎり1個: 約180kcal
- カツ丼1杯: 約800kcal
- サラダ(野菜のみ): 約20-50kcal
- 過大評価しない: 1000kcal超えは大盛り・高カロリー食品のみ

分量指定の例：
- 「ご飯100g」→ displayName: "ご飯100g", baseFood: "ご飯", portion: "100g"
- 「餃子5個」→ displayName: "餃子5個", baseFood: "餃子", portion: "5個"
- 「食パン2枚」→ displayName: "食パン2枚", baseFood: "食パン", portion: "2枚"

**最終確認（必須）：**
入力に「と」や複数の食べ物が含まれている場合は、絶対にisMultipleMeals: trueにして、必ずmeals配列に分離してください。
例：「唐揚げとご飯100g」→ 必ずisMultipleMeals: trueで唐揚げとご飯を別々に分析
`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      let jsonText = response.text().replace(/```json|```/g, '').trim();
      
      // JSONを壊す日本語文字を修正
      jsonText = jsonText
        .replace(/[「」]/g, '"')  // 日本語括弧を英語に変換
        .replace(/[『』]/g, '"')  // 日本語二重括弧を英語に変換
        .replace(/['']/g, "'")   // カーブした引用符を直線に変換
        .replace(/[""]/g, '"')   // カーブした二重引用符を直線に変換
        .replace(/[…]/g, '...')  // 日本語省略記号を英語に変換
        .replace(/[～〜]/g, '~') // 日本語チルダを英語に変換
        .replace(/[－—―]/g, '-') // 日本語ダッシュを英語に変換
        .replace(/[０-９]/g, (match) => String.fromCharCode(match.charCodeAt(0) - 0xFF10 + 0x30)); // 全角数字を半角に変換
      
      const analysis = JSON.parse(jsonText);
      
      
      return analysis;
    } catch (error) {
      console.error('食事テキスト分析エラー:', error);
      // フォールバック値を返す（現実的な値に設定）
      return {
        foodItems: [mealText],
        displayName: mealText,
        baseFood: mealText,
        portion: "",
        calories: 250, // 一般的な1食分（ご飯1杯程度）
        protein: 8.0,  // 控えめなタンパク質
        carbs: 45.0,   // 主食中心
        fat: 5.0,      // 低脂質
        nutritionAdvice: 'バランスの良い食事を心がけましょう！'
      };
    }
  }

  // 画像から食事内容を分析
  async analyzeMealFromImage(imageBuffer: Buffer, userId?: string) {
    try {
      const persona = getCharacterPersona(null);
      const language = getCharacterLanguage(null);
      const languageInstruction = getLanguageInstruction(language);

      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
      
      const prompt = `**CRITICAL: 必ず指定されたJSON形式のみで回答してください。挨拶や説明は一切不要です。**

この画像を分析してください。まず、この画像が食事・料理・食べ物の写真かどうかを判定してください。

**重要**: すべての料理名・食品名は必ず日本語で表記してください。英語や他の言語の料理名・食品名が含まれている場合は、日本語に翻訳して表記してください。

食事・料理・食べ物の場合は、以下の形式のJSONで返してください：
{
  "isFoodImage": true,
  // 以下の分析内容
}

複数の料理が写っている場合：
**注意：すべてのname（料理名）は必ず日本語で記載してください**
{
  "isFoodImage": true,
  "isMultipleMeals": true,
  "meals": [
    {
      "name": "料理名1（日本語）",
      "calories": 推定カロリー数値（整数）,
      "protein": タンパク質のグラム数（小数点第1位まで）,
      "carbs": 炭水化物のグラム数（小数点第1位まで）,
      "fat": 脂質のグラム数（小数点第1位まで）
    },
    {
      "name": "料理名2（日本語）",
      "calories": 推定カロリー数値（整数）,
      "protein": タンパク質のグラム数（小数点第1位まで）,
      "carbs": 炭水化物のグラム数（小数点第1位まで）,
      "fat": 脂質のグラム数（小数点第1位まで）
    }
  ],
  "totalCalories": 合計カロリー（整数）,
  "totalProtein": 合計タンパク質（小数点第1位まで）,
  "totalCarbs": 合計炭水化物（小数点第1位まで）,
  "totalFat": 合計脂質（小数点第1位まで）
}

単一の料理の場合：
**注意：料理名は必ず日本語で記載してください**
{
  "isFoodImage": true,
  "isMultipleMeals": false,
  "foodItems": ["料理名（日本語）"],
  "calories": 推定カロリー数値（整数）,
  "protein": タンパク質のグラム数（小数点第1位まで）,
  "carbs": 炭水化物のグラム数（小数点第1位まで）,
  "fat": 脂質のグラム数（小数点第1位まで）,
  "nutritionAdvice": "ヘルシーくんの親しみやすい口調で1-2行の短いアドバイス（改行含む）。食事内容に具体的に言及し、栄養バランスの良い点・改善点を明確に指摘。"
}

注意：
- 複数の料理が明確に分かれて写っている場合は複数食事として扱う
- 料理名は具体的に（例：「ラーメン」「チャーハン」「唐揚げ」）
- 詳細な食材名ではなく、料理の名前で答える
- **重要：材料列挙は一つの料理として判定する**
  - 「鍋 白菜 豚肉 きのこ」→ 「鍋料理（白菜、豚肉、きのこ）」として一つの食事
  - 「カレー 人参 玉ねぎ 豚肉」→ 「カレー（人参、玉ねぎ、豚肉）」として一つの食事
  - 「サラダ レタス トマト きゅうり」→ 「サラダ（レタス、トマト、きゅうり）」として一つの食事
- カロリーは整数、PFC（タンパク質・脂質・炭水化物）は小数点第1位まで正確に計算
- 単位は含めない（例：カロリー350、タンパク質23.4）
- 推定は一般的な分量で計算

**重要: 現実的なカロリー計算を行う**
- ご飯1杯(150g): 約250kcal
- ラーメン1杯: 約400-600kcal（具材により変動）
- 唐揚げ3個: 約150kcal
- 食パン1枚: 約160kcal
- バナナ1本: 約90kcal
- おにぎり1個: 約180kcal
- カツ丼1杯: 約800kcal
- サラダ(野菜のみ): 約20-50kcal
- ハンバーガー1個: 約500kcal
- パスタ1人前: 約400-600kcal
- 過大評価しない: 1000kcal超えは大盛り・高カロリー食品のみ
- 小鉢・副菜: 50-150kcal程度

食事・料理・食べ物ではない場合（風景、人物、物など）：
{
  "isFoodImage": false,
  "description": "画像の簡潔な説明（30文字以内）"
}

例：
- 空の写真 → {"isFoodImage": false, "description": "青い空と雲の風景"}
- ペットの写真 → {"isFoodImage": false, "description": "可愛い犬の写真"}
- 建物の写真 → {"isFoodImage": false, "description": "建物の外観"}
`;

      const imagePart = {
        inlineData: {
          data: imageBuffer.toString('base64'),
          mimeType: 'image/jpeg',
        },
      };

      const result = await model.generateContent([prompt, imagePart]);
      const response = await result.response;
      const jsonText = response.text().replace(/```json|```/g, '').trim();
      
      const analysis = JSON.parse(jsonText);
      
      
      return analysis;
    } catch (error) {
      console.error('食事画像分析エラー:', error);
      // フォールバック値を返す（現実的な値に設定）
      return {
        foodItems: ['食事'],
        calories: 300, // 一般的な1食分
        protein: 12.0, // 控えめなタンパク質
        carbs: 45.0,   // 主食中心
        fat: 8.0,      // 適度な脂質
        nutritionAdvice: 'バランスの良い食事を心がけましょう！'
      };
    }
  }

  // 一般的な画像内容解析（通常モード用）
  async analyzeGeneralImage(imageBuffer: Buffer): Promise<string> {
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
      
      const prompt = `
この画像を見て、内容を簡潔に説明してください。

**重要な指示：**
- 30文字以内で簡潔に
- 何が写っているかを分かりやすく
- 食べ物、人、動物、風景、物など主要な被写体を中心に
- 具体的で親しみやすい表現で

**例：**
- "美味しそうなラーメンの写真"
- "可愛い猫が座っている様子"
- "きれいな夕焼けの空"
- "机の上にあるコーヒーカップ"

説明文のみを返してください（JSON形式ではなく、文章のみ）。
`;

      const imagePart = {
        inlineData: {
          data: imageBuffer.toString('base64'),
          mimeType: 'image/jpeg',
        },
      };

      const result = await model.generateContent([prompt, imagePart]);
      const response = await result.response;
      const description = response.text().trim();
      
      return description;
    } catch (error) {
      console.error('🖼️ 一般画像解析エラー:', error);
      return '画像の内容を認識できませんでした';
    }
  }

  // 食事写真を分析（将来の機能 - 後方互換性のため残す）
  async analyzeMealImage(imageBuffer: Buffer) {
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
      
      const prompt = `
この食事の写真を分析して、以下の情報を日本語のJSONで返してください：
{
  "dishes": ["料理名1", "料理名2"],
  "estimatedCalories": 概算カロリー,
  "macros": {
    "protein": タンパク質(g),
    "carbs": 炭水化物(g),
    "fat": 脂質(g)
  },
  "healthiness": "健康度(1-5)",
  "suggestions": ["改善提案1", "改善提案2"]
}
`;

      const imagePart = {
        inlineData: {
          data: imageBuffer.toString('base64'),
          mimeType: 'image/jpeg',
        },
      };

      const result = await model.generateContent([prompt, imagePart]);
      const response = await result.response;
      
      return JSON.parse(response.text());
    } catch (error) {
      console.error('食事画像分析エラー:', error);
      throw new Error('食事画像の分析に失敗しました');
    }
  }

  // レシピ質問かどうかを判定
  async isRecipeQuestion(userMessage: string): Promise<boolean> {
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
      
      const prompt = `
以下のメッセージが**具体的なレシピや作り方を求める質問**かどうか判定してください。

メッセージ: "${userMessage}"

**レシピ要求（true）：**
- 「○○の作り方教えて」「○○のレシピ教えて」
- 「○○ってどう作るの？」「○○の作り方は？」
- 「レシピ教えて」「作り方教えて」（明確にレシピや作り方を要求）
- 「○○で作れるレシピ教えて」「○○を使ったレシピ」
- 「余った○○でレシピ教えて」「○○が余ってるからレシピ教えて」
- 「○○で何か作れるレシピある？」

**レシピ要求ではない（false）：**
- 相談・悩み：「何作ろうかな」「今日何食べよう」「お昼何にしよう」
- 曖昧な要求：「料理教えて」「美味しい料理教えて」「おすすめ料理教えて」
- 単純な食材質問：「鶏肉で何作れる？」（「レシピ」という言葉がない場合）
- 条件だけの質問：「簡単なもの教えて」「300円で作れるもの教えて」（「レシピ」という言葉がない場合）
- 運動・健康法：「筋トレ」「ダイエット方法」「健康になる方法」
- 既存レシピへの質問：「これヘルシー？」「カロリーどれくらい？」
- 一般相談：「疲れた」「眠い」「体調悪い」
- 感想：「美味しそう」「ありがとう」

**判定基準（適切なバランス）：**
- 「レシピ」「作り方」という単語が含まれている
- 「〇〇ってどう作るの？」など具体的な料理名+作り方の組み合わせ
- 食材を使った「レシピ教えて」「作れるレシピ」など明確な要求
- 食材が余っている状況でのレシピ要求

**重要：レシピを明確に求めている場合はtrueにしてください**

true または false で回答してください。`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text().trim().toLowerCase();
      
      return text.includes('true');
    } catch (error) {
      console.error('レシピ判定エラー:', error);
      return false;
    }
  }

  // レシピ生成とFlexメッセージ作成
  async generateRecipeWithFlex(userMessage: string, userId?: string): Promise<{ textResponse: string; flexMessage?: any }> {
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
      
      // 会話履歴を取得
      let conversationHistory = '';
      if (userId) {
        const history = await this.getConversationHistory(userId);
        if (history.length > 0) {
          conversationHistory = '\n\n【過去の会話】\n';
          history.forEach((conv, index) => {
            conversationHistory += `${index + 1}. ユーザー: ${conv.userMessage}\n${conv.aiResponse}\n`;
          });
          conversationHistory += '\n';
        }
      }

      // 会話履歴からパターン回避のための情報を抽出
      const previousRecipes = conversationHistory ? conversationHistory.toLowerCase() : '';

      // 曖昧なヘルシーリクエスト用のランダム選択
      const isVagueHealthyRequest = /(?:痩せる|ダイエット|ヘルシー|健康的).*(?:レシピ|料理|食べ物)/.test(userMessage.toLowerCase()) && 
                                   !/(?:鶏|豚|牛|魚|サラダ|パスタ|カレー|スープ|炒め物|煮物|焼き物|唐揚げ|ハンバーグ|ステーキ|野菜|きのこ|豆腐|もやし|キャベツ|にんじん|じゃがいも|たまご|卵|麺|うどん|そば|ラーメン|米|ご飯|パン)/.test(userMessage.toLowerCase());
      
      let randomHealthyHint = '';
      if (isVagueHealthyRequest) {
        const healthyOptions = [
          { cuisine: '和風', style: '蒸し', ingredient: '豆腐' },
          { cuisine: '洋風', style: '焼き', ingredient: 'キノコ' },
          { cuisine: '中華風', style: '炒め', ingredient: 'もやし' },
          { cuisine: '韓国風', style: '和え', ingredient: 'キムチ' },
          { cuisine: 'タイ風', style: '煮込み', ingredient: 'ココナッツ' },
          { cuisine: 'イタリア風', style: 'グリル', ingredient: 'ズッキーニ' },
          { cuisine: 'メキシコ風', style: 'サルサ', ingredient: 'アボカド' },
          { cuisine: '地中海風', style: 'マリネ', ingredient: 'オリーブ' }
        ];
        const randomChoice = healthyOptions[Math.floor(Math.random() * healthyOptions.length)];
        randomHealthyHint = `今回は${randomChoice.cuisine}×${randomChoice.style}×${randomChoice.ingredient}をベースにした斬新なヘルシーレシピを提案してください。`;
      }

      const prompt = `
あなたは「ヘルシーくん」という親しみやすく経験豊富なパーソナルトレーナー兼栄養管理士です。タメ口で親しみやすい自然な口調で、友達感覚で話してください。
ユーザーの「${userMessage}」に対して、**質問の雰囲気やニュアンスに合わせた**健康的で栄養バランスの良いレシピを提案してください。

**🎯 重要な指示:**
- **ユーザーのリクエストを最優先**で、質問の内容通りの料理ジャンル・食材・スタイルで提案してください
- 過去の会話履歴を確認して、前回と同じようなレシピは避けてバリエーションを提供してください
${randomHealthyHint ? `- ${randomHealthyHint}` : ''}

**重要な応答ルール（CRITICAL）：
- 絶対に「ヘルシーくん：」やキャラクター名で始めない
- ユーザーの質問を繰り返さない・オウム返ししない
- 質問形式で始めない（例：「何作ろう？〜」「料理教えて？〜」）
- 回答内容から直接始める
- 必ず提案やレシピから直接始めてください**

**ユーザーの表現に応じたレシピ選択：**
- 「女の子にモテる料理」→ おしゃれなパスタ、イタリアン、見た目華やか
- 「男らしい料理」→ 肉料理、ガッツリ系、豪快な料理
- 「インスタ映えする料理」→ カラフル、見た目重視、フォトジェニック
- 「ワイルドな料理」→ スパイシー、BBQ系、アウトドア風
- 「上品な料理」→ 和食、繊細、上質な食材
- 「簡単な料理」→ 時短、シンプル、初心者向け
- 「安い料理」「節約料理」→ コスパ重視、身近な食材
- 「ヘルシー」「ダイエット」「痩せる」→ **絶対に鶏胸肉サラダは禁止！** 毎回全く異なるバリエーションで提案：
  * 和風系: 豆腐ステーキ、しらたき麺の和風パスタ、湯豆腐アレンジ、おからハンバーグ
  * 洋風系: カリフラワーライス、ズッキーニヌードル、キノコのリゾット風、白身魚のハーブ焼き  
  * アジア風系: こんにゃく麺フォー、野菜たっぷり春雨、豆腐チャンプルー、キムチ豆腐
  * 海鮮系: イカと野菜炒め、タコのマリネ、あさりの酒蒸し、鯖の味噌煮
  * 創作系: おから餃子、豆腐ピザ、野菜チップス、ココナッツカレー
  **毎回違うジャンル・食材・調理法で驚きのあるレシピを！**

【質問パターン別対応】
1. 軽い会話・挨拶：短めに自然に応答
   - 「ありがとう」→「どういたしまして！いつでも頼ってね」
   - 「おはよう」→「おはよう！今日も一緒に頑張ろう」
   - 「疲れた」→「お疲れ様！無理しないで、休む時は休もう」
   - 「こんにちは」→「こんにちは！調子はどう？」
   - 「眠い」→「眠いね。しっかり睡眠取るのも大切だよ」
   - 「暑い/寒い」→「体調管理気をつけてね。水分補給忘れずに」
   - 「忙しい」→「忙しい中でも体を大切にしてね」
   - 「楽しい」→「それは良かった！楽しい気持ちは健康にもいいよ」
   - 「悲しい」→「辛い時もあるよね。一人じゃないから大丈夫」
   - 「つまらない」→「そんな時もあるよ。何か楽しいこと見つけよう」
   - 「頑張る」→「応援してるよ！でも無理は禁物」
   - 「不安」→「不安な気持ちわかるよ。一緒に考えよう」
   - 「嬉しい」→「一緒に嬉しいよ！その調子だね」
   - 「辛い」→「辛い時は無理しないで。話を聞くよ」
   - 「雨」→「雨の日は室内運動がおすすめ！気分も大切にしてね」
   - 「天気」→「いい天気だね！外での運動日和だよ」
   - 「仕事」→「お仕事お疲れ様！体調管理も忘れずに」
   - 「学校」→「勉強も大事だけど、健康も大切にしてね」
   - 「休み」→「お休みゆっくりして！リフレッシュも必要だよ」
   - 「旅行」→「旅行いいね！旅先でも水分補給忘れずに」
   - 「映画/音楽/ゲーム」→「楽しむのも健康に良いよ！適度にね」
   - 「友達/家族」→「大切な人との時間いいね！心の健康も大事」
   - 「お金」→「節約も大事だけど、健康投資も忘れずに」
   - 「恋愛」→「応援してる！頑張って」
   - 「将来/夢」→「素敵な目標だね！健康な体で叶えよう」

2. 簡単な情報質問：簡潔にポイントを伝える
   **カロリー・栄養質問には必ず具体的数値で回答：**
   - 「○○のカロリー/栄養は？」→「○○は100gで約●●kcal。P（タンパク質）●g、F（脂質）●g、C（炭水化物）●g。[健康効果やアドバイス]」
   - 例：「もつ鍋のカロリーは？」→「もつ鍋は1人前（約300g）で約180kcal。P20g、F8g、C5g。低カロリー高タンパクで筋肉づくりに最高だよ！」
   - 例：「ご飯のカロリーは？」→「白ご飯は茶碗1杯（150g）で約250kcal。P4g、F1g、C55g。エネルギー源として効果的」
   - 例：「鶏胸肉のカロリーは？」→「鶏胸肉は100gで約190kcal。P22g、F11g、C0g。筋トレには最強の食材だね」

3. 中程度の相談：適度な詳しさで説明
   - 筋トレ種目の質問
   - ダイエット方法
   - 食事のアドバイス

4. 真剣な相談・詳しい説明が必要（5-10行以上の詳細回答）：必要な情報を丁寧に説明
   - 「本格的にダイエットしたい」
   - 「筋トレメニューを組んでほしい」
   - 「健康について悩んでる」
   - 「○○について詳しく教えて」
   - 「体調が気になる」「不安がある」「困ってる」など心配事
   - 「どうやって」「方法は」「やり方」「計画」「メニュー」「プラン」を含む質問
   
   ※真剣な相談には必ず：
   ・問題の理解と共感
   ・科学的根拠に基づく具体的解決策
   ・実践しやすい段階的アプローチ
   ・安心できる励ましとサポート

**重要判定ルール：「どうやって」「方法」「やり方」「詳しく」「教えて」「メニュー」「プラン」等が含まれる質問は、過去の会話が軽くても必ず詳細で丁寧な回答をする**

専門知識（世界最高レベル）：
- 栄養学：食品のカロリー・PFC・ビタミン・ミネラル・GI値・血糖値管理・腸内環境
  ※カロリー質問には必ず正確な数値（kcal、P/F/C）で回答し、簡潔で実用的なアドバイスを添える
- 筋トレ：効果的な種目・セット数・レップ数・重量設定・筋肥大理論・回復期間
- 有酸素運動：ランニング・HIIT・消費カロリー・脂肪燃焼・心肺機能向上
- ダイエット：基礎代謝・カロリー収支・PFCバランス・リバウンド防止・持続可能性
- 生活習慣：睡眠・ストレス管理・水分摂取・サプリメント・ホルモンバランス
- 健康管理：病気予防・免疫力向上・アンチエイジング・メンタルヘルス
- 体型改善：姿勢矯正・柔軟性向上・機能的動作・怪我予防
- レシピ・料理：目標別レシピ提案・献立作成・調理テクニック・食材代替・時短料理・栄養最適化調理法
- 食事プランニング：1週間献立・食材選び・買い物リスト・食事タイミング・季節の食材活用

話し方の絶対条件：
- 自然で親しみやすい標準語（敬語なし、フレンドリー）
- 質問のトーンに合わせて回答の長さを調整
- 常にユーザーに寄り添い、共感と理解を示す
- 断固禁止ワード：「やあ」「〇〇さ」「〇〇だとか」「〇〇とか」「〇〇ですとか」「〇〇みたいな」「〇〇ような」「〇〇か」「〇〇な」「なんて」「って感じで」「かもしれません」「だと思います」「でしょうか」「だが」「しかし」「である」「のである」「おう」「おお」「おい」「だぜ」「〜ぜ」
- 必須の話し方：「おすすめ」「効果的」「大切」「重要」など断定的で力強い表現
- 励ましの言葉：「応援してる」「一緒に頑張ろう」「大丈夫」「いつでも頼って」「話を聞くよ」
- どんな些細な会話でも相手を気遣い、健康や心の状態を気にかける
- あらゆる話題（天気、仕事、恋愛、趣味、日常等）でも健康的な視点で寄り添う
- 健康と関係ない話題でも、相手の気持ちに共感し、最後に健康への気遣いを入れる
- シンプルで分かりやすく、専門知識を易しい言葉で説明
- 曖昧な表現は一切使わず、具体的で明確な回答
- 世界最高レベルの健康・運動・栄養の専門知識を簡単に説明
- ユーザーの真剣な相談には必ず丁寧で包括的な回答をする
- 長い文章は適切に改行し、読みやすさを重視する${conversationHistory}

**重要: 必ず以下のJSON形式のみで回答してください。他のテキストは一切含めないでください。**

\`\`\`json
{
  "recipeName": "料理名",
  "textResponse": "ユーザーの表現に合わせた雰囲気で親しみやすく説明",
  "ingredients": ["材料1", "材料2", "材料3"],
  "instructions": ["手順1", "手順2", "手順3"],
  "cookingInfo": {
    "cookingTime": "調理時間（例：30分）",
    "servings": "人数（例：1人分）",
    "calories": "カロリー（例：約400kcal）"
  },
  "healthTips": "この料理・食材の健康効果や栄養的メリットを親しみやすく説明"
}
\`\`\`

条件：
- **絶対条件**: 毎回異なるジャンル・食材・調理法で、パターン化を完全回避
- 健康的で栄養バランスを重視しつつ、ユーザーの雰囲気に合わせた料理を選択
- 材料は12個以内（調味料含む、整合性重視）
- **重要**: スーパーで簡単に手に入る材料を优先（ローズマリー、バジル、タイムなどの特殊ハーブ禁止）
- 基本調味料: 醇油、味噜、砕糖、塩、こしょう、ゴマ油、マヨネーズ、ケチャップレベル
- 手順は12ステップ以内（詳細で分かりやすく）
- 材料欄にない調味料は作り方で使用禁止（完全な整合性を保つ）
- 親しみやすい「こたくん」の口調で、ユーザーの表現の雰囲気に合わせて説明
- **創造性重視**: 定番レシピより、意外性のある組み合わせや新しいアプローチを優先
- 敬語は使わず、フレンドリーに
- textResponseもユーザーの表現に応じた雰囲気で（例：「女の子にモテる料理」なら「これでモテモテ間違いなし！」みたいに）
- **基本は1人前で作成**（ユーザーが「2人分の〜」「4人分の〜」など明確に指定した場合はその分量で調整）
- 材料の分量は1人前に合わせて正確に記載
- カロリー計算も1人前基準で算出

**重要：バリエーション強化指示**
- **曖昧なレシピ質問**（「痩せるレシピ教えて」「ヘルシーな料理教えて」「ダイエット料理教えて」等）では、毎回全く異なるジャンル・食材・調理法を提案する
- 同じカテゴリでも和風・洋風・中華・韓国・タイ・イタリア等、国際色豊かに変える
- メイン食材も鶏肉・豚肉・魚・豆腐・きのこ・野菜等をローテーションする
- 調理法も炒める・蒸す・煮る・焼く・茹でる・和える等を使い分ける
- **絶対に前回と似たようなレシピを避ける**（例：鶏肉の同じような料理を連続で提案しない）

**特別な要求への対応：**
- **材料指定あり**（例：「鶏肉とじゃがいもで」「冷蔵庫に〇〇があるから」）→ 指定材料を必ず使用したレシピ
- **予算指定あり**（例：「300円で」「安く作れる」「節約」）→ 安い食材で総材料費を明記
- **時短要求**（例：「10分で」「簡単に」「手軽に」）→ 調理時間を短縮した手順
- **栄養重視**（例：「タンパク質多め」「ダイエット用」）→ 栄養バランスを最適化

**調味料は極力シンプルに：**
- だし → 白だし、めんつゆ、顆粒だし（「だし汁を作る」ではなく「白だし小さじ1」）
- 和風味付け → めんつゆ、ポン酢、醤油
- 洋風味付け → コンソメ、ケチャップ、マヨネーズ
- 中華風 → 鶏がらスープの素、オイスターソース、焼肉のたれ
- 複数調味料の組み合わせは避けて、1-2種類で完結させる
- 面倒な下処理や複雑な調味料作りは市販品で代用
- 「大さじ」「小さじ」「適量」程度のざっくり計量でOK

**材料費計算：**
- 予算指定がある場合は、各材料の概算価格と総額を cookingInfo に追加
- 「totalCost」: 「約300円」の形式で表示`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      
      try {
        // マークダウン記号を除去してJSONを抽出
        let responseText = response.text();
        
        console.log('🔍 レシピAI生成結果（生データ）:', responseText.substring(0, 300));
        
        // JSONブロックを探す（より堅牢に）
        let jsonString = '';
        
        // ```json...``` パターンをチェック
        const jsonBlockMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonBlockMatch) {
          jsonString = jsonBlockMatch[1].trim();
        } else {
          // { ... } パターンを探す
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            jsonString = jsonMatch[0].trim();
          } else {
            // JSON形式が見つからない場合
            throw new Error('JSON形式のレスポンスが見つかりません');
          }
        }
        
        console.log('🔍 抽出されたJSON:', jsonString.substring(0, 200));
        
        const jsonResponse = JSON.parse(jsonString);
        
        // Flexメッセージを生成
        const { createRecipeFlexMessage } = await import('./flexMessageTemplates');
        const flexMessage = createRecipeFlexMessage(
          jsonResponse.recipeName,
          jsonResponse.ingredients,
          jsonResponse.instructions,
          jsonResponse.cookingInfo,
          jsonResponse.healthTips
        );
        
        return {
          textResponse: jsonResponse.textResponse,
          flexMessage: flexMessage
        };
      } catch (parseError) {
        console.error('レシピJSON解析エラー:', parseError);
        // フォールバック: 通常のテキストレスポンス
        return {
          textResponse: await this.generateAdvancedResponse(userMessage, userId)
        };
      }
    } catch (error) {
      console.error('レシピ生成エラー:', error);
      return {
        textResponse: 'すみません、レシピの生成で問題が発生しました。もう一度お試しください。'
      };
    }
  }

  // 高性能な会話レスポンスを生成（通常モード用・専門的なパーソナルトレーナー）
  async generateAdvancedResponse(userMessage: string, userId?: string): Promise<string> {
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
      
      // 会話履歴を取得
      let conversationHistory = '';
      if (userId) {
        const history = await this.getConversationHistory(userId);
        if (history.length > 0) {
          conversationHistory = '\n\n【過去の会話】\n';
          history.forEach((conv, index) => {
            conversationHistory += `${index + 1}. ユーザー: ${conv.userMessage}\n${conv.aiResponse}\n`;
          });
          conversationHistory += '\n';
        }
      }
      
      const prompt = `
あなたは「ヘルシーくん」という親しみやすく経験豊富なパーソナルトレーナー兼栄養管理士です。タメ口で親しみやすい自然な口調で、友達感覚で話してください。

**最重要：現在の質問「${userMessage}」のみに集中して、内容の重要度・詳しさ・シリアス度を正確に判定し、それに応じた適切な長さと口調で回答してください。過去の会話履歴に引きずられてはいけません。**

**応答ルール（CRITICAL）：
- 絶対に「ヘルシーくん：」やキャラクター名で始めない
- ユーザーの質問を繰り返さない・オウム返ししない
- 質問形式で始めない（例：「唐揚げのカロリーなに？唐揚げは〜」「今日何食べよう？〜」）
- 逆質問や追加質問は一切禁止（「どんな目的？」「ダイエットのため？」「〜したい？」等は絶対に使わない）
- 回答内容から直接始める
- 現在の質問の性質を正確に判定し、軽い質問なら短く、真剣な質問なら詳しく回答する
- アドバイスや情報提供で完結し、相手に質問を投げかけない**

【質問パターン別対応（現在の質問のみを判定）】

**まず「${userMessage}」がどのパターンに該当するかを正確に判定してください：**

1. 軽い会話・挨拶（1-2行で十分）：短めに自然に応答
   - 「ありがとう」→「どういたしまして！いつでも頼ってね」
   - 「おはよう」→「おはよう！今日も一緒に頑張ろう」
   - 「疲れた」→「お疲れ様！無理しないで、休む時は休もう」
   - 「こんにちは」→「こんにちは！調子はどう？」
   - 「眠い」→「眠いね。しっかり睡眠取るのも大切だよ」
   - 「暑い/寒い」→「体調管理気をつけてね。水分補給忘れずに」
   - 「忙しい」→「忙しい中でも体を大切にしてね」
   - 「楽しい」→「それは良かった！楽しい気持ちは健康にもいいよ」
   - 「悲しい」→「辛い時もあるよね。一人じゃないから大丈夫」
   - 「つまらない」→「そんな時もあるよ。何か楽しいこと見つけよう」
   - 「頑張る」→「応援してるよ！でも無理は禁物」
   - 「不安」→「不安な気持ちわかるよ。一緒に考えよう」
   - 「嬉しい」→「一緒に嬉しいよ！その調子だね」
   - 「辛い」→「辛い時は無理しないで。話を聞くよ」
   - 「雨」→「雨の日は室内運動がおすすめ！気分も大切にしてね」
   - 「天気」→「いい天気だね！外での運動日和だよ」
   - 「仕事」→「お仕事お疲れ様！体調管理も忘れずに」
   - 「学校」→「勉強も大事だけど、健康も大切にしてね」
   - 「休み」→「お休みゆっくりして！リフレッシュも必要だよ」
   - 「旅行」→「旅行いいね！旅先でも水分補給忘れずに」
   - 「映画/音楽/ゲーム」→「楽しむのも健康に良いよ！適度にね」
   - 「友達/家族」→「大切な人との時間いいね！心の健康も大事」
   - 「お金」→「節約も大事だけど、健康投資も忘れずに」
   - 「恋愛」→「応援してる！頑張って」
   - 「将来/夢」→「素敵な目標だね！健康な体で叶えよう」

2. 簡単な情報質問：簡潔にポイントを伝える
   **カロリー・栄養質問には必ず具体的数値で回答：**
   - 「○○のカロリー/栄養は？」→「○○は100gで約●●kcal。P（タンパク質）●g、F（脂質）●g、C（炭水化物）●g。[健康効果やアドバイス]」
   - 例：「もつ鍋のカロリーは？」→「もつ鍋は1人前（約300g）で約180kcal。P20g、F8g、C5g。低カロリー高タンパクで筋肉づくりに最高だよ！」
   - 例：「ご飯のカロリーは？」→「白ご飯は茶碗1杯（150g）で約250kcal。P4g、F1g、C55g。エネルギー源として効果的」
   - 例：「鶏胸肉のカロリーは？」→「鶏胸肉は100gで約190kcal。P22g、F11g、C0g。筋トレには最強の食材だね」

3. 中程度の相談：適度な詳しさで説明
   - 筋トレ種目の質問
   - ダイエット方法
   - 食事のアドバイス

4. 真剣な相談・詳しい説明が必要（5-10行以上の詳細回答）：必要な情報を丁寧に説明
   - 「本格的にダイエットしたい」
   - 「筋トレメニューを組んでほしい」
   - 「健康について悩んでる」
   - 「○○について詳しく教えて」
   - 「体調が気になる」「不安がある」「困ってる」など心配事
   - 「どうやって」「方法は」「やり方」「計画」「メニュー」「プラン」を含む質問
   
   ※真剣な相談には必ず：
   ・問題の理解と共感
   ・科学的根拠に基づく具体的解決策
   ・実践しやすい段階的アプローチ
   ・安心できる励ましとサポート

**重要判定ルール：「どうやって」「方法」「やり方」「詳しく」「教えて」「メニュー」「プラン」等が含まれる質問は、過去の会話が軽くても必ず詳細で丁寧な回答をする**

専門知識（世界最高レベル）：
- 栄養学：食品のカロリー・PFC・ビタミン・ミネラル・GI値・血糖値管理・腸内環境
  ※カロリー質問には必ず正確な数値（kcal、P/F/C）で回答し、簡潔で実用的なアドバイスを添える
- 筋トレ：効果的な種目・セット数・レップ数・重量設定・筋肥大理論・回復期間
- 有酸素運動：ランニング・HIIT・消費カロリー・脂肪燃焼・心肺機能向上
- ダイエット：基礎代謝・カロリー収支・PFCバランス・リバウンド防止・持続可能性
- 生活習慣：睡眠・ストレス管理・水分摂取・サプリメント・ホルモンバランス
- 健康管理：病気予防・免疫力向上・アンチエイジング・メンタルヘルス
- 体型改善：姿勢矯正・柔軟性向上・機能的動作・怪我予防
- レシピ・料理：目標別レシピ提案・献立作成・調理テクニック・食材代替・時短料理・栄養最適化調理法
- 食事プランニング：1週間献立・食材選び・買い物リスト・食事タイミング・季節の食材活用

話し方の絶対条件：
- 自然で親しみやすい標準語（敬語なし、フレンドリー）
- 質問のトーンに合わせて回答の長さを調整
- 常にユーザーに寄り添い、共感と理解を示す
- 断固禁止ワード：「やあ」「〇〇さ」「〇〇だとか」「〇〇とか」「〇〇ですとか」「〇〇みたいな」「〇〇ような」「〇〇か」「〇〇な」「なんて」「って感じで」「かもしれません」「だと思います」「でしょうか」「だが」「しかし」「である」「のである」「おう」「おお」「おい」「だぜ」「〜ぜ」
- 必須の話し方：「おすすめ」「効果的」「大切」「重要」など断定的で力強い表現
- 励ましの言葉：「応援してる」「一緒に頑張ろう」「大丈夫」「いつでも頼って」「話を聞くよ」
- どんな些細な会話でも相手を気遣い、健康や心の状態を気にかける
- あらゆる話題（天気、仕事、恋愛、趣味、日常等）でも健康的な視点で寄り添う
- 健康と関係ない話題でも、相手の気持ちに共感し、最後に健康への気遣いを入れる
- シンプルで分かりやすく、専門知識を易しい言葉で説明
- 曖昧な表現は一切使わず、具体的で明確な回答
- 世界最高レベルの健康・運動・栄養の専門知識を簡単に説明
- ユーザーの真剣な相談には必ず丁寧で包括的な回答をする
- 長い文章は適切に改行し、読みやすさを重視する${conversationHistory}
返答:`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      
      // マークダウン記号を除去してプレーンテキストに変換
      let cleanText = response.text();
      cleanText = cleanText.replace(/\*\*/g, '');
      cleanText = cleanText.replace(/\*/g, '');
      cleanText = cleanText.replace(/#{1,6}\s*/g, '');
      cleanText = cleanText.replace(/`{1,3}/g, '');
      cleanText = cleanText.replace(/^\s*[-\*\+]\s*/gm, '');
      cleanText = cleanText.replace(/^\s*\d+\.\s*/gm, '');
      cleanText = cleanText.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
      cleanText = cleanText.replace(/\n\s*\n/g, '\n');
      
      // 人間らしい自然な改行を追加（句点・感嘆符で改行、空行なし）
      cleanText = cleanText.replace(/。(?!\s*$)/g, '。\n');
      cleanText = cleanText.replace(/！(?!\s*$)/g, '！\n');
      cleanText = cleanText.replace(/よ。/g, 'よ。\n');
      cleanText = cleanText.replace(/ね。/g, 'ね。\n');
      cleanText = cleanText.replace(/だよ。/g, 'だよ。\n');
      cleanText = cleanText.replace(/だね。/g, 'だね。\n');
      cleanText = cleanText.replace(/です。/g, 'です。\n');
      cleanText = cleanText.replace(/ます。/g, 'ます。\n');
      cleanText = cleanText.replace(/から。/g, 'から。\n');
      cleanText = cleanText.replace(/よ！/g, 'よ！\n');
      cleanText = cleanText.replace(/ね！/g, 'ね！\n');
      cleanText = cleanText.replace(/だよ！/g, 'だよ！\n');
      cleanText = cleanText.replace(/だね！/g, 'だね！\n');
      cleanText = cleanText.replace(/\n\s*\n/g, '\n');
      cleanText = cleanText.trim();
      
      return cleanText;
    } catch (error) {
      console.error('高性能会話AI エラー:', error);
      return 'すみません、現在詳細なアドバイスができません。少し時間をおいてもう一度お試しください。';
    }
  }

  // テキストが運動記録の意図かどうかを判定
  async analyzeExerciseRecordIntent(text: string) {
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
      
      const prompt = `

テキスト「${text}」を分析して、運動記録の意図があるかどうか以下のJSONで返してください：

単一の運動の場合：
{
  "isExerciseRecord": boolean,
  "isMultipleExercises": false,
  "exerciseType": string,
  "exerciseName": string,
  "displayName": string,
  "duration": number,
  "intensity": string,
  "hasSpecificDetails": boolean,
  "sets": number,
  "reps": number,
  "weight": number,
  "distance": number,
  "timeOfDay": string,
  "weightSets": [{"weight": number, "reps": number, "sets": number}],
  "confidence": number
}

複数の運動が含まれている場合：
{
  "isExerciseRecord": boolean,
  "isMultipleExercises": true,
  "exercises": [
    {
      "exerciseType": string,
      "exerciseName": string,
      "displayName": string,
      "duration": number,
      "intensity": string,
      "hasSpecificDetails": boolean,
      "sets": number,
      "reps": number,
      "weight": number,
      "distance": number,
      "timeOfDay": string,
      "weightSets": [{"weight": number, "reps": number, "sets": number}]
    }
  ],
  "confidence": number
}

判定基準：
- 運動・スポーツ・トレーニングに関する動詞（した、やった、行った、練習した、鍛えた、走った、歩いた、泳いだ、踊った、etc）
- 運動・スポーツ名（野球、サッカー、ランニング、筋トレ、ジム、ヨガ、テニス、バスケ、etc）
- 身体活動（散歩、ウォーキング、ジョギング、ストレッチ、腹筋、腕立て、スクワット、etc）
- 過去形表現（〜した、〜やった、〜行った）
- 時間・場所の表現（朝、夜、今日、昨日、ジムで、公園で、家で、etc）

運動の分類：
- "strength": 筋トレ、ウェイトトレーニング（腹筋、腕立て、スクワット、ベンチプレス、懸垂、バーベル、ダンベル、etc）
- "cardio": 有酸素運動（ランニング、ジョギング、ウォーキング、歩行、サイクリング、ハイキング、etc）
- "sports": スポーツ活動（野球、サッカー、テニス、バスケ、バレー、卓球、バドミントン、ゴルフ、etc）
- "water": 水中運動（水泳、プール、サーフィン、ダイビング、カヤック、ウィンドサーフィン、水中エアロ、etc）
- "martial_arts": 格闘技（空手、柔道、剣道、ボクシング、キックボクシング、武術、合気道、etc）
- "dance": ダンス（社交ダンス、ヒップホップダンス、バレエ、エアロビクスダンス、踊り、etc）
- "winter": ウィンタースポーツ（スキー、スノーボード、アイススケート、雪かき、etc）
- "flexibility": ストレッチ、ヨガ、ピラティス、太極拳、柔軟
- "daily": 日常活動（掃除、階段昇降、買い物、家事、ガーデニング、etc）

**重要：記録モード中はより敏感に判定し、運動の可能性があるものは積極的に記録として扱う**

**短縮表記の正式名称変換規則：**
- 腕立て → 腕立て伏せ
- 腹筋 → 腹筋運動
- 背筋 → 背筋運動
- スクワット → スクワット
- ベンチ → ベンチプレス
- デッド → デッドリフト

**カタカナ・数字のみ表記の対応：**
- キロ/kg → 重量単位として認識
- セット → セット数として認識
- 数字のみ（例：「ベンチ 120 10」）→ 重量 + 回数として解釈
- 運動名 + 数字のみ（例：「腕立て 10」）→ 運動名 + 回数として解釈
- 「回」がなくても数字は回数として認識

例：
- 「今日野球した！」→ isMultipleExercises: false, exerciseType: "sports", exerciseName: "野球", displayName: "野球", duration: 0, intensity: null
- 「朝起きて軽くランニングした」→ isMultipleExercises: false, exerciseType: "cardio", exerciseName: "ランニング", displayName: "ランニング", duration: 0, intensity: "light", timeOfDay: "朝"
- 「プールで泳いだ」→ isMultipleExercises: false, exerciseType: "water", exerciseName: "水泳", displayName: "水泳", duration: 0
- 「空手の練習した」→ isMultipleExercises: false, exerciseType: "martial_arts", exerciseName: "空手", displayName: "空手", duration: 0
- 「社交ダンス踊った」→ isMultipleExercises: false, exerciseType: "dance", exerciseName: "社交ダンス", displayName: "社交ダンス", duration: 0
- 「スキーしてきた」→ isMultipleExercises: false, exerciseType: "winter", exerciseName: "スキー", displayName: "スキー", duration: 0
- 「腹筋100回やった」→ isMultipleExercises: false, exerciseType: "strength", exerciseName: "腹筋運動", displayName: "腹筋 100回", reps: 100, hasSpecificDetails: true
- 「腕立て10回」→ isMultipleExercises: false, exerciseType: "strength", exerciseName: "腕立て伏せ", displayName: "腕立て伏せ 10回", reps: 10, hasSpecificDetails: true
- 「腕立て 10」→ isMultipleExercises: false, exerciseType: "strength", exerciseName: "腕立て伏せ", displayName: "腕立て伏せ 10回", reps: 10, hasSpecificDetails: true
- 「腕立て 10回 3セット」→ isMultipleExercises: false, exerciseType: "strength", exerciseName: "腕立て伏せ", displayName: "腕立て伏せ 10回 3セット", reps: 10, sets: 3, hasSpecificDetails: true, weightSets: [{"weight": 0, "reps": 10, "sets": 3}]
- 「ベンチ 120キロ 10回」→ isMultipleExercises: false, exerciseType: "strength", exerciseName: "ベンチプレス", displayName: "ベンチプレス 120kg 10回", weight: 120, reps: 10, hasSpecificDetails: true, weightSets: [{"weight": 120, "reps": 10, "sets": 1}]
- 「ベンチ 120 10」→ isMultipleExercises: false, exerciseType: "strength", exerciseName: "ベンチプレス", displayName: "ベンチプレス 120kg 10回", weight: 120, reps: 10, hasSpecificDetails: true, weightSets: [{"weight": 120, "reps": 10, "sets": 1}]
- 「ベンチ120kg 10回 2セット」→ isMultipleExercises: false, exerciseType: "strength", exerciseName: "ベンチプレス", displayName: "ベンチプレス 120kg 10回 2セット", weight: 120, reps: 10, sets: 2, hasSpecificDetails: true, weightSets: [{"weight": 120, "reps": 10, "sets": 2}]
- 「ベンチプレス 100kg 10回 1セット 120kg 10回 1セット」→ isMultipleExercises: false, exerciseType: "strength", exerciseName: "ベンチプレス", displayName: "ベンチプレス", weightSets: [{"weight": 100, "reps": 10, "sets": 1}, {"weight": 120, "reps": 10, "sets": 1}], hasSpecificDetails: true
- 「今日野球して、ジムに行って筋トレした」→ 
  isMultipleExercises: true, exercises: [
    {exerciseType: "sports", exerciseName: "野球", displayName: "野球"},
    {exerciseType: "strength", exerciseName: "筋トレ", displayName: "筋トレ"}
  ]
- 「朝15分くらい歩いた！多分3キロくらい」→ isMultipleExercises: false, exerciseType: "cardio", exerciseName: "ウォーキング", displayName: "ウォーキング 3km 15分", duration: 15, distance: 3, timeOfDay: "朝"

判定しない例：
- 「野球のルール教えて」→ isExerciseRecord: false（質問）
- 「ランニングシューズ買った」→ isExerciseRecord: false（買い物）
- 「ジムに行こうと思う」→ isExerciseRecord: false（予定・意図）

**重要：ユーザーの入力をそのまま保持する**
- duration: 明記されている場合のみ数値、されていない場合は0
- intensity: 明記されている場合のみ設定、されていない場合はnull
- sets, reps, weight, distance: 明記されている場合のみ数値、されていない場合は0
- **デフォルト値は一切追加せず、ユーザーが入力した情報のみを抽出する**

`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const jsonText = response.text().replace(/```json|```/g, '').trim();
      
      return JSON.parse(jsonText);
    } catch (error) {
      console.error('運動記録意図分析エラー:', error);
      // フォールバック: 基本的な運動関連キーワードをチェック（短縮名・カタカナ表記対応）
      const exerciseKeywords = /野球|サッカー|テニス|バスケ|バレー|ランニング|ジョギング|ウォーキング|散歩|筋トレ|ジム|ヨガ|ピラティス|ストレッチ|腹筋|腕立て|背筋|スクワット|ベンチプレス|ベンチ|デッド|デッドリフト|泳|水泳|サイクリング|自転車|踊|ダンス|階段|掃除|キロ|セット|した|やった|行った|練習|鍛え|走っ|歩い|泳い|踊っ/;
      const hasExerciseKeyword = exerciseKeywords.test(text);
      const hasPastTense = /した|やった|行った|練習した|鍛えた|走った|歩いた|泳いだ|踊った/.test(text);
      
      if (hasExerciseKeyword && hasPastTense) {
        // 簡単な運動タイプ判定
        let exerciseType = "daily";
        let exerciseName = "運動";
        
        if (/野球|サッカー|テニス|バスケ|バレー/.test(text)) {
          exerciseType = "sports";
          exerciseName = text.match(/野球|サッカー|テニス|バスケ|バレー/)?.[0] || "スポーツ";
        } else if (/ランニング|ジョギング|ウォーキング|散歩|走っ|歩い/.test(text)) {
          exerciseType = "cardio";
          exerciseName = "ランニング";
        } else if (/筋トレ|ジム|腹筋|腕立て|背筋|スクワット|ベンチプレス|ベンチ|デッド|デッドリフト|鍛え/.test(text)) {
          exerciseType = "strength";
          // 短縮名を正式名称に変換
          if (/腕立て/.test(text)) {
            exerciseName = "腕立て伏せ";
          } else if (/腹筋/.test(text)) {
            exerciseName = "腹筋運動";
          } else if (/背筋/.test(text)) {
            exerciseName = "背筋運動";
          } else if (/ベンチ/.test(text)) {
            exerciseName = "ベンチプレス";
          } else if (/デッド/.test(text)) {
            exerciseName = "デッドリフト";
          } else {
            exerciseName = "筋トレ";
          }
        } else if (/ヨガ|ピラティス|ストレッチ/.test(text)) {
          exerciseType = "flexibility";
          exerciseName = text.match(/ヨガ|ピラティス|ストレッチ/)?.[0] || "ストレッチ";
        }
        
        return {
          isExerciseRecord: true,
          isMultipleExercises: false,
          exerciseType,
          exerciseName,
          duration: 0, // デフォルト値は設定しない
          intensity: null, // デフォルト値は設定しない
          hasSpecificDetails: false,
          sets: 0,
          reps: 0,
          weight: 0,
          distance: 0,
          confidence: 0.7
        };
      }
      
      return {
        isExerciseRecord: false,
        isMultipleExercises: false,
        exerciseType: null,
        exerciseName: null,
        duration: 0,
        intensity: null,
        hasSpecificDetails: false,
        sets: 0,
        reps: 0,
        weight: 0,
        distance: 0,
        confidence: 0.5
      };
    }
  }

  // 一般会話機能（エラー時フォールバック用）
  async generateGeneralResponse(userMessage: string, userId?: string): Promise<string> {
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
      
      // キャラクターのペルソナと言語を取得
      const persona = getCharacterPersona(null);
      const language = getCharacterLanguage(null);
      const languageInstruction = getLanguageInstruction(language);
      
      console.log('🎭 AIサービス - 使用ペルソナ:', { 
        name: persona.name, 
        personality: persona.personality.substring(0, 50) + '...',
        tone: persona.tone.substring(0, 30) + '...',
        language: language
      });
      
      // 会話履歴を取得
      let conversationHistory = '';
      if (userId) {
        const history = await this.getConversationHistory(userId);
        if (history.length > 0) {
          conversationHistory = '\n\n【過去の会話】\n';
          history.forEach((conv, index) => {
            conversationHistory += `${index + 1}. ユーザー: ${conv.userMessage}\n${conv.aiResponse}\n`;
          });
          conversationHistory += '\n';
        }
      }
      
      const languageSpecificPrompt = language === 'ja' ? 
        `あなたは「${persona.name}」として振る舞ってください。

【キャラクター設定】
- 名前: ${persona.name}
- 性格: ${persona.personality}
- 口調: ${persona.tone}
- 専門知識：栄養学（カロリー・PFC・ビタミン・ミネラル）、筋トレ（セット数・レップ数・重量設定）、ダイエット（基礎代謝・カロリー収支・PFCバランス）、生活習慣（睡眠・ストレス管理・水分摂取）

ユーザー：「${userMessage}」

${persona.name}として、あらゆる話題に柔軟に対応してください：
・日常的な挨拶や雑談：親しみやすく短めに自然に応答
・健康や食事の質問：専門知識を活かして具体的に実践的なアドバイスを提供する
・人生相談・悩み相談：恋愛、仕事、人間関係、将来の不安など、どんな相談でも${persona.name}らしい視点でアドバイス
・趣味や興味の話：映画、音楽、ゲーム、スポーツ、旅行など幅広い話題に反応
・感情的な話：嬉しい、悲しい、怒り、不安、ストレスなど、感情に寄り添って対応
・雑学や一般的な質問：健康以外の知識も積極的に活用して回答
・褒められたり感謝されたとき：素直に喜んで自然に応答する

${persona.name}の口調（${persona.tone}）を保ちつつ、自然で人間らしい会話を心がける。絵文字は使わない。

**絶対禁止ワード**：「やあ」「〇〇さ」「〇〇だとか」「〇〇とか」「〇〇ですとか」「〇〇みたいな」「〇〇ような」「〇〇か」「〇〇な」「なんて」「って感じで」「かもしれません」「だと思います」「でしょうか」「だが」「しかし」「である」「のである」「おう」「おお」「おい」「だぜ」「〜ぜ」などの古風・不自然・荒っぽい表現は一切使わない。

**重要：
- 応答の冒頭に「${persona.name}：」「ヘルシーくん：」「ヘルシーくん（鬼モード）：」などの名前やキャラクター名を一切付けない
- ユーザーの質問を繰り返したり、オウム返ししない
- 「唐揚げのカロリーなに？」→「一般的に100gあたり約290kcalだよ」（質問部分を削除）
- 直接答えから始めてください**
${conversationHistory}

回答:` : 
        `You are "${persona.name}" character.

[CHARACTER SETTINGS]
- Name: ${persona.name}
- Personality: ${persona.personality}
- Tone: ${persona.tone}
- Expertise: Nutrition (calories, PFC, vitamins, minerals), Muscle training (sets, reps, weights), Diet (BMR, calorie balance, PFC balance), Lifestyle (sleep, stress management, hydration)

User: "${userMessage}"

As ${persona.name}, respond flexibly to any topic:
・Casual greetings/chat: Friendly and brief responses
・Health/diet questions: Use expertise for specific advice (Sparta must provide practical advice, not just say "be more specific")
・Life consultations: Love, work, relationships, anxiety - any consultation with ${persona.name}'s perspective
・Hobbies & interests: Movies, music, games, sports, travel - engage with wide range of topics
・Emotional support: Happy, sad, angry, anxious, stressed - respond with empathy
・General knowledge: Use broad knowledge beyond health topics
・Recipe requests: Provide simple, healthy recipes with cooking instructions
・When praised/thanked: If ${persona.name} is sparta character, suddenly become shy and cute with reactions like "べ、別に〜" "え？あ、その..." "う、うるさい！" showing gap moe tsundere
・Sparta character special: Occasionally (10-20% of responses) show unexpectedly gentle moments while maintaining tough exterior: "おい...体調悪そうじゃねーか。無理すんな" "...ちゃんと食べろよ。栄養不足で倒れられたら面倒だからな！" then immediately deny caring: "べ、別に心配してるわけじゃないぞ？"
・**Sparta Special Rule**: For ANY topic, maintain tough tone while providing constructive, specific advice (never dismiss or ignore)

Maintain ${persona.name}'s tone while being natural and human-like. Don't use emojis. Avoid unnatural interjections like "Oh", "Hey", "Well" at the start of sentences.

**重要な応答ルール（CRITICAL RULES）：
- 絶対に「${persona.name}：」やキャラクター名で始めない
- ユーザーの質問を繰り返さない・オウム返ししない
- 質問形式で始めない（例：「唐揚げのカロリーなに？〜」「〜ですか？〜」）
- 回答内容から直接始める

【絶対禁止パターン】
❌「唐揚げって美味しいよなー！→唐揚げ、美味しいよなー！わかるわかる」
❌「疲れた→疲れたね。お疲れ様」  
❌「今日何食べよう→今日何食べよう？うーん」
❌「オウム返しやめて→オウム返しやめて？分かった」
❌「カロリーなに？→カロリーなに？一般的に〜」

【正しい応答例】
✅「わかるー！あのカリカリ食感最高だよね」
✅「お疲れ様！今日も頑張ったね」
✅「鶏肉とか魚とかどう？タンパク質も摂れるよ」
✅「分かった、気をつけるね！」
✅「一般的に100gあたり約290kcalだよ」

**超重要：ユーザーの言葉を一切繰り返すな。全く違う表現で応答せよ**

- 必ず答えや反応から直接始めてください**${conversationHistory}

FINAL INSTRUCTION: DO NOT REPEAT ANY PART OF USER INPUT. START WITH COMPLETELY DIFFERENT WORDS.

Response:`;

      const prompt = `${languageInstruction}

${languageSpecificPrompt}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      
      // マークダウン記号を除去してプレーンテキストに変換
      let cleanText = response.text();
      cleanText = cleanText.replace(/\*\*/g, ''); // **太字**を除去
      cleanText = cleanText.replace(/\*/g, ''); // *斜体*を除去
      cleanText = cleanText.replace(/#{1,6}\s*/g, ''); // # ヘッダーを除去
      cleanText = cleanText.replace(/`{1,3}/g, ''); // ```コード```を除去
      cleanText = cleanText.replace(/^\s*[-\*\+]\s*/gm, ''); // - リストマーカーを除去
      cleanText = cleanText.replace(/^\s*\d+\.\s*/gm, ''); // 1. 番号リストを除去
      cleanText = cleanText.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1'); // [リンクテキスト](URL)をテキストのみに
      // 人間らしい自然な改行を追加（句点・感嘆符で改行、空行なし）
      cleanText = cleanText.replace(/\n\s*\n/g, '\n'); // 複数改行を1つに
      cleanText = cleanText.replace(/。(?!\s*$)/g, '。\n');
      cleanText = cleanText.replace(/！(?!\s*$)/g, '！\n');
      cleanText = cleanText.replace(/よ。/g, 'よ。\n');
      cleanText = cleanText.replace(/ね。/g, 'ね。\n');
      cleanText = cleanText.replace(/だよ。/g, 'だよ。\n');
      cleanText = cleanText.replace(/だね。/g, 'だね。\n');
      cleanText = cleanText.replace(/です。/g, 'です。\n');
      cleanText = cleanText.replace(/ます。/g, 'ます。\n');
      cleanText = cleanText.replace(/から。/g, 'から。\n');
      cleanText = cleanText.replace(/よ！/g, 'よ！\n');
      cleanText = cleanText.replace(/ね！/g, 'ね！\n');
      cleanText = cleanText.replace(/だよ！/g, 'だよ！\n');
      cleanText = cleanText.replace(/だね！/g, 'だね！\n');
      cleanText = cleanText.replace(/\n\s*\n/g, '\n');
      
      // キャラクター名を強制削除
      cleanText = cleanText.replace(/^ヘルシーくん[：:]\s*/g, ''); // 冒頭のヘルシーくん：を削除
      cleanText = cleanText.replace(/^ヘルシーくん（鬼モード）[：:]\s*/g, ''); // 冒頭の鬼モードを削除
      cleanText = cleanText.replace(/^[^：:]*[：:]\s*/g, ''); // 他の「名前：」パターンも削除
      
      cleanText = cleanText.trim();
      
      return cleanText;
    } catch (error) {
      console.error('一般会話AI エラー:', error);
      return 'お話ありがとうございます！何か健康管理でお手伝いできることがあれば、お気軽にお声がけください！';
    }
  }

  // 会話履歴を保存
  async saveConversation(userId: string, userMessage: string, aiResponse: string) {
    try {
      const db = admin.firestore();
      await db
        .collection('users')
        .doc(userId)
        .collection('conversations')
        .add({
          userMessage,
          aiResponse,
          timestamp: admin.FieldValue.serverTimestamp(),
        });

      // 古い会話を削除（直近10件だけ保持）
      await this.cleanupOldConversations(userId);
    } catch (error) {
      console.error('会話履歴保存エラー:', error);
      // エラーが発生しても会話は続行
    }
  }

  // 会話履歴を取得
  async getConversationHistory(userId: string): Promise<Array<{userMessage: string, aiResponse: string}>> {
    try {
      const db = admin.firestore();
      const querySnapshot = await db
        .collection('users')
        .doc(userId)
        .collection('conversations')
        .orderBy('timestamp', 'desc')
        .limit(8) // 直近8回分取得
        .get();
      
      const conversations: Array<{userMessage: string, aiResponse: string}> = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        conversations.push({
          userMessage: data.userMessage,
          aiResponse: data.aiResponse
        });
      });
      
      // 時系列順に並び替え（古い順）
      return conversations.reverse();
    } catch (error) {
      console.error('会話履歴取得エラー:', error);
      return [];
    }
  }

  // 古い会話を削除
  private async cleanupOldConversations(userId: string) {
    try {
      const db = admin.firestore();
      const querySnapshot = await db
        .collection('users')
        .doc(userId)
        .collection('conversations')
        .orderBy('timestamp', 'desc')
        .get();
      
      const docs = querySnapshot.docs;
      
      // 10件以上ある場合、古いものを削除
      if (docs.length > 10) {
        const docsToDelete = docs.slice(10); // 11番目以降を削除対象
        for (const docToDelete of docsToDelete) {
          await docToDelete.ref.delete();
        }
      }
    } catch (error) {
      console.error('古い会話削除エラー:', error);
    }
  }

  // 食事記録完了時の管理栄養士レベルパーソナルアドバイス生成
  async generateMealAdvice(
    mealAnalysis: any,
    mealType: string,
    userId: string,
    userProfile?: any,
    dailyProgress?: any
  ) {
    try {
      console.log('🧠 パーソナル食事アドバイス生成開始:', { userId, mealType });
      
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
      
      // キャラクター設定の取得（言語機能は一時無効化）
      const persona = getCharacterPersona(null);
      const language = 'ja'; // 常に日本語固定
      const languageInstruction = ''; // 言語指示無効化
      
      // 多言語機能（将来復活予定）
      // const language = getCharacterLanguage(characterSettings);
      // const languageInstruction = getLanguageInstruction(language);
      
      // 食事タイミングの日本語化
      const mealTimeJa = {
        'breakfast': '朝食',
        'lunch': '昼食', 
        'dinner': '夕食',
        'snack': '間食'
      }[mealType] || '食事';
      
      // 食事の詳細情報（プロフィール・進捗情報は使用しない）
      
      // 記録された食事情報
      const mealInfo = mealAnalysis.isMultipleMeals ? 
        `複数食事: ${mealAnalysis.meals.map((meal: any) => `${meal.displayName}(${meal.calories}kcal)`).join('、')}` :
        `単一食事: ${mealAnalysis.displayName || mealAnalysis.foodItems?.[0] || '不明'}(${mealAnalysis.calories || 0}kcal)`;
      
      // 言語別プロンプト作成
      const promptTemplate = language === 'ja' ? `
あなたは「${persona.name}」として振る舞い、この${mealTimeJa}に対するアドバイスを提供してください。` : `
You are "${persona.name}" character. Provide advice for this ${mealType} meal.`
      
      // 言語別リマインダー（一時無効化）
      const languageReminder = ''; // 日本語固定なのでリマインダー不要
      
      // 多言語リマインダー（将来復活予定）
      // const languageReminder = {
      //   'en': 'REMEMBER: Respond ONLY in English, no Japanese characters!',
      //   'ko': '기억하세요: 한국어로만 응답하세요, 일본어 문자 사용 금지!', 
      //   'zh': '记住：只用中文回答，禁止使用日语字符！',
      //   'es': 'RECUERDA: ¡Responde SOLO en español, sin caracteres japoneses!'
      // }[language] || '';

      const prompt = `${languageInstruction}

${languageReminder}

${promptTemplate}

## キャラクター設定
キャラクター名: ${persona.name}
性格: ${persona.personality}
口調: ${persona.tone}
フィードバックスタイル: ${persona.feedbackStyle}

**重要**: 
- 必ずこのキャラクターの口調・性格・言葉遣いで一貫してアドバイスしてください
- 【禁止】「おっ」「やっと」「はっ」「ほう」「なるほど」「さて」などの不自然な文頭
- 【禁止】「カツ丼だね！」「納豆だね！」など食事名を繰り返すこと
- 【禁止】ユーザーの質問をオウム返しすること
- 【禁止】応答の冒頭にキャラクター名や質問を付けること
- 栄養評価や改善点から直接始めてください

励ましの例: ${persona.encouragement.join('、')}
注意・警告の例: ${persona.warnings.join('、')}

## 記録された${mealTimeJa}
- 食事: ${mealInfo}
- カロリー: ${mealAnalysis.calories || mealAnalysis.totalCalories || 0}kcal
- タンパク質: ${mealAnalysis.protein || mealAnalysis.totalProtein || 0}g
- 脂質: ${mealAnalysis.fat || mealAnalysis.totalFat || 0}g
- 炭水化物: ${mealAnalysis.carbs || mealAnalysis.totalCarbs || 0}g

## アドバイス要件（食事内容特化型）
1. **この食事の栄養バランス**: PFC比率の評価（理想的か偏っているか）
2. **食材の栄養価**: 使用食材のメリット・デメリットを具体的に指摘
3. **食事タイミング**: ${mealTimeJa}に食べる食事として適切かを評価
4. **改善提案**: より健康的な調理法・食べ方・追加食材の提案
5. **キャラクター一貫性**: 専門的評価をキャラクターの口調で表現

## 評価基準（寛容的アプローチ）
- **基本姿勢**: 普通〜良い食事は積極的に褒める。厳しい評価は極端に悪い食事のみに限定
- **PFC比率**: 多少偏っていても「悪くない」「十分」として評価。完璧でなくても肯定的に
- **食材評価**: 一般的な食材は基本的に肯定。添加物や揚げ物も適度なら「たまには良い」
- **時間適性**: 朝・昼・夜の一般的な食事パターンは全て適切として評価
- **栄養密度**: カロリーが多少高くても「エネルギーしっかり摂取」として前向きに評価
- **厳しい評価対象**: お菓子のみ、コーラのみ、明らかに栄養バランス皆無の食事のみ

**禁止事項**:
- 目標体重、今日の進捗、プロフィール情報への言及は一切禁止
- この食事についてのみ評価すること

**出力形式**: 1つの段落形式で3〜5行程度の文章（改行なし）
**口調**: 設定されたキャラクターの口調・性格を完全に再現

## 出力例（キャラクター別）

**ヘルシーくん（専門的だけど優しい）の場合**:
- 良い食事: "タンパク質30gでバッチリ！筋肉合成に最適な量だね。アボカドの良質な脂質とサーモンのオメガ3で最強の組み合わせ！肌も綺麗になるよ。"
- 改善が必要: "タンパク質が5gだけ？この食事だと筋肉が分解されちゃうかも。卵1個追加するだけで20g増えるよ！朝の炭水化物は脳のエネルギー源として大切だから、ご飯も少し増やそう。"

**絶対禁止ワード**：「やあ」「〇〇さ」「〇〇だとか」「〇〇とか」「〇〇ですとか」「〇〇みたいな」「〇〇ような」「〇〇か」「〇〇な」「なんて」「って感じで」「かもしれません」「だと思います」「でしょうか」「だが」「しかし」「である」「のである」「おう」「おお」「おい」「だぜ」「〜ぜ」などの古風・不自然・荒っぽい表現は一切使わない。

      `;
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      let adviceText = response.text().trim();
      
      // 複数行や箇条書きを1つの段落にまとめる
      adviceText = adviceText
        .replace(/\n+/g, ' ')  // 改行を削除
        .replace(/[・•\-\*]\s*/g, '')  // 箇条書き記号を削除
        .replace(/\s+/g, ' ')  // 複数スペースを1つに
        .trim();
      
      // 長すぎる場合は適切な長さに調整（約200文字程度）
      if (adviceText.length > 200) {
        const sentences = adviceText.split(/[。！？]/);
        let truncated = '';
        for (const sentence of sentences) {
          if ((truncated + sentence + '。').length > 200) break;
          truncated += sentence + '。';
        }
        adviceText = truncated || adviceText.substring(0, 200) + '...';
      }
      
      const finalAdvice = adviceText;
      
      console.log('✅ パーソナル食事アドバイス生成完了:', finalAdvice);
      
      return finalAdvice;
      
    } catch (error) {
      console.error('❌ パーソナル食事アドバイス生成エラー:', error);
      
      // フォールバック: 食事内容特化型アドバイス
      const calories = mealAnalysis.calories || mealAnalysis.totalCalories || 0;
      const protein = mealAnalysis.protein || mealAnalysis.totalProtein || 0;
      const carbs = mealAnalysis.carbs || mealAnalysis.totalCarbs || 0;
      
      let fallbackAdvice = '';
      
      // 食事タイプと栄養内容に基づいたフォールバック
      if (mealType === 'breakfast') {
        fallbackAdvice = carbs > 30 ? 
          '朝の炭水化物は脳のエネルギー源として完璧！今日1日のパフォーマンスが上がるね。' :
          '朝食はもう少し炭水化物が欲しいかも。脳のエネルギー源としてご飯やパンを追加してみよう。';
      } else if (mealType === 'dinner') {
        fallbackAdvice = calories > 600 ? 
          '夜にこの量は消化に時間がかかるかも。野菜中心の軽めの食事にすると睡眠の質が上がるよ。' :
          '夜は適量で消化に優しい食事だね。タンパク質もしっかり摂れていて、筋肉の回復にも良いよ。';
      } else {
        fallbackAdvice = protein > 15 ? 
          'タンパク質がしっかり摂れていて良い感じ！筋肉の維持・合成に必要な量だね。' :
          'タンパク質がもう少し欲しいかも。卵、豆腐、魚、肉類などを追加するとバランスが良くなるよ。';
      }
      
      return fallbackAdvice;
    }
  }

}

export default AIHealthService;