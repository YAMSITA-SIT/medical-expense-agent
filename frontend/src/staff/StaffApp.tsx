/* eslint-disable no-irregular-whitespace */
import { useEffect, useMemo, useState } from 'react';
import { demoCases } from '../mocks/staffCases';
import { staffApi } from '../services/staffApi';
import type { CaseStatus, OcrField, StaffAction, StaffCase } from '../types/staff';
import './staff.css';

const statusLabel: Record<CaseStatus, string> = {
  new: '新規申請', ocr_review: 'OCR確認待ち', needs_info: '不足情報あり', manual_review: '手動審査',
  supervisor_review: '上席確認', completed: '審査完了', returned: '差し戻し',
};
const actionMap: Record<StaffAction, { label: string; status: CaseStatus }> = {
  ocr_confirmed: { label: 'OCR確認済みにする', status: 'manual_review' },
  needs_review: { label: '要確認にする', status: 'manual_review' },
  missing_documents: { label: '不足書類を登録', status: 'needs_info' },
  return: { label: '利用者へ差し戻す', status: 'returned' },
  supervisor: { label: '上席確認へ送る', status: 'supervisor_review' },
  complete: { label: '審査完了にする', status: 'completed' },
};

const yen = (value: number | null) => value === null ? '—' : `${value.toLocaleString('ja-JP')}円`;
const date = (iso: string) => new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium' }).format(new Date(iso));

export function StaffApp({ path }: { path: string }) {
  const [cases, setCases] = useState<StaffCase[]>(demoCases);
  const [apiState, setApiState] = useState<'checking' | 'online' | 'offline'>('checking');
  const detailId = path.match(/^\/staff\/cases\/([^/]+)$/)?.[1] || new URLSearchParams(window.location.search).get('case') || undefined;
  const selected = cases.find((item) => item.id === detailId);

  useEffect(() => {
    staffApi.health().then(() => setApiState('online')).catch(() => setApiState('offline'));
  }, []);

  const updateCase = (next: StaffCase) => setCases((current) => current.map((item) => item.id === next.id ? next : item));

  return (
    <div className="staff-shell">
      <header className="staff-header">
        <a className="staff-brand" href="/staff" aria-label="職員ポータルのトップへ">
          <span className="staff-brand-mark" aria-hidden="true">医</span>
          <span><strong>医療費支援 審査ポータル</strong><small>職員用</small></span>
        </a>
        <div className="staff-header-actions">
          <span className={`api-state ${apiState}`}><i />API {apiState === 'online' ? '接続中' : apiState === 'offline' ? '未接続' : '確認中'}</span>
          <a href="/" className="user-link">利用者画面へ</a>
          <span className="avatar" aria-label="ログイン中の職員">審</span>
        </div>
      </header>
      {apiState === 'offline' && <div className="api-alert" role="alert">APIサーバーに接続できません。バックエンドが起動しているか、VITE_API_BASE_URLを確認してください。職員画面はデモデータで表示しています。</div>}
      <main className="staff-main">
        <div className="demo-ribbon"><strong>デモデータ</strong> 架空の申請者・書類・履歴を表示しています。操作内容は保存されず、再読み込みで元に戻ります。</div>
        {detailId ? (
          selected ? <CaseDetail item={selected} onChange={updateCase} /> : <EmptyCase id={detailId} />
        ) : <Dashboard cases={cases} />}
      </main>
    </div>
  );
}

function Dashboard({ cases }: { cases: StaffCase[] }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<CaseStatus | 'all'>('all');
  const [receivedDate, setReceivedDate] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const counts = {
    new: cases.filter((item) => item.status === 'new').length,
    ocr: cases.filter((item) => item.status === 'ocr_review').length,
    missing: cases.filter((item) => item.status === 'needs_info').length,
    review: cases.filter((item) => item.status === 'manual_review' || item.status === 'supervisor_review').length,
    completed: cases.filter((item) => item.status === 'completed').length,
  };
  const filtered = useMemo(() => cases.filter((item) => {
    const needle = query.trim().toLowerCase();
    return (!needle || item.id.toLowerCase().includes(needle) || item.applicantName.toLowerCase().includes(needle))
      && (status === 'all' || item.status === status)
      && (!receivedDate || item.receivedAt.slice(0, 10) === receivedDate)
      && (!attentionOnly || item.requiresAttention);
  }), [attentionOnly, cases, query, receivedDate, status]);

  return <>
    <div className="page-heading"><div><p className="eyebrow">審査業務</p><h1>申請案件ダッシュボード</h1><p>申請状況と確認が必要な案件を一覧で把握できます。</p></div><span className="updated">最終更新: デモ表示</span></div>
    <section className="metric-grid" aria-label="案件件数">
      <Metric label="新規申請" value={counts.new} tone="blue" icon="＋" />
      <Metric label="OCR確認待ち" value={counts.ocr} tone="purple" icon="読" />
      <Metric label="不足情報あり" value={counts.missing} tone="amber" icon="!" />
      <Metric label="手動審査が必要" value={counts.review} tone="red" icon="人" />
      <Metric label="審査完了" value={counts.completed} tone="green" icon="✓" />
    </section>
    <section className="staff-card">
      <div className="card-title"><div><h2>申請案件一覧</h2><p>{filtered.length}件を表示</p></div></div>
      <div className="filters">
        <label className="search-field"><span>検索</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="受付番号・氏名で検索" /></label>
        <label><span>状態</span><select value={status} onChange={(event) => setStatus(event.target.value as CaseStatus | 'all')}><option value="all">すべて</option>{Object.entries(statusLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label><span>申請日</span><input type="date" value={receivedDate} onChange={(event) => setReceivedDate(event.target.value)} /></label>
        <label className="check-filter"><input type="checkbox" checked={attentionOnly} onChange={(event) => setAttentionOnly(event.target.checked)} />要確認案件のみ</label>
      </div>
      <div className="table-wrap">
        <table><thead><tr><th>受付番号</th><th>申請日／申請者</th><th>診療年月／医療機関</th><th>申請制度</th><th>申請金額</th><th>状態</th><th>優先度</th><th><span className="sr-only">操作</span></th></tr></thead>
        <tbody>{filtered.map((item) => <tr key={item.id}><td><strong>{item.id}</strong></td><td>{date(item.receivedAt)}<small>{item.applicantName}</small></td><td>{item.serviceMonth}<small>{item.providerName}</small></td><td>{item.program}</td><td className="money">{yen(item.claimedAmountYen)}</td><td><StatusBadge status={item.status} /></td><td><span className={`priority ${item.priority}`}>{item.priority === 'high' ? '高' : item.priority === 'normal' ? '通常' : '低'}</span></td><td><a className="detail-button" href={`/staff/?case=${encodeURIComponent(item.id)}`}>詳細</a></td></tr>)}</tbody></table>
        {filtered.length === 0 && <div className="empty-state">条件に一致する申請案件はありません。</div>}
      </div>
    </section>
  </>;
}

function Metric({ label, value, tone, icon }: { label: string; value: number; tone: string; icon: string }) {
  return <article className={`metric ${tone}`}><span className="metric-icon" aria-hidden="true">{icon}</span><div><small>{label}</small><strong>{value}<em>件</em></strong></div></article>;
}

function CaseDetail({ item, onChange }: { item: StaffCase; onChange: (value: StaffCase) => void }) {
  const [fields, setFields] = useState(item.ocrFields);
  const [memo, setMemo] = useState('');
  const [flash, setFlash] = useState('');
  const changeField = (key: string, value: string) => setFields((current) => current.map((field) => field.key === key ? { ...field, value, reviewState: 'corrected' } : field));
  const runAction = (action: StaffAction) => {
    const meta = actionMap[action];
    const now = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
    onChange({ ...item, status: meta.status, ocrFields: fields, auditLog: [{ id: `local-${item.auditLog.length + 1}`, timestamp: now, actor: '審査担当（デモ）', action: meta.label, before: statusLabel[item.status], after: statusLabel[meta.status], comment: memo || undefined }, ...item.auditLog] });
    setMemo(''); setFlash(`${meta.label}（デモ用ローカル操作）を反映しました。`);
  };

  return <>
    <nav className="breadcrumbs" aria-label="パンくず"><a href="/staff/">申請案件</a><span>/</span><span>{item.id}</span></nav>
    <div className="detail-heading"><div><p className="eyebrow">案件詳細</p><h1>{item.id}</h1><p>{item.applicantName} ・ {item.program}</p></div><StatusBadge status={item.status} /></div>
    {flash && <div className="success-message" role="status">{flash}</div>}
    <div className="detail-layout"><div className="detail-primary">
      <Section title="基本情報"><dl className="info-grid">
        <Info label="受付番号" value={item.id} /><Info label="申請者" value={item.applicantName} /><Info label="生年月日・年齢" value={`${item.birthDate}（${item.age}歳）`} /><Info label="加入保険" value={item.insurance} /><Info label="所得区分" value={item.incomeCategory} /><Info label="診療年月" value={item.serviceMonth} /><Info label="医療機関" value={item.providerName} /><Info label="診療区分" value={`${item.careSetting}・${item.discipline}`} />
      </dl></Section>
      <Section title="提出書類" tag="デモデータ"><div className="document-grid"><div className="receipt-preview" role="img" aria-label="デモ用領収書プレビュー"><div className="receipt-paper"><b>領 収 書</b><span>患者氏名　{item.applicantName}</span><span>診療年月　{item.serviceMonth}</span><span>医療機関　{item.providerName}</span><hr/><strong>領収金額　{yen(item.claimedAmountYen)}</strong><small>SAMPLE / 架空データ</small></div></div><dl className="document-meta"><Info label="ファイル名" value={item.document.filename} /><Info label="提出日時" value={item.document.submittedAt} /><Info label="OCRプロバイダー" value={item.document.ocrProvider} /><Info label="重複送信の疑い" value={item.document.duplicateSuspected ? 'あり（確認必要）' : 'なし'} /><Info label="画像品質" value={item.document.qualityIssues.length ? item.document.qualityIssues.join('、') : '問題なし'} /></dl></div></Section>
      <Section title="OCR確認"><p className="section-help">低信頼度・不足・矛盾のある項目を元画像と照合し、必要な場合だけ値を修正してください。</p><div className="table-wrap"><table className="ocr-table"><thead><tr><th>項目名</th><th>OCR抽出値</th><th>信頼度</th><th>確認状態</th><th>修正入力欄</th><th>警告内容</th></tr></thead><tbody>{fields.map((field) => <OcrRow key={field.key} field={field} onChange={changeField} />)}</tbody></table>{fields.length === 0 && <div className="empty-state">OCR結果がまだありません。</div>}</div></Section>
      <Calculation data={item.calculation} />
      <Section title="操作履歴" tag="デモデータ"><div className="table-wrap"><table><thead><tr><th>日時</th><th>担当者</th><th>操作内容</th><th>変更前</th><th>変更後</th><th>コメント</th></tr></thead><tbody>{item.auditLog.map((log) => <tr key={log.id}><td>{log.timestamp}</td><td>{log.actor}</td><td>{log.action}</td><td>{log.before || '—'}</td><td>{log.after || '—'}</td><td>{log.comment || '—'}</td></tr>)}</tbody></table>{item.auditLog.length === 0 && <div className="empty-state">操作履歴はありません。</div>}</div></Section>
    </div><aside className="staff-actions"><h2>職員操作</h2><p className="local-note">デモ用ローカル状態<br/>サーバーには保存されません</p><label><span>職員メモ</span><textarea value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="判断理由や引き継ぎ事項を入力" rows={5} /></label><div className="action-buttons">{(Object.keys(actionMap) as StaffAction[]).map((key) => <button key={key} className={key === 'complete' ? 'complete' : key === 'return' ? 'danger' : ''} onClick={() => runAction(key)}>{actionMap[key].label}</button>)}</div></aside></div>
  </>;
}

function OcrRow({ field, onChange }: { field: OcrField; onChange: (key: string, value: string) => void }) {
  const level = field.reviewState === 'missing' ? 'missing' : field.confidence < .9 ? 'low' : 'good';
  return <tr className={`ocr-${level}`}><td><strong>{field.label}</strong></td><td>{field.value || '未抽出'}</td><td><span className={`confidence ${level}`}>{Math.round(field.confidence * 100)}%</span></td><td>{field.reviewState === 'confirmed' ? '確認済み' : field.reviewState === 'corrected' ? '修正済み' : field.reviewState === 'missing' ? '不足' : '未確認'}</td><td><input aria-label={`${field.label}の修正値`} value={field.value} onChange={(event) => onChange(field.key, event.target.value)} /></td><td className="warning-cell">{field.warning ? `⚠ ${field.warning}` : '—'}</td></tr>;
}

function Calculation({ data }: { data: StaffCase['calculation'] }) {
  return <Section title="制度判定・計算結果" tag={data.source === 'api' ? 'API結果' : 'デモデータ'}><div className="estimate-notice"><strong>概算であり、最終決定ではありません。</strong><span>支給可否・金額は保険者による審査で確定します。</span></div><div className="calculation-summary"><div><small>対象になる可能性</small><strong>{data.eligibility}</strong></div><div><small>自己負担限度額</small><strong>{yen(data.selfPaymentLimitYen)}</strong></div><div className="benefit"><small>払い戻し概算額</small><strong>{yen(data.estimatedBenefitYen)}</strong></div></div><div className="calculation-grid"><div><h3>計算に使用した入力</h3><dl>{data.inputs.map((entry) => <Info key={entry.label} label={entry.label} value={entry.value} />)}</dl><h3>計算式</h3><p className="formula">{data.formula || '不足情報があるため未計算'}</p></div><div><h3>判断理由</h3><ul>{data.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><h3>適用ルール・根拠資料</h3>{data.appliedRules.length ? data.appliedRules.map((rule) => <div className="rule-item" key={rule.id}><strong>{rule.id}: {rule.title}</strong><span>{rule.source}</span>{rule.url && <a href={rule.url} target="_blank" rel="noreferrer">根拠資料を開く</a>}</div>) : <p>適用ルールはまだありません。</p>}</div></div><div className="finding-grid"><div><h3>例外コード</h3>{data.exceptionCodes.length ? data.exceptionCodes.map((code) => <code key={code}>{code}</code>) : <p>なし</p>}</div><div><h3>不足情報</h3>{data.missingInformation.length ? <ul>{data.missingInformation.map((value) => <li key={value}>{value}</li>)}</ul> : <p>なし</p>}</div></div></Section>;
}

function Section({ title, tag, children }: { title: string; tag?: string; children: React.ReactNode }) { return <section className="staff-card detail-section"><div className="section-title"><h2>{title}</h2>{tag && <span>{tag}</span>}</div>{children}</section>; }
function Info({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function StatusBadge({ status }: { status: CaseStatus }) { return <span className={`status-badge ${status}`}>{statusLabel[status]}</span>; }
function EmptyCase({ id }: { id: string }) { return <section className="staff-card empty-page"><h1>案件が見つかりません</h1><p>受付番号「{id}」のデモ案件はありません。</p><a className="detail-button" href="/staff">一覧へ戻る</a></section>; }
