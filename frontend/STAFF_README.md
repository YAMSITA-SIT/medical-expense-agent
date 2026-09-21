# 職員用フロントエンド

## URL

- `/` または `/user`: 既存の利用者画面
- `/staff`: 職員用ダッシュボード
- `/staff/cases/:id`: 案件詳細

申請一覧、状態更新、職員メモ、操作履歴の永続化APIは未実装です。現在は
`src/mocks/staffCases.ts` の架空データを使用し、操作はReactのメモリ上だけに反映されます。
実在患者の個人情報を使用せず、localStorageにも保存しません。

制度判定・金額計算は職員フロントエンドで行いません。`src/services/staffApi.ts` に既存APIとの
境界を設け、バックエンドの判定結果を表示する前提です。

## 将来必要なAPI

- `GET /v2/staff/cases`: 案件一覧、検索、絞り込み
- `GET /v2/staff/cases/{case_id}`: 案件詳細
- `PATCH /v2/staff/cases/{case_id}/ocr`: 確認済みOCR値の保存
- `PATCH /v2/staff/cases/{case_id}/status`: 状態更新
- `POST /v2/staff/cases/{case_id}/notes`: 職員メモ
- `GET /v2/staff/cases/{case_id}/audit-log`: 操作履歴

本番実装では認証・権限管理、監査ログの改ざん防止、保存期間、通信暗号化が必要です。

## 調査で判明した既存問題

- `POST /v2/documents/extract` が `app/main.py` と `app/workflow/api.py` に重複定義されています。
- `workflow_router` 自体のprefixと`include_router`側のprefixが重複し、ルーター側のURLが
  `/v2/v2/...` になります。
- 既存利用者画面は支援額をブラウザ内で独自計算しています。職員画面にはコピーしていません。
  本番化前に利用者画面もバックエンドの判定結果のみ表示する構成へ移行してください。
