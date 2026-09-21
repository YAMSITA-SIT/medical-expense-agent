import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { staffApi } from '../services/staffApi';
import type {
  CaseStatus,
  StaffCase,
} from '../types/staff';
import './staff.css';

const statusLabel: Record<CaseStatus, string> = {
  new: '受付済み',
  ocr_review: 'OCR確認待ち',
  needs_info: '情報不足',
  manual_review: '要確認',
  supervisor_review: '上席確認',
  completed: '確認完了',
  returned: '差し戻し',
};

function formatDateTime(iso: string): string {
  const value = new Date(iso);

  if (Number.isNaN(value.getTime())) {
    return '日時不明';
  }

  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

export function StaffApp({
  path,
}: {
  path: string;
}) {
  const [cases, setCases] = useState<StaffCase[]>([]);

  const [apiState, setApiState] = useState<
    'checking' | 'online' | 'offline'
  >('checking');

  const [loading, setLoading] = useState(true);

  const [loadError, setLoadError] = useState<
    string | null
  >(null);

  const [notice, setNotice] = useState('');

  const loadUploadHistory = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setNotice('');
    setApiState('checking');

    try {
      await staffApi.health();

      const result =
        await staffApi.getUploadHistory();

      setCases(result.items ?? []);

      setNotice(
        typeof result.notice === 'string'
          ? result.notice
          : '',
      );

      setApiState('online');
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'アップロード履歴の取得中にエラーが発生しました。';

      setCases([]);
      setNotice('');
      setLoadError(message);
      setApiState('offline');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadUploadHistory();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadUploadHistory]);

  const isOldDetailPath =
    /^\/staff\/cases\/[^/]+$/.test(path);

  const noticeText =
    typeof notice === 'string' ? notice.trim() : '';

  return (
    <div className="staff-shell">
      <header className="staff-header">
        <a
          className="staff-brand"
          href="/staff"
          aria-label="職員ポータルのトップへ"
        >
          <span
            className="staff-brand-mark"
            aria-hidden="true"
          >
            医
          </span>

          <span>
            <strong>
              医療費支援 審査ポータル
            </strong>

            <small>
              開発用・アップロード履歴
            </small>
          </span>
        </a>

        <div className="staff-header-actions">
          <span className={`api-state ${apiState}`}>
            <i aria-hidden="true" />

            API{' '}

            {apiState === 'online'
              ? '接続中'
              : apiState === 'offline'
                ? '未接続'
                : '確認中'}
          </span>

          <a href="/" className="user-link">
            利用者画面へ
          </a>

          <span
            className="avatar"
            aria-label="職員画面"
          >
            審
          </span>
        </div>
      </header>

      {apiState === 'offline' && (
        <div className="api-alert" role="alert">
          APIサーバーに接続できません。
          バックエンドが起動しているか、
          VITE_API_BASE_URLが正しいか確認してください。
        </div>
      )}

      <main className="staff-main">
        {noticeText !== '' && (
          <div
            className="demo-ribbon"
            role="status"
          >
            {noticeText}
          </div>
        )}

        {isOldDetailPath && (
          <div
            className="api-alert"
            role="status"
          >
            個人情報保護のため案件詳細画面は無効にしています。
            アップロード履歴一覧を表示します。
          </div>
        )}

        <Dashboard
          cases={cases}
          loading={loading}
          loadError={loadError}
          onReload={loadUploadHistory}
        />
      </main>
    </div>
  );
}

type DashboardProps = {
  cases: StaffCase[];
  loading: boolean;
  loadError: string | null;
  onReload: () => Promise<void>;
};

function Dashboard({
  cases,
  loading,
  loadError,
  onReload,
}: DashboardProps) {
  const [query, setQuery] = useState('');

  const [status, setStatus] = useState<
    CaseStatus | 'all'
  >('all');

  const [receivedDate, setReceivedDate] =
    useState('');

  const [attentionOnly, setAttentionOnly] =
    useState(false);

  const counts = useMemo(
    () => ({
      total: cases.length,

      ocr: cases.filter(
        (item) =>
          item.status === 'ocr_review',
      ).length,

      attention: cases.filter(
        (item) => item.requiresAttention,
      ).length,

      duplicate: cases.filter(
        (item) =>
          item.document.duplicateSuspected,
      ).length,

      quality: cases.filter(
        (item) =>
          item.document.qualityIssues.length >
          0,
      ).length,
    }),
    [cases],
  );

  const filtered = useMemo(() => {
    const needle =
      query.trim().toLowerCase();

    return cases.filter((item) => {
      const matchesQuery =
        needle.length === 0 ||
        item.id
          .toLowerCase()
          .includes(needle) ||
        item.document.ocrProvider
          .toLowerCase()
          .includes(needle);

      const matchesStatus =
        status === 'all' ||
        item.status === status;

      const matchesDate =
        receivedDate.length === 0 ||
        item.receivedAt.slice(0, 10) ===
          receivedDate;

      const matchesAttention =
        !attentionOnly ||
        item.requiresAttention;

      return (
        matchesQuery &&
        matchesStatus &&
        matchesDate &&
        matchesAttention
      );
    });
  }, [
    attentionOnly,
    cases,
    query,
    receivedDate,
    status,
  ]);

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            開発用
          </p>

          <h1>アップロード履歴</h1>

          <p>
            利用者画面から送信されたファイルの受付履歴だけを表示します。
          </p>
        </div>

        <button
          type="button"
          className="detail-button"
          onClick={() => void onReload()}
          disabled={loading}
        >
          {loading
            ? '更新中…'
            : '履歴を更新'}
        </button>
      </div>

      <section
        className="metric-grid"
        aria-label="アップロード件数"
      >
        <Metric
          label="アップロード総数"
          value={counts.total}
          tone="blue"
          icon="↑"
        />
      </section>

      <section className="staff-card">
        <div className="card-title">
          <div>
            <h2>アップロード一覧</h2>

            <p>
              {filtered.length}件を表示
            </p>
          </div>
        </div>

        <div className="filters">
          <label className="search-field">
            <span>検索</span>

            <input
              value={query}
              onChange={(event) =>
                setQuery(event.target.value)
              }
              placeholder="受付番号・OCRプロバイダーで検索"
            />
          </label>

          <label>
            <span>状態</span>

            <select
              value={status}
              onChange={(event) =>
                setStatus(
                  event.target.value as
                    | CaseStatus
                    | 'all',
                )
              }
            >
              <option value="all">
                すべて
              </option>

              {Object.entries(
                statusLabel,
              ).map(([key, label]) => (
                <option
                  key={key}
                  value={key}
                >
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>
              アップロード日
            </span>

            <input
              type="date"
              value={receivedDate}
              onChange={(event) =>
                setReceivedDate(
                  event.target.value,
                )
              }
            />
          </label>

          <label className="check-filter">
            <input
              type="checkbox"
              checked={attentionOnly}
              onChange={(event) =>
                setAttentionOnly(
                  event.target.checked,
                )
              }
            />

            要確認のみ
          </label>
        </div>

        {loading && (
          <div
            className="empty-state"
            role="status"
          >
            アップロード履歴を読み込んでいます…
          </div>
        )}

        {!loading && loadError && (
          <div
            className="empty-state"
            role="alert"
          >
            アップロード履歴を取得できませんでした。
          </div>
        )}

        {!loading && !loadError && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>受付番号</th>
                  <th>
                    アップロード日時
                  </th>
                  <th>
                    OCRプロバイダー
                  </th>
                  <th>重複の疑い</th>
                  <th>画像品質</th>
                  <th>状態</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>
                        {item.id}
                      </strong>
                    </td>

                    <td>
                      {formatDateTime(
                        item.receivedAt,
                      )}
                    </td>

                    <td>
                      {item.document
                        .ocrProvider ||
                        '不明'}
                    </td>

                    <td>
                      {item.document
                        .duplicateSuspected ? (
                        <span className="priority high">
                          確認必要
                        </span>
                      ) : (
                        <span className="priority low">
                          なし
                        </span>
                      )}
                    </td>

                    <td>
                      {item.document
                        .qualityIssues.length >
                      0 ? (
                        <>
                          <span className="priority high">
                            問題あり
                          </span>

                          <small>
                            {item.document.qualityIssues.join(
                              '、',
                            )}
                          </small>
                        </>
                      ) : (
                        <span className="priority low">
                          問題なし
                        </span>
                      )}
                    </td>

                    <td>
                      <StatusBadge
                        status={item.status}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filtered.length === 0 && (
              <div className="empty-state">
                {cases.length === 0
                  ? 'アップロード履歴はまだありません。利用者画面から書類をアップロードすると、ここに表示されます。'
                  : '検索条件に一致するアップロード履歴はありません。'}
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}

type MetricProps = {
  label: string;
  value: number;
  tone: string;
  icon: string;
};

function Metric({
  label,
  value,
  tone,
  icon,
}: MetricProps) {
  return (
    <article
      className={`metric ${tone}`}
    >
      <span
        className="metric-icon"
        aria-hidden="true"
      >
        {icon}
      </span>

      <div>
        <small>{label}</small>

        <strong>
          {value}
          <em>件</em>
        </strong>
      </div>
    </article>
  );
}

function StatusBadge({
  status,
}: {
  status: CaseStatus;
}) {
  return (
    <span
      className={`status-badge ${status}`}
    >
      {statusLabel[status]}
    </span>
  );
}