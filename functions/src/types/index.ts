export interface User {
  userId: string;
  lineUserId: string;
  profile: UserProfile;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  name: string;
  age: number;
  gender: 'male' | 'female' | 'other';
  height: number; // cm
  weight: number; // kg
  targetWeight?: number; // kg
  targetDate?: string; // date string
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active' | 'low' | 'slightly_low' | 'normal' | 'high' | 'very_high';
  goals: HealthGoal[];
  targetAreas?: string; // 気になる部位
  sleepDuration: 'under_3h' | '4_5h' | '6_7h' | '8h_plus';
  sleepQuality: 'good' | 'normal' | 'bad';
  exerciseHabit: 'yes' | 'no';
  exerciseFrequency: 'none' | 'weekly_1_2' | 'weekly_3_4' | 'weekly_5_6' | 'daily';
  exerciseEnvironment?: 'gym' | 'home' | 'both';
  mealFrequency: '1' | '2' | '3' | '4_plus';
  snackFrequency: 'none' | 'sometimes' | 'almost_daily' | 'daily';
  alcoholFrequency: 'none' | 'sometimes' | 'almost_daily' | 'daily';
  dietaryRestrictions?: string;
  medicalConditions?: string;
  allergies?: string;
  aiCharacter?: AICharacterSettings; // AIキャラクター設定
}

export interface HealthGoal {
  type: 'rapid_loss' | 'moderate_loss' | 'slow_loss' | 'maintenance' | 'lean_gain' | 'moderate_gain' | 'bulk_gain' | 
        'weight_loss' | 'healthy_beauty' | 'weight_gain' | 'muscle_gain' | 'lean_muscle' | 'fitness_improve' | 'other';
  targetValue?: number;
  targetDate?: Date;
}

export interface CounselingResult {
  id: string;
  userId: string;
  answers: Record<string, string | number | boolean>;
  aiAdvice: string;
  categories: HealthCategory[];
  priority: 'high' | 'medium' | 'low';
  createdAt: Date;
}

export interface CounselingAnswer {
  questionId: string;
  answer: string | number | boolean;
  timestamp: Date;
}

export interface AICharacterSettings {
  type: 'supportive' | 'professional' | 'friendly' | 'coach';
  name?: string;
  language?: 'casual' | 'polite' | 'professional';
}

export interface AICharacterPersona {
  name: string;
  personality: string;
  tone: string;
  greeting: string;
  encouragement: string[];
  warnings: string[];
  feedbackStyle: string;
}

export interface HealthCategory {
  name: string;
  score: number;
  recommendations: string[];
}

export interface DailyRecord {
  id: string;
  userId: string;
  date: string;
  meals: MealRecord[];
  weight?: number;
  exercise?: ExerciseRecord[];
  mood?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MealRecord {
  id: string;
  mealTime: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  foods: FoodItem[];
  totalCalories: number;
  macros: MacroNutrients;
  imageUrl?: string;
  timestamp: Date;
  analysisMethod: 'ai' | 'manual';
}

export interface FoodItem {
  name: string;
  calories: number;
  macros: MacroNutrients;
  weight?: number;
  confidence?: number;
}

export interface MacroNutrients {
  protein: number; // g
  carbs: number; // g
  fat: number; // g
}

export interface ExerciseRecord {
  type: 'cardio' | 'strength' | 'sports' | 'other';
  name: string;
  duration: number; // minutes
  calories: number;
  timestamp: Date;
}

export interface LineMessage {
  type: 'text' | 'flex' | 'image' | 'sticker';
  text?: string;
  contents?: any;
  originalContentUrl?: string;
  previewImageUrl?: string;
  packageId?: string;
  stickerId?: string;
}