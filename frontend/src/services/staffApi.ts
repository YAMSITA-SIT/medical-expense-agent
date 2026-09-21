import { api } from '../api';
import type { CaseResponse } from '../types';

export type RulesResponse = Record<string, unknown>;

export const staffApi = {
  health: api.health,
  getRules: async (): Promise<RulesResponse> => {
    const response = await fetch(`${api.baseUrl}/v2/rules`);
    if (!response.ok) throw new Error(`ルール取得に失敗しました（${response.status}）`);
    return response.json() as Promise<RulesResponse>;
  },
  validateCase: (payload: unknown): Promise<CaseResponse> => api.validate(payload),
  evaluateCase: (payload: unknown): Promise<CaseResponse> => api.evaluateV2(payload),
};

// 申請一覧・状態更新・職員メモ・監査履歴の永続化APIは未実装です。
// StaffAppでは demoCases を初期値にしたReactメモリ上の状態だけを操作します。
