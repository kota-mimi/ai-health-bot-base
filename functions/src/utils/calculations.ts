import { BMI_RANGES, NUTRITION_TARGETS } from '../constants';
import type { UserProfile, HealthGoal } from '../types';

export function calculateBMI(weight: number, height: number): number {
  const heightM = height / 100;
  return weight / (heightM * heightM);
}

export function getBMICategory(bmi: number) {
  if (bmi < BMI_RANGES.UNDERWEIGHT.max) return BMI_RANGES.UNDERWEIGHT;
  if (bmi < BMI_RANGES.NORMAL.max) return BMI_RANGES.NORMAL;
  if (bmi < BMI_RANGES.OVERWEIGHT.max) return BMI_RANGES.OVERWEIGHT;
  return BMI_RANGES.OBESE;
}

export function calculateBMR(profile: UserProfile): number {
  const { weight, height, age, gender } = profile;
  
  if (gender === 'male') {
    return Math.round(88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age));
  } else {
    return Math.round(447.593 + (9.247 * weight) + (3.098 * height) - (4.330 * age));
  }
}

export function calculateTDEE(profile: UserProfile): number;
export function calculateTDEE(bmr: number, activityLevel: string): number;
export function calculateTDEE(profileOrBmr: UserProfile | number, activityLevel?: string): number {
  if (typeof profileOrBmr === 'number') {
    // BMRと活動レベルが個別に渡された場合
    const activityMultiplier = getActivityMultiplier(activityLevel as UserProfile['activityLevel']);
    return Math.round(profileOrBmr * activityMultiplier);
  } else {
    // プロフィール全体が渡された場合
    const bmr = calculateBMR(profileOrBmr);
    const activityMultiplier = getActivityMultiplier(profileOrBmr.activityLevel);
    return Math.round(bmr * activityMultiplier);
  }
}

function getActivityMultiplier(activityLevel: UserProfile['activityLevel']): number {
  const multipliers = {
    sedentary: 1.2,     // ほとんど運動しない
    light: 1.375,       // 軽い運動をする
    moderate: 1.55,     // 定期的に運動する
    active: 1.725,      // 活発な運動
    very_active: 1.9,   // 非常に活発
    // 旧値のサポート（下位互換性）
    low: 1.2,
    slightly_low: 1.375,
    normal: 1.55,
    high: 1.725,
    very_high: 1.9,
  };
  return multipliers[activityLevel] || 1.55;
}

export function calculateCalorieTarget(profile: UserProfile, goals: HealthGoal[]): number {
  const tdee = calculateTDEE(profile);
  const primaryGoal = goals[0];
  
  if (!primaryGoal) return Math.round(tdee);
  
  switch (primaryGoal.type) {
    case 'rapid_loss':
      return Math.round(tdee - 700); // -0.7kg/週
    case 'moderate_loss':
      return Math.round(tdee - 500); // -0.5kg/週
    case 'slow_loss':
      return Math.round(tdee - 250); // -0.25kg/週
    case 'maintenance':
      return Math.round(tdee); // 現状維持
    case 'lean_gain':
      return Math.round(tdee + 200); // +0.2kg/週
    case 'moderate_gain':
      return Math.round(tdee + 300); // +0.3kg/週
    case 'bulk_gain':
      return Math.round(tdee + 500); // +0.5kg/週
    // 旧形式のサポート（下位互換性）
    case 'weight_loss':
      return Math.round(tdee - 500);
    case 'weight_gain':
      return Math.round(tdee + 500);
    case 'muscle_gain':
      return Math.round(tdee + 300);
    default:
      return Math.round(tdee);
  }
}

export function calculateMacroTargets(calorieTarget: number) {
  return {
    protein: Math.round((calorieTarget * NUTRITION_TARGETS.PROTEIN_RATIO) / 4),
    carbs: Math.round((calorieTarget * NUTRITION_TARGETS.CARB_RATIO) / 4),
    fat: Math.round((calorieTarget * NUTRITION_TARGETS.FAT_RATIO) / 9),
    fiber: Math.round((calorieTarget / 1000) * NUTRITION_TARGETS.FIBER_PER_1000CAL),
  };
}

export function calculateIdealWeight(height: number, _gender: 'male' | 'female' | 'other'): number {
  const heightM = height / 100;
  const idealBMI = 22; // WHO推奨の理想BMI
  return idealBMI * (heightM * heightM);
}

export function calculateWeightLossTimeframe(
  currentWeight: number,
  targetWeight: number,
  weeklyLossKg: number = 0.5
): number {
  const weightToLose = currentWeight - targetWeight;
  if (weightToLose <= 0) return 0;
  return Math.ceil(weightToLose / weeklyLossKg);
}

export function calculateWaterIntake(weight: number, activityLevel: UserProfile['activityLevel']): number {
  const baseIntake = weight * 35; // 基本: 35ml/kg
  const activityMultipliers: Record<string, number> = {
    sedentary: 1.0,
    light: 1.1,
    moderate: 1.2,
    active: 1.3,
    very_active: 1.4,
    // 旧値のサポート（下位互換性）
    low: 1.0,
    slightly_low: 1.1,
    normal: 1.2,
    high: 1.3,
    very_high: 1.4,
  };
  
  return Math.round(baseIntake * (activityMultipliers[activityLevel] || 1.2));
}

export function calculateSleepTarget(age: number): number {
  if (age < 18) return 9;
  if (age < 26) return 8.5;
  if (age < 65) return 8;
  return 7.5;
}

export function formatCalories(calories: number): string {
  return new Intl.NumberFormat('ja-JP').format(Math.round(calories));
}

export function formatWeight(weight: number): string {
  return `${weight.toFixed(1)}kg`;
}

export function formatBMI(bmi: number): string {
  return bmi.toFixed(1);
}

export function formatMacro(amount: number, unit: string = 'g'): string {
  return `${Math.round(amount)}${unit}`;
}