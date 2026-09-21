import { api } from '../api';
import type { CaseResponse } from '../types';
import type { StaffCase } from '../types/staff';

export type RulesResponse = Record<string, unknown>;

type UploadHistoryResponse = {
  items: StaffCase[];
  storage: 'memory';
  notice: string;
};

export const staffApi = {
  health: api.health,

  getRules: async (): Promise<RulesResponse> => {
    const response = await fetch(`${api.baseUrl}/v2/rules`);

    if (!response.ok) {
      throw new Error(
        `ルール取得に失敗しました（${response.status}）`,
      );
    }

    return response.json() as Promise<RulesResponse>;
  },

  getUploadHistory: async (): Promise<UploadHistoryResponse> => {
    let response: Response;

    try {
      response = await fetch(
        `${api.baseUrl}/v2/staff/uploads`,
      );
    } catch {
      throw new Error(
        'APIサーバーに接続できません。バックエンドが起動しているか確認してください。',
      );
    }

    if (!response.ok) {
      throw new Error(
        `アップロード履歴を取得できませんでした（${response.status}）`,
      );
    }

    return response.json() as Promise<UploadHistoryResponse>;
  },

  validateCase: (
    payload: unknown,
  ): Promise<CaseResponse> => api.validate(payload),

  evaluateCase: (
    payload: unknown,
  ): Promise<CaseResponse> => api.evaluateV2(payload),
};