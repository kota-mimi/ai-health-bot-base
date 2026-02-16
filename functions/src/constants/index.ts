export const APP_CONFIG = {
  NAME: 'ヘルシーくん',
  VERSION: '1.0.0',
  DESCRIPTION: 'AIを活用した個人向け健康管理サービス',
} as const;

export const ROUTES = {
  HOME: '/',
  COUNSELING: '/counseling',
  DASHBOARD: '/dashboard',
  MEALS: '/meals',
  EXERCISE: '/exercise',
  REPORTS: '/reports',
  PROFILE: '/profile',
} as const;

export const STORAGE_KEYS = {
  USER_PROFILE: 'userProfile',
  COUNSELING_PROGRESS: 'counselingProgress',
  DAILY_RECORD: 'dailyRecord',
  SETTINGS: 'settings',
} as const;

export const MEAL_TYPES = {
  BREAKFAST: 'breakfast',
  LUNCH: 'lunch',
  DINNER: 'dinner',
  SNACK: 'snack',
} as const;

export const ACTIVITY_LEVELS = {
  SEDENTARY: { 
    value: 'sedentary', 
    label: '座りがちな生活', 
    multiplier: 1.2 
  },
  LIGHT: { 
    value: 'light', 
    label: '軽い活動', 
    multiplier: 1.375 
  },
  MODERATE: { 
    value: 'moderate', 
    label: '適度な運動', 
    multiplier: 1.55 
  },
  ACTIVE: { 
    value: 'active', 
    label: '活発な運動', 
    multiplier: 1.725 
  },
  VERY_ACTIVE: { 
    value: 'very_active', 
    label: '非常に活発', 
    multiplier: 1.9 
  },
} as const;

export const HEALTH_GOALS = {
  WEIGHT_LOSS: { 
    value: 'weight_loss', 
    label: '体重減少', 
    icon: '📉' 
  },
  WEIGHT_GAIN: { 
    value: 'weight_gain', 
    label: '体重増加', 
    icon: '📈' 
  },
  MUSCLE_GAIN: { 
    value: 'muscle_gain', 
    label: '筋肉増強', 
    icon: '💪' 
  },
  MAINTENANCE: { 
    value: 'maintenance', 
    label: '現状維持', 
    icon: '⚖️' 
  },
  DISEASE_PREVENTION: { 
    value: 'disease_prevention', 
    label: '病気予防', 
    icon: '🛡️' 
  },
} as const;

export const EXERCISE_TYPES = {
  CARDIO: { 
    value: 'cardio', 
    label: '有酸素運動', 
    icon: '🏃‍♂️' 
  },
  STRENGTH: { 
    value: 'strength', 
    label: '筋力トレーニング', 
    icon: '🏋️‍♂️' 
  },
  FLEXIBILITY: { 
    value: 'flexibility', 
    label: 'ストレッチ', 
    icon: '🤸‍♀️' 
  },
  SPORTS: { 
    value: 'sports', 
    label: 'スポーツ', 
    icon: '⚽' 
  },
  OTHER: { 
    value: 'other', 
    label: 'その他', 
    icon: '🏃' 
  },
} as const;

export const NUTRITION_TARGETS = {
  PROTEIN_RATIO: 0.25, // カロリー比率
  CARB_RATIO: 0.45,
  FAT_RATIO: 0.30,
  FIBER_PER_1000CAL: 14, // 1000kcalあたりのg
  MAX_SODIUM_MG: 2300, // mg/日
} as const;

export const BMI_RANGES = {
  UNDERWEIGHT: { min: 0, max: 18.5, label: '低体重', color: '#3b82f6' },
  NORMAL: { min: 18.5, max: 25, label: '普通体重', color: '#10b981' },
  OVERWEIGHT: { min: 25, max: 30, label: '過体重', color: '#f59e0b' },
  OBESE: { min: 30, max: Infinity, label: '肥満', color: '#ef4444' },
} as const;

export const DEFAULT_DAILY_TARGETS = {
  WATER_ML: 2000,
  SLEEP_HOURS: 8,
  STEPS: 10000,
} as const;

export const API_ENDPOINTS = {
  USERS: '/api/users',
  COUNSELING: '/api/counseling',
  MEALS: '/api/meals',
  EXERCISE: '/api/exercise',
  ANALYSIS: '/api/analysis',
  REPORTS: '/api/reports',
} as const;

export const NOTIFICATION_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
} as const;

export const CHART_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
] as const;