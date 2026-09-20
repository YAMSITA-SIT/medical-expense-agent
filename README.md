# medical-expense-agent

日本の高額療養費制度について、利用者が入力した情報から、対象になる可能性、
自己負担限度額、払い戻しの概算額、計算過程、判断理由、不足情報を返すバックエンドMVPです。

## 重要な注意事項

- 本システムが返す結果は概算であり、支給を保証するものではありません。
- 最終的な支給可否と支給額は、自治体、協会けんぽ、健康保険組合などの加入先保険者が決定します。
- 金額計算に生成AIは使用せず、公表された計算式による決定的なPythonプログラムで処理します。
- 実在する患者の個人情報、機密情報、APIキーをリポジトリに保存しないでください。

## MVPの対応範囲

- 70歳未満
- 1人分の基本計算
- 同一保険者に加入する家族の世帯合算
- 計算単位ごとの自己負担額21,000円基準
- 多数回該当（直近12か月で3回以上）
- 保険適用外費用の除外
- 2015年1月～2026年7月診療分の所得区分A～E
- 2026年8月～2027年7月診療分の所得区分A～E
- 入力不足時の「追加情報が必要」応答

## 対応していないもの

- フロントエンド、React、HTML、CSS
- OCR、生成AI、データベース
- 70歳以上、後期高齢者医療制度
- 年間上限の計算
- 特定疾病の自己負担軽減
- 2027年8月以降の制度
- 医療費控除や自治体独自助成など、高額療養費以外の制度

未対応の年齢・診療月は、既知の制度から推測せず `unsupported` を返します。

## 所得区分

入力の `income_category` には、加入先保険者が示す70歳未満の所得区分を指定します。

| 値 | 区分の目安（被用者保険） |
|---|---|
| `A` | 標準報酬月額83万円以上 |
| `B` | 標準報酬月額53万～79万円 |
| `C` | 標準報酬月額28万～50万円 |
| `D` | 標準報酬月額26万円以下 |
| `E` | 住民税非課税などの低所得者 |

年収だけで区分を推測せず、資格情報や加入先保険者に確認した区分を入力してください。
国民健康保険では区分判定に旧ただし書所得等が使われるため、上表の標準報酬月額はそのまま使えません。

## 入力単位

`expenses` の各要素は、同一月について次を分離した「計算単位」を表します。

- 受診者
- 医療機関
- 医科／歯科
- 入院／外来

同じ `person_id` と `calculation_unit_id` の入力は先に合計し、その自己負担額が
21,000円以上かを判定します。調剤分を処方元医療機関に合算する必要がある場合は、
同じ `calculation_unit_id` を指定してください。

`total_medical_cost_yen` は保険適用前の10割の総医療費、`patient_paid_yen` は
その計算単位について実際に負担した保険診療分の金額です。差額ベッド代などは
`insurance_covered: false` の別単位として入力してください。

## API

### ヘルスチェック

```http
GET /health
```

### 高額療養費の概算

```http
POST /v1/high-cost-medical-expense/evaluate
Content-Type: application/json
```

入力例は `examples/` にあります。

```bash
curl -X POST http://127.0.0.1:8000/v1/high-cost-medical-expense/evaluate \
  -H "Content-Type: application/json" \
  --data-binary @examples/single_person.json
```

不足項目がある場合は金額を推測せず、次の状態を返します。

```json
{
  "status": "additional_information_required",
  "eligibility_possibility": null,
  "self_payment_limit_yen": null,
  "estimated_refund_yen": null
}
```

## セットアップと起動

Python 3.12を使用します。

```bash
python -m venv .venv
```

Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
uvicorn app.main:app --reload
```

macOS/Linux:

```bash
source .venv/bin/activate
python -m pip install -e ".[dev]"
uvicorn app.main:app --reload
```

起動後、`http://127.0.0.1:8000/docs` でAPIを試せます。

## テストと静的検査

```bash
pytest
ruff check .
ruff format --check .
```

## 計算の考え方

1. 対象診療月から施行済みの制度表を選択します。
2. 保険適用外と異なる保険者の費用を除外します。
3. 受診者・計算単位ごとに保険診療分を集計します。
4. 自己負担額21,000円以上の計算単位だけを世帯合算します。
5. 所得区分と総医療費から自己負担限度額を計算します。
6. 直近12か月で3回以上該当している場合は多数回該当額を使用します。
7. `max(0, 対象自己負担額 - 自己負担限度額)` を概算払い戻し額とします。

1%加算部分は円単位の整数計算とし、1円未満を切り捨てます。実際の保険者計算とは
差が生じる可能性があるため、出力は概算として扱います。

## ルールの更新

制度表は `app/rules/` に期間別に分離しています。計算サービスに金額を直接記述せず、
診療月を `app/rules/selector.py` で対応する確定済み制度表へ振り分けます。
将来制度を追加するときは、公的一次資料で施行内容を確認してから新しい期間のルールを追加します。

## 根拠資料

確認日：2026年9月20日

### 2026年7月診療分まで

- 厚生労働省「高額療養費制度を利用される皆さまへ」
  - URL: https://www.mhlw.go.jp/content/000333279.pdf
  - 対象：平成30年8月以降から2026年7月診療分までの自己負担限度額、世帯合算、多数回該当
- 全国健康保険協会「高額療養費」
  - URL: https://www.kyoukaikenpo.or.jp/benefit/high_cost_medical_expenses/002/
  - 対象：70歳未満の所得区分、総医療費の定義、21,000円基準、世帯合算、多数回該当

### 2026年8月～2027年7月診療分

- 厚生労働省「高額療養費制度の見直しについて（令和8年8月診療分から）」
  - URL: https://www.mhlw.go.jp/content/001726232.pdf
  - 対象：2026年8月～2027年7月の月額上限、多数回該当額、年間上限
- 厚生労働省「高額療養費制度に関する参考資料」
  - URL: https://www.mhlw.go.jp/content/001729632.pdf
  - 対象：制度概要と計算例
- 厚生労働省「高額療養費制度を利用される皆さまへ」
  - URL: https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryouhoken/juuyou/kougakuiryou/index.html
  - 対象：制度改正の施行時期、問い合わせ先

公的資料が更新された場合は、対象診療月と資料の版を確認してからルールを更新してください。

