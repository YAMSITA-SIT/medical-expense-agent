import type { StaffCase } from '../types/staff';

const commonRules = [{
  id: 'HCB-UNDER70-C',
  title: '70歳未満・所得区分ウ',
  source: '高額療養費制度の現行ルール（デモ表示）',
}];

export const demoCases: StaffCase[] = [
  {
    id: 'MED-2026-09021', receivedAt: '2026-09-21T09:18:00+09:00', applicantName: '佐藤 花子', birthDate: '1981-04-12', age: 45,
    insurance: '○○健康保険組合', incomeCategory: '区分ウ', serviceMonth: '2026年8月', providerName: 'みなと総合病院', careSetting: '入院', discipline: '医科',
    program: '高額療養費制度', claimedAmountYen: 120000, status: 'manual_review', priority: 'high', requiresAttention: true,
    document: { filename: 'receipt_202608.jpg', submittedAt: '2026-09-21 09:17', ocrProvider: 'Azure Document Intelligence（デモ）', duplicateSuspected: false, qualityIssues: ['右下に軽い影があります'] },
    ocrFields: [
      { key: 'name', label: '患者氏名', value: '佐藤 花子', confidence: .98, reviewState: 'confirmed' },
      { key: 'service_date', label: '診療日', value: '2026-08-18', confidence: .96, reviewState: 'unconfirmed' },
      { key: 'provider_name', label: '医療機関名', value: 'みなと総合病院', confidence: .94, reviewState: 'unconfirmed' },
      { key: 'total_medical_cost_yen', label: '総医療費', value: '400000', confidence: .89, reviewState: 'unconfirmed', warning: '信頼度が確認基準（90%）未満です' },
      { key: 'patient_paid_yen', label: '窓口支払額', value: '120000', confidence: .83, reviewState: 'unconfirmed', warning: '画像の影と重なっています。元画像と照合してください' },
      { key: 'insurance_number', label: '保険者番号', value: '', confidence: 0, reviewState: 'missing', warning: '領収書から抽出できませんでした' },
    ],
    calculation: {
      eligibility: '職員確認が必要', selfPaymentLimitYen: 81430, estimatedBenefitYen: 38570,
      inputs: [{ label: '総医療費', value: '400,000円' }, { label: '窓口支払額', value: '120,000円' }, { label: '所得区分', value: '区分ウ' }, { label: '多数回該当', value: 'なし' }],
      formula: '80,100円 +（総医療費 − 267,000円）× 1%', reasons: ['窓口支払額が自己負担限度額を超える可能性があります', '保険者番号が不足しているため最終確定できません'],
      appliedRules: commonRules, exceptionCodes: ['OCR_LOW_CONFIDENCE', 'INSURER_ID_MISSING'], missingInformation: ['保険者番号'], source: 'demo',
    },
    auditLog: [
      { id: 'a1', timestamp: '2026-09-21 09:18', actor: 'システム', action: '申請を受け付け', after: '新規申請' },
      { id: 'a2', timestamp: '2026-09-21 09:19', actor: 'OCR処理', action: '書類抽出', after: 'OCR確認待ち', comment: '2項目が低信頼度' },
      { id: 'a3', timestamp: '2026-09-21 10:05', actor: '審査担当 A', action: '状態変更', before: 'OCR確認待ち', after: '手動審査' },
    ],
  },
  {
    id: 'MED-2026-09020', receivedAt: '2026-09-20T15:42:00+09:00', applicantName: '鈴木 一郎', birthDate: '1954-11-02', age: 71,
    insurance: '国民健康保険', incomeCategory: '一般', serviceMonth: '2026年8月', providerName: '豊洲中央クリニック', careSetting: '外来', discipline: '医科',
    program: '高額療養費制度', claimedAmountYen: 57600, status: 'needs_info', priority: 'normal', requiresAttention: true,
    document: { filename: 'medical_statement.png', submittedAt: '2026-09-20 15:41', ocrProvider: 'MockOCR（デモ）', duplicateSuspected: true, qualityIssues: [] },
    ocrFields: [
      { key: 'name', label: '患者氏名', value: '鈴木 一郎', confidence: 1, reviewState: 'confirmed' },
      { key: 'service_date', label: '診療日', value: '2026-08-05', confidence: 1, reviewState: 'confirmed' },
      { key: 'patient_paid_yen', label: '窓口支払額', value: '57600', confidence: 1, reviewState: 'confirmed' },
    ],
    calculation: { eligibility: '追加情報が必要', selfPaymentLimitYen: null, estimatedBenefitYen: null, inputs: [{ label: '年齢', value: '71歳' }], formula: null, reasons: ['外来上限を判定するため所得区分の確認が必要です'], appliedRules: [], exceptionCodes: ['DUPLICATE_SUBMISSION'], missingInformation: ['所得区分', '重複申請の確認'], source: 'demo' },
    auditLog: [{ id: 'b1', timestamp: '2026-09-20 15:42', actor: 'システム', action: '申請を受け付け', after: '新規申請' }],
  },
  {
    id: 'MED-2026-09019', receivedAt: '2026-09-19T12:05:00+09:00', applicantName: '高橋 美咲', birthDate: '1996-02-18', age: 30,
    insurance: '協会けんぽ', incomeCategory: '区分エ', serviceMonth: '2026年7月', providerName: '芝浦歯科医院', careSetting: '外来', discipline: '歯科',
    program: '高額療養費制度', claimedAmountYen: 35400, status: 'completed', priority: 'low', requiresAttention: false,
    document: { filename: 'receipt_dental.jpg', submittedAt: '2026-09-19 12:04', ocrProvider: 'Azure Document Intelligence（デモ）', duplicateSuspected: false, qualityIssues: [] },
    ocrFields: [{ key: 'patient_paid_yen', label: '窓口支払額', value: '35400', confidence: .99, reviewState: 'confirmed' }],
    calculation: { eligibility: '対象外', selfPaymentLimitYen: 57600, estimatedBenefitYen: 0, inputs: [{ label: '窓口支払額', value: '35,400円' }], formula: '窓口支払額 − 自己負担限度額', reasons: ['窓口支払額が限度額以下です'], appliedRules: commonRules, exceptionCodes: [], missingInformation: [], source: 'demo' },
    auditLog: [{ id: 'c1', timestamp: '2026-09-19 14:10', actor: '審査担当 B', action: '審査完了', before: '手動審査', after: '審査完了' }],
  },
  {
    id: 'MED-2026-09018', receivedAt: '2026-09-18T10:20:00+09:00', applicantName: '田中 健', birthDate: '1988-08-08', age: 38,
    insurance: '△△共済組合', incomeCategory: '区分イ', serviceMonth: '2026年8月', providerName: '城東医療センター', careSetting: '入院', discipline: '医科', program: '高額療養費制度', claimedAmountYen: 210000,
    status: 'ocr_review', priority: 'high', requiresAttention: true,
    document: { filename: 'receipt_09018.jpg', submittedAt: '2026-09-18 10:19', ocrProvider: 'Azure Document Intelligence（デモ）', duplicateSuspected: false, qualityIssues: ['画像がわずかに傾いています'] },
    ocrFields: [{ key: 'patient_paid_yen', label: '窓口支払額', value: '210000', confidence: .78, reviewState: 'unconfirmed', warning: '信頼度が低いため確認が必要です' }],
    calculation: { eligibility: '職員確認が必要', selfPaymentLimitYen: null, estimatedBenefitYen: null, inputs: [], formula: null, reasons: ['OCR確認後にバックエンドで再判定してください'], appliedRules: [], exceptionCodes: ['OCR_LOW_CONFIDENCE'], missingInformation: [], source: 'demo' }, auditLog: [],
  },
  {
    id: 'MED-2026-09017', receivedAt: '2026-09-17T08:11:00+09:00', applicantName: '伊藤 葵', birthDate: '2000-06-10', age: 26,
    insurance: '協会けんぽ', incomeCategory: '区分ウ', serviceMonth: '2026年8月', providerName: '湾岸総合病院', careSetting: '外来', discipline: '医科', program: '高額療養費制度', claimedAmountYen: 81000,
    status: 'new', priority: 'normal', requiresAttention: false,
    document: { filename: 'receipt_09017.png', submittedAt: '2026-09-17 08:10', ocrProvider: '未処理（デモ）', duplicateSuspected: false, qualityIssues: [] }, ocrFields: [],
    calculation: { eligibility: '追加情報が必要', selfPaymentLimitYen: null, estimatedBenefitYen: null, inputs: [], formula: null, reasons: ['OCR処理前です'], appliedRules: [], exceptionCodes: [], missingInformation: ['OCR結果'], source: 'demo' }, auditLog: [],
  },
];
