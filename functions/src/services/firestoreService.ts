import { admin } from '../lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { User, UserProfile, CounselingAnswer, DailyRecord } from '../types';

export class FirestoreService {
  
  // ユーザー情報の保存
  async saveUser(lineUserId: string, userData: Partial<User>) {
    try {
      const db = admin.firestore();
      const userRef = db.collection('users').doc(lineUserId);
      await userRef.set({
        ...userData,
        lineUserId,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: userData.createdAt || FieldValue.serverTimestamp(),
      }, { merge: true });
      
      console.log(`✅ ユーザー情報保存完了: ${lineUserId}`);
    } catch (error) {
      console.error('❌ ユーザー情報保存エラー:', error);
      throw error;
    }
  }

  // ユーザー情報の取得
  async getUser(lineUserId: string): Promise<User | null> {
    try {
      const db = admin.firestore();
      const userRef = db.collection('users').doc(lineUserId);
      const doc = await userRef.get();
      
      if (!doc.exists) {
        return null;
      }
      
      const data = doc.data();
      return {
        userId: doc.id,
        lineUserId: data?.lineUserId || lineUserId,
        profile: data?.profile || {},
        createdAt: data?.createdAt?.toDate() || new Date(),
        updatedAt: data?.updatedAt?.toDate() || new Date(),
        ...data
      } as User;
    } catch (error) {
      console.error('❌ ユーザー情報取得エラー:', error);
      throw error;
    }
  }

  // ユーザープロフィールの更新
  async updateUserProfile(lineUserId: string, profile: Partial<UserProfile>) {
    try {
      const db = admin.firestore();
      const userRef = db.collection('users').doc(lineUserId);
      await userRef.set({
        profile: {
          ...profile
        },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      
      console.log(`✅ プロフィール更新完了: ${lineUserId}`);
    } catch (error) {
      console.error('❌ プロフィール更新エラー:', error);
      throw error;
    }
  }

  // 食事記録の保存
  async saveMealRecord(lineUserId: string, mealData: any) {
    try {
      const db = admin.firestore();
      const recordRef = db.collection('users').doc(lineUserId).collection('daily_records').doc(mealData.date);
      
      await recordRef.set({
        meals: FieldValue.arrayUnion({
          ...mealData,
          id: this.generateId(),
          timestamp: FieldValue.serverTimestamp(),
        }),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      
      console.log(`✅ 食事記録保存完了: ${lineUserId} - ${mealData.date}`);
    } catch (error) {
      console.error('❌ 食事記録保存エラー:', error);
      throw error;
    }
  }

  // 体重記録の保存
  async saveWeightRecord(lineUserId: string, weight: number, date: string) {
    try {
      const db = admin.firestore();
      const recordRef = db.collection('users').doc(lineUserId).collection('daily_records').doc(date);
      
      await recordRef.set({
        weight: weight,
        weightUpdatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      
      console.log(`✅ 体重記録保存完了: ${lineUserId} - ${date}: ${weight}kg`);
    } catch (error) {
      console.error('❌ 体重記録保存エラー:', error);
      throw error;
    }
  }

  // カウンセリング回答の保存
  async saveCounselingAnswers(lineUserId: string, answers: Record<string, any>, aiAnalysis?: any) {
    try {
      const db = admin.firestore();
      const counselingRef = db.collection('users').doc(lineUserId).collection('counseling').doc('result');
      
      await counselingRef.set({
        answers,
        aiAnalysis,
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      
      console.log(`✅ カウンセリング結果保存完了: ${lineUserId}`);
    } catch (error) {
      console.error('❌ カウンセリング結果保存エラー:', error);
      throw error;
    }
  }

  // カウンセリング結果の取得
  async getCounselingResult(lineUserId: string) {
    try {
      const db = admin.firestore();
      const counselingRef = db.collection('users').doc(lineUserId).collection('counseling').doc('result');
      const doc = await counselingRef.get();
      
      if (!doc.exists) {
        return null;
      }
      
      return doc.data();
    } catch (error) {
      console.error('❌ カウンセリング結果取得エラー:', error);
      throw error;
    }
  }

  // 日次記録の取得
  async getDailyRecord(lineUserId: string, date: string) {
    try {
      const db = admin.firestore();
      const recordRef = db.collection('users').doc(lineUserId).collection('daily_records').doc(date);
      const doc = await recordRef.get();
      
      if (!doc.exists) {
        return null;
      }
      
      return doc.data();
    } catch (error) {
      console.error('❌ 日次記録取得エラー:', error);
      throw error;
    }
  }

  // 使用回数の記録
  async recordUsage(lineUserId: string, feature: string) {
    try {
      const db = admin.firestore();
      const today = new Date().toISOString().split('T')[0];
      const usageRef = db.collection('users').doc(lineUserId).collection('usage').doc(today);
      
      await usageRef.set({
        [feature]: FieldValue.increment(1),
        lastUsed: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      
    } catch (error) {
      console.error('❌ 使用回数記録エラー:', error);
    }
  }

  // ID生成
  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }
}