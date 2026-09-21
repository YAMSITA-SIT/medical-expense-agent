import React, { useState } from 'react';

const API_BASE = 'http://localhost:8001';

type IncomeTier = 'low' | 'standard' | 'high' | 'highest';
type AgeBracket = 'under_70' | '70_to_74' | '75_and_over';
type InsuranceType = 'union' | 'kyokai' | 'kokuho';

export default function App() {
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);

  // ユーザー設定（学生・標準世帯向け標準値）
  const [incomeTier, setIncomeTier] = useState<IncomeTier>('standard');
  const [ageBracket, setAgeBracket] = useState<AgeBracket>('under_70');
  const [insuranceType, setInsuranceType] = useState<InsuranceType>('union');
  const [isFrequentPayer, setIsFrequentPayer] = useState(false);
  const [hasFamilyCopay, setHasFamilyCopay] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [calcResult, setCalcResult] = useState<any>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    setLoading(true);
    setErrorMessage(null);

    try {
      setLoadingMessage('画像から文字・金額をOCRスキャンしています...');

      // 1. 画像ファイルを raw body でバックエンドOCRエンドポイントへ送信
      const contentType = file.type || 'image/jpeg';
      const extractRes = await fetch(`${API_BASE}/v2/documents/extract`, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body: file,
      });

      if (!extractRes.ok) {
        const errJson = await extractRes.json().catch(() => null);
        throw new Error(
          errJson?.detail
            ? (typeof errJson.detail === 'object' ? JSON.stringify(errJson.detail) : errJson.detail)
            : `画像の解析に失敗しました (${extractRes.status})`
        );
      }

      // OCR解析結果の受け取り（ネスト形式・フラット形式双方に対応）
      const resJson = await extractRes.json();
      const ext = resJson.extracted_data || resJson;

      const rawCopay = ext.copay_amount?.value ?? ext.copay_amount;
      const rawTotal = ext.total_cost?.value ?? ext.total_medical_cost?.value ?? ext.total_medical_cost ?? ext.total_cost;
      const rawMonth = ext.billing_month?.value ?? ext.billing_month;

      const copayAmount: number = typeof rawCopay === 'number' ? rawCopay : 0;
      const totalCost: number = typeof rawTotal === 'number' ? rawTotal : (copayAmount > 0 ? Math.round(copayAmount / 0.3) : 0);
      const billingMonth: string = rawMonth ? String(rawMonth) : '2026年9月';

      // 2. 読み取った金額から制度判定を実行
      setLoadingMessage('読み取った金額から使える支援制度を計算しています...');

      const familyAmount = hasFamilyCopay ? 30000 : 0;
      const effectiveCopay = copayAmount + familyAmount;
      const effectiveTotalCost = totalCost + Math.round(familyAmount / 0.3);

      // 年収ごとの月額自己負担限度額（70歳未満基準）
      let limitAmount = 80100 + Math.round((effectiveTotalCost - 267000) * 0.01);
      let frequentLimit = 44400;

      if (incomeTier === 'low') {
        limitAmount = 35400;
        frequentLimit = 24600;
      } else if (incomeTier === 'high') {
        limitAmount = 167400 + Math.round((effectiveTotalCost - 558000) * 0.01);
        frequentLimit = 93000;
      } else if (incomeTier === 'highest') {
        limitAmount = 252600 + Math.round((effectiveTotalCost - 842000) * 0.01);
        frequentLimit = 140100;
      }

      if (ageBracket !== 'under_70') {
        if (incomeTier === 'low') { limitAmount = 24600; frequentLimit = 24600; }
        else if (incomeTier === 'standard') { limitAmount = 57600; frequentLimit = 44400; }
      }

      const appliedLimit = isFrequentPayer ? frequentLimit : limitAmount;
      const refund = Math.max(0, effectiveCopay - appliedLimit);

      const items: any[] = [];

      // ① 高額療養費（支払額が上限額を超えている場合のみ）
      if (refund > 0) {
        items.push({
          title: isFrequentPayer ? '毎月の医療費払い戻し（多数回該当）' : '毎月の医療費払い戻し（高額療養費）',
          amount: refund,
          badge: '申請すれば必ずもらえる',
          badgeColor: '#0f766e',
          reason: isFrequentPayer
            ? `ここ1年で高額な支払いがあったため、上限が月44,400円まで下がります。払いすぎた分（${refund.toLocaleString()}円）が手元に戻ります。`
            : `1か月に払う医療費の上限（あなたの場合は${appliedLimit.toLocaleString()}円）を超えているため、差額が手元に戻ります。`,
          where: insuranceType === 'kokuho' ? 'お住まいの市役所・区役所窓口' : '会社の総務、または健保組合窓口',
          when: '受診月の翌月から2年以内',
          needs: '医療機関の領収書原本、保険証、振込口座の通帳',
        });
      }

      // ② 家族合算
      if (hasFamilyCopay && effectiveCopay > appliedLimit) {
        items.push({
          title: '家族みんなの医療費を合算できるボーナス',
          amount: Math.min(familyAmount, refund),
          badge: '家族分もプラス',
          badgeColor: '#0369a1',
          reason: '同じ保険証に入っている家族の医療費（2万1千円以上）を合算して、世帯全体で負担軽減を受けられます。',
          where: 'お使いの保険証の申請窓口',
          when: '受診した翌月から2年以内',
          needs: '家族全員分の領収書原本、家族の保険証',
        });
      }

      // ③ 会社の付加給付（自己負担が約2.5万円を超えている場合のみ）
      if (insuranceType === 'union' && effectiveCopay > 25000) {
        const outOfPocket = Math.min(appliedLimit, effectiveCopay);
        const unionBenefit = Math.max(0, outOfPocket - 25000);
        if (unionBenefit > 0) {
          items.push({
            title: '会社の保険組合からの独自サポート（付加給付）',
            amount: unionBenefit,
            badge: '大企業・公務員限定',
            badgeColor: '#7c3aed',
            reason: 'お勤め先の健康保険独自のルールで、最終的な自己負担が「約2万5千円」程度で済むようにお金が上乗せで振り込まれます。',
            where: '勤務先の健康保険組合（自動振込の場合あり）',
            when: '診療から2〜3か月後',
            needs: '申請不要の場合が多いですが、念のため会社の担当窓口にご確認ください',
          });
        }
      }

      // ④ 確定申告の医療費控除（年間10万円超えが見込まれる場合のみ）
      if (effectiveCopay >= 100000) {
        const netPaid = effectiveCopay - refund;
        const deductionEst = Math.round(Math.max(0, netPaid - 100000) * 0.2);
        if (deductionEst > 0) {
          items.push({
            title: '来年の税金が安くなる医療費控除（確定申告）',
            amount: deductionEst,
            badge: '税金のキャッシュバック',
            badgeColor: '#b45309',
            reason: '年間の支払いが10万円を超えているため、確定申告で所得税の還付と住民税の減額が受けられます。',
            where: 'お近くの税務署（e-Tax対応）',
            when: '翌年の2月16日〜3月15日',
            needs: '病院の領収書、源泉徴収票',
          });
        }
      }

      const totalRefund = items.reduce((acc, cur) => acc + cur.amount, 0);

      setCalcResult({
        billingMonth,
        readCopay: copayAmount,
        effectiveCopay,
        appliedLimit,
        totalRefund,
        items,
      });

      setCurrentStep(2);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || '読み取り中にエラーが発生しました。');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const handleReset = () => {
    setCalcResult(null);
    setErrorMessage(null);
    setCurrentStep(1);
  };

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', padding: '24px 16px', fontFamily: '"Hiragino Sans", "Meiryo", sans-serif', color: '#1e293b' }}>
      <header style={{ borderBottom: '2px solid #f1f5f9', paddingBottom: '14px', marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', color: '#0f766e', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🏥</span> 医療費サポートナビ
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
          画像から金額をスキャンし、受け取れる支援制度を自動判定します
        </p>
      </header>

      {/* ステップ案内 */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <div style={{ color: currentStep >= 1 ? '#0f766e' : '#94a3b8', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}>
          <span style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#0f766e', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>
            1
          </span>
          あなたについて & 書類を選ぶ
        </div>

        <div style={{ width: '40px', height: '2px', backgroundColor: currentStep === 2 ? '#0f766e' : '#e2e8f0' }} />

        <div style={{ color: currentStep === 2 ? '#0f766e' : '#94a3b8', fontWeight: currentStep === 2 ? 'bold' : 'normal', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}>
          <span style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: currentStep === 2 ? '#0f766e' : '#e2e8f0', color: currentStep === 2 ? '#fff' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>
            2
          </span>
          もらえるお金の結果
        </div>
      </div>

      {errorMessage && (
        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '14px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
          <strong>⚠️ エラー:</strong> {errorMessage}
        </div>
      )}

      {loading && (
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '36px', textAlign: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', marginBottom: '20px' }}>
          <p style={{ fontSize: '17px', fontWeight: 'bold', color: '#0f766e', margin: '0 0 6px' }}>{loadingMessage}</p>
          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>画像内の文字・金額を直接読み取っています...</p>
        </div>
      )}

      {/* STEP 1: 条件設定 ＋ アップロード */}
      {!loading && currentStep === 1 && (
        <div>
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '15px', color: '#0f766e' }}>
              ✍️ あなたの状況（学生の方は標準のままでOKです）
            </h3>

            {/* ① 年収 */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>
                ① ご家庭（親御さん）のおおよその年収
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '8px' }}>
                {[
                  { id: 'low', label: '非課税・低所得', note: '自己負担の上限: 約3.5万円' },
                  { id: 'standard', label: 'ふつう（約370万〜770万円）', note: '自己負担の上限: 約8.1万円【おすすめ】' },
                  { id: 'high', label: '多め（約770万〜1160万円）', note: '自己負担の上限: 約16.7万円' },
                  { id: 'highest', label: '高所得（1160万円超）', note: '自己負担の上限: 約25.2万円' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setIncomeTier(item.id as IncomeTier)}
                    style={{
                      padding: '10px',
                      borderRadius: '8px',
                      border: incomeTier === item.id ? '2px solid #0f766e' : '1px solid #cbd5e1',
                      backgroundColor: incomeTier === item.id ? '#f0fdfa' : '#ffffff',
                      color: incomeTier === item.id ? '#0f766e' : '#334155',
                      fontWeight: incomeTier === item.id ? 'bold' : 'normal',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: '13px' }}>{item.label}</div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{item.note}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* ② 年代 & 保険証 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>
                  ② 受診した人の年代
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[
                    { id: 'under_70', label: '69歳以下' },
                    { id: '70_to_74', label: '70〜74歳' },
                    { id: '75_and_over', label: '75歳以上' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setAgeBracket(item.id as AgeBracket)}
                      style={{
                        flex: 1,
                        padding: '8px 4px',
                        borderRadius: '6px',
                        border: ageBracket === item.id ? '2px solid #0f766e' : '1px solid #cbd5e1',
                        backgroundColor: ageBracket === item.id ? '#f0fdfa' : '#ffffff',
                        color: ageBracket === item.id ? '#0f766e' : '#334155',
                        fontWeight: ageBracket === item.id ? 'bold' : 'normal',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>
                  ③ お持ちの保険証
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[
                    { id: 'union', label: '会社・公務員の健保' },
                    { id: 'kyokai', label: '協会けんぽ' },
                    { id: 'kokuho', label: '国保（自営業など）' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setInsuranceType(item.id as InsuranceType)}
                      style={{
                        flex: 1,
                        padding: '8px 4px',
                        borderRadius: '6px',
                        border: insuranceType === item.id ? '2px solid #0f766e' : '1px solid #cbd5e1',
                        backgroundColor: insuranceType === item.id ? '#f0fdfa' : '#ffffff',
                        color: insuranceType === item.id ? '#0f766e' : '#334155',
                        fontWeight: insuranceType === item.id ? 'bold' : 'normal',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* アップロードエリア */}
          <div style={{ backgroundColor: '#f0fdfa', border: '2px dashed #0f766e', borderRadius: '12px', padding: '36px 20px', textAlign: 'center' }}>
            <input
              type="file"
              id="file-upload-input"
              style={{ display: 'none' }}
              accept="image/*"
              onChange={handleFileChange}
            />
            <label htmlFor="file-upload-input" style={{ cursor: 'pointer', display: 'block' }}>
              <div style={{ fontSize: '44px', marginBottom: '8px' }}>📸</div>
              <h2 style={{ fontSize: '18px', margin: '0 0 6px', color: '#1e293b' }}>病院の領収書・明細書の写真を選ぶ</h2>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 18px' }}>
                AIが画像から金額をスキャンして即座に判定します
              </p>
              <span style={{ backgroundColor: '#0f766e', color: '#ffffff', padding: '12px 32px', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', display: 'inline-block' }}>
                写真を選んで診断する
              </span>
            </label>
          </div>
        </div>
      )}

      {/* STEP 2: 結果画面 */}
      {!loading && currentStep === 2 && calcResult && (
        <div>
          {/* 金額ハイライト */}
          <div style={{ backgroundColor: calcResult.totalRefund > 0 ? '#ecfdf5' : '#f8fafc', border: calcResult.totalRefund > 0 ? '2px solid #a7f3d0' : '2px solid #cbd5e1', borderRadius: '16px', padding: '24px 16px', textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>
              画像から読み取った窓口支払額: <strong>{calcResult.readCopay.toLocaleString()} 円</strong>
            </div>
            <div style={{ fontSize: '14px', color: calcResult.totalRefund > 0 ? '#047857' : '#475569', fontWeight: 'bold' }}>
              手元に戻る可能性があるお金
            </div>
            <div style={{ fontSize: '42px', fontWeight: '900', color: calcResult.totalRefund > 0 ? '#065f46' : '#334155', margin: '6px 0' }}>
               {calcResult.totalRefund.toLocaleString()} 円
            </div>
            <div style={{ fontSize: '13px', color: '#64748b' }}>
              {calcResult.totalRefund > 0
                ? '※ 申請すれば受け取れる支援制度が見つかりました！'
                : `今回の支払額 (${calcResult.readCopay.toLocaleString()}円) は月の上限 (${calcResult.appliedLimit.toLocaleString()}円) 以内のため、この領収書単体で戻るお金はありません。`}
            </div>
          </div>

          {/* 制度リスト */}
          {calcResult.items.length > 0 ? (
            <div>
              <h3 style={{ fontSize: '17px', margin: '0 0 14px', color: '#0f172a' }}>
                🎁 あなたが使える制度一覧（{calcResult.items.length}件）
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
                {calcResult.items.map((it: any, idx: number) => (
                  <div key={idx} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px', backgroundColor: '#ffffff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px', marginBottom: '12px' }}>
                      <div>
                        <span style={{ backgroundColor: it.badgeColor, color: '#ffffff', fontSize: '11px', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold', display: 'inline-block', marginBottom: '4px' }}>
                          {it.badge}
                        </span>
                        <h4 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>{it.title}</h4>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>もらえる金額目安</div>
                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0f766e' }}>{it.amount.toLocaleString()} 円</div>
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#f8fafc', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', color: '#334155', lineHeight: 1.6, marginBottom: '12px' }}>
                      <strong>💡 どうして戻るの？:</strong><br />{it.reason}
                    </div>
                    <div style={{ fontSize: '12px', color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div><strong>🏢 どこで申請する？:</strong> {it.where}</div>
                      <div><strong>⏳ いつまで？:</strong> {it.when}</div>
                      <div><strong>🎒 持っていくもの:</strong> {it.needs}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', backgroundColor: '#ffffff', marginBottom: '24px' }}>
              <h4 style={{ margin: '0 0 10px', fontSize: '15px', color: '#0f766e' }}>💡 領収書のアドバイス</h4>
              <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.7, margin: 0 }}>
                今回は上限額以内のため0円ですが、同じ月に家族が別の病院で受診していたり、1年間の合計が10万円を超える場合は親御さんの確定申告で税金が還付されます。領収書は捨てずに保管しておきましょう。
              </p>
            </div>
          )}

          <div style={{ textAlign: 'center' }}>
            <button
              onClick={handleReset}
              style={{ backgroundColor: '#0f766e', color: '#ffffff', padding: '12px 36px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}
            >
              条件を変えて別の写真を試す
            </button>
          </div>
        </div>
      )}
    </div>
  );
}