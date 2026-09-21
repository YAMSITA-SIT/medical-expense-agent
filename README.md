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
- 生成AI、データベース
- 70歳以上、後期高齢者医療制度
- 年間上限の計算
- 特定疾病の自己負担軽減
- 2027年8月以降の制度
- 医療費控除や自治体独自助成など、高額療養費以外の制度

未対応の年齢・診療月は、既知の制度から推測せず `unsupported` を返します。

## 実OCR（Azure AI Document Intelligence）

確認日：2026年9月20日

| 項目 | 採用仕様 |
|---|---|
| API・モデル | Document Intelligence v4.0 GA、REST API `2024-11-30`、Readモデル `prebuilt-read` |
| 日本語 | 印刷文字の抽出に対応。Readモデルの日本語手書き文字も `ja` として対応 |
| 入力形式 | Azure側はPDF、JPEG/JPG、PNG、BMP、TIFF、HEIF、Office/HTML等に対応。本APIは安全なPoC範囲としてPNG/JPEGだけを受け付ける |
| Azure側サイズ上限 | F0は4 MB、S0は500 MB。本API独自上限は5 MiB（F0利用時は4 MB以下にする） |
| 画像寸法 | Azure要件は50×50～10,000×10,000ピクセル。本APIも同じ寸法範囲で検証 |
| 認証 | Azureリソースのendpointと、`Ocp-Apim-Subscription-Key` ヘッダーのAPIキー |

公式資料：

- [Read OCRモデル、形式・サイズ・寸法・モデルID](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/read?view=doc-intel-4.0.0)
- [Read/Layoutの日本語対応](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/language-support/ocr?view=doc-intel-4.0.0)
- [サービスのクォータと上限](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/service-limits?view=doc-intel-4.0.0)
- [Analyze Document REST APIと認証](https://learn.microsoft.com/en-us/rest/api/aiservices/document-models/analyze-document?view=rest-aiservices-v4.0%20%282024-11-30%29)

### 接続設定

`.env.example` を参照し、実行環境へ次の2変数を設定します。値をファイルやGitへ
コミットしないでください。両方が揃ったときだけAzureを利用し、それ以外はMockOCRへ
安全にフォールバックします。

```bash
export AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT="https://<resource>.cognitiveservices.azure.com"
export AZURE_DOCUMENT_INTELLIGENCE_KEY="<secret>"
```

#### Azure Portalで行うこと

1. Azure Portalで「Azure AI services」からDocument Intelligenceリソースを作成します。
2. リソースの「Keys and Endpoint」を開き、EndpointとKEY 1（またはKEY 2）を確認します。
3. 値はGitHub、README、スクリーンショット、チャットへ貼らず、次のWindows環境変数にだけ設定します。

初心者には、キーがPowerShellの履歴に残らないようWindowsの画面から設定する方法を推奨します。

1. スタートメニューで「環境変数」と検索します。
2. 「システム環境変数の編集」→「環境変数」を開きます。
3. 上側の「ユーザー環境変数」で「新規」を押し、次の2件を1件ずつ登録します。
   - 変数名 `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`、値はAzure PortalのEndpoint
   - 変数名 `AZURE_DOCUMENT_INTELLIGENCE_KEY`、値はAzure PortalのKEY 1またはKEY 2
4. 「OK」で閉じ、PowerShellとVS Codeをいったん終了して開き直します。

PowerShellでは実値を表示せず、変数が存在するかだけ確認します。

```powershell
if ($env:AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT) { "endpoint: configured" } else { "endpoint: missing" }
if ($env:AZURE_DOCUMENT_INTELLIGENCE_KEY) { "key: configured" } else { "key: missing" }
```

現在開いているPowerShellだけで一時的に試す場合は次の形式も使えますが、コマンド履歴に
残る可能性があります。共有PCでは使わず、試験後はウィンドウを閉じてください。

```powershell
$env:AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT="https://<resource>.cognitiveservices.azure.com"
$env:AZURE_DOCUMENT_INTELLIGENCE_KEY="<secret>"
```

両方が設定されているとAzure、両方または一方がない場合はMockOCRを使用します。

処理は、画像検証、メモリー上でのSHA-256算出、Azureへの送信、非同期結果の取得、
単語座標・信頼度を使った項目候補化、低信頼度判定、マスキング、確認JSON返却の順です。
画像とOCR生データは保存せず、生の全文も返しません。同一プロセス内では画像を保存せず、
有効期限10分のハッシュだけで二重送信候補を検出します。

抽出候補は氏名、生年月日、診療年月日、医療機関名、保険診療の総医療費、自己負担額、
入院・外来、医科・歯科、保険外費用、差額ベッド代、食事療養費、領収書番号、
領収書・診療明細書の区別です。ラベルに基づく候補抽出であり、値を推測しません。
必須候補がない、または信頼度0.90未満なら `manual_review_required` と
`calculation_result: null` を返します。

### OCR API利用例

```bash
curl -X POST "http://127.0.0.1:8000/v2/documents/extract" \
  -H "Content-Type: image/jpeg" \
  --data-binary @receipt.jpg
```

レスポンスの各項目には `value`、`confidence`、`confirmed`、
`bounding_regions` が含まれます。既定では氏名・生年月日等を `***` にします。
権限管理された確認用途でだけ `?mask=false` を使用してください。

### 架空領収書による接続テスト

実在の領収書は使いません。Windows標準の日本語フォントを使い、テスト専用画像を生成します。

```powershell
python scripts/generate_fictional_receipt.py
```

`tmp/fictional-receipt.png` が生成されます。`tmp/` はGit対象外です。この画像には、架空の氏名・
医療機関名、日付、保険診療費、自己負担額、診療区分、保険外費用等だけが含まれます。

標準テストはAzureへ通信しません。実通信は、2つのAzure環境変数を設定したうえで明示的に
有効化した場合だけ1件実行します。

```powershell
pytest
ruff check .
ruff format --check .

$env:RUN_AZURE_LIVE_TEST="1"
pytest tests/test_azure_live.py -v
Remove-Item Env:RUN_AZURE_LIVE_TEST
```

実通信テストの成功は、Azureへの送信と応答変換が完了したことを示します。個々の項目精度は、
次のAPI応答の `value`、`confidence`、`missing_information` を職員が確認してください。

```powershell
uvicorn app.main:app --host 127.0.0.1 --port 8000
curl.exe -X POST "http://127.0.0.1:8000/v2/documents/extract" `
  -H "Content-Type: image/png" `
  --data-binary "@tmp/fictional-receipt.png"
```

確認・修正後は、抽出値と計算用 `expenses` の値を一致させ、各抽出項目の `confirmed` を
`true` にして次の順に送ります。OCR値と利用者が修正した計算値が異なる場合、
`INPUT_CONFLICT` により `manual_review_required` となり、計算結果は返しません。

```powershell
curl.exe -X POST "http://127.0.0.1:8000/v2/cases/validate" `
  -H "Content-Type: application/json" --data-binary "@examples/workflow_case.json"
curl.exe -X POST "http://127.0.0.1:8000/v2/cases/evaluate" `
  -H "Content-Type: application/json" --data-binary "@examples/workflow_case.json"
```

現在の制限として、帳票レイアウトや表記揺れによって候補を抽出できない場合があります。
和暦は自動変換せず、点数から総医療費への換算も行いません。二重送信検出は単一プロセス内の
短時間検出で、再起動・複数ワーカーをまたぎません。Azureの実通信試験には利用者側の
Azureリソースと認証情報が必要です。

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

## 書類確認・例外振り分けワークフロー（API v2）

既存の `/v1/high-cost-medical-expense/evaluate` はそのまま利用できます。v2は、書類抽出、
利用者による確認、不足情報の検査、例外の職員振り分け、概算計算を順番に行うAPIです。

```text
画像（PNG/JPEG、最大5MiB）
  -> OCR抽出（Azure設定時は実OCR、未設定時は固定の架空データを返すMockOCR）
  -> 項目別の値・信頼度・確認状態をJSONで返却
  -> 利用者または職員が確認・修正
  -> /v2/cases/validate で不足・例外を検査
  -> /v2/cases/evaluate で決定的な計算
  -> 次工程へ渡せるJSONを返却
```

OCRは `app/workflow/ocr.py` の `OCRProvider` インターフェースで交換できます。
`AzureDocumentIntelligenceOCR` と `MockOCR` を実装しています。MockOCRは画像を読み取らず、
固定の架空データを返します。本物のOCR結果と誤認しないよう、レスポンスの `source` と
`notice` に明示しています。画像バイト列は処理中のメモリーだけで扱い、
ファイルやデータベースに保存しません。

### v2のステータス

| ステータス | 意味 |
|---|---|
| `ready_for_calculation` | 不足・既知の例外がなく、計算可能 |
| `additional_information_required` | 入力不足。計算しない |
| `manual_review_required` | 自動処理できない例外。職員確認が必要 |
| `calculation_completed` | 概算計算が完了 |
| `pending_receipt` | レセプト待ち |
| `duplicate_suspected` | 重複診療・重複申請の疑い |
| `recalculation_required` | 訂正・再請求などによる再計算が必要 |
| `unsupported_case` | 70歳以上、未対応期間などPoC対象外 |

例外コード、理由、カテゴリ、職員が行う確認は `app/workflow/codes.py` で一元管理しています。
これは法令上の不支給条件を断定する表ではなく、自動計算を止めるための保守的なPoC運用ルールです。
入力者が例外確認を完了していない場合も、例外なしとは推測せず計算を止めます。

### API v2

画像抽出はPNGまたはJPEGをraw bodyで送ります。初期値では氏名、生年月日、保険証番号、
口座番号をマスクします。`mask=false` は本人確認画面など、権限管理された利用箇所だけで使用してください。

```bash
curl -X POST "http://127.0.0.1:8000/v2/documents/extract" \
  -H "Content-Type: image/png" \
  --data-binary @fictional-receipt.png
```

抽出JSONを確認・修正し、計算に使う項目の `confirmed` を `true` にします。マスクされた `***` は
計算入力に転記せず、権限のある処理で元の値を確認してください。入力例はすべて架空で、
`examples/workflow_case.json` にあります。

```bash
curl -X POST http://127.0.0.1:8000/v2/cases/validate \
  -H "Content-Type: application/json" \
  --data-binary @examples/workflow_case.json

curl -X POST http://127.0.0.1:8000/v2/cases/evaluate \
  -H "Content-Type: application/json" \
  --data-binary @examples/workflow_case.json
```

`GET /v2/rules` は、計算ルールのメタデータ、確認日、根拠資料、例外コードを返します。
外部の資格・税・レセプト・支給履歴APIまたはMCPはまだ接続せず、
`app/workflow/external.py` に交換可能なインターフェースと架空のモックだけを用意しています。

### v2の通常処理

- 70歳未満の単身計算
- 同じ保険者かつ確認済みの給付上の世帯単位での合算
- 医療機関、医科・歯科、入院・外来別の21,000円判定
- 保険外費用の除外
- 所得区分別限度額と多数回該当
- 対象医療費、除外額、限度額、払い戻し概算、計算過程、使用入力、判断理由の返却

### v2で自動計算を止めるケース

`app/workflow/codes.py` には、資格・世帯、レセプト、他制度、所得・申請に関する指定の例外を
列挙しています。明示された例外に加え、資格期間から判明する月途中の加入・脱退・保険変更、
70歳・75歳到達付近、異なる保険者、重複データ、領収書とレセプトの不一致、OCRの低信頼度、
未確認抽出値、入力間の矛盾を検出します。例外が複数ある場合は全件を返し、金額は返しません。

次の処理は初期版では自動決定しません。

- 70歳以上、後期高齢者医療、特定疾病、訪問看護、療養費、柔道整復、治療用装具
- 自治体助成、公費、労災、第三者行為、生活保護、高額医療・高額介護合算
- 転居・遡及資格・世帯異動・死亡・代理人等を含む資格や申請の例外
- 年間上限、既支給額や現物給付との精算、申請期限の最終判断
- 1円未満の端数が生じる計算（現行法令の適用条文・端数処理を確定するまで職員確認）

### 個人情報の扱い

- APIはリクエスト本文やOCR結果をログ出力しません。
- 入力エラーでは不正な入力値を応答に含めません。
- OCR失敗時は外部サービスの詳細エラーを返しません。
- 計算結果内の氏名、生年月日、住所、保険証番号、口座番号をマスクします。
- サンプルとテストは `fictional` または「架空」と明示したデータだけを使用します。

本番運用には、認証・権限管理、通信暗号化、監査ログの設計、保存期間、同意管理、実OCR事業者との
契約・安全管理、保険者による制度検証が別途必要です。

### ルールのメタデータ

`app/rules/metadata.py` に資料名、URL、条文・対象事項、適用期間、確認日、検証状態を保持します。
2026年9月20日時点で、月額限度額は厚生労働省・協会けんぽの公表資料を確認しました。
国民健康保険法施行令は第29条の2・第29条の3を参照していますが、格納URLの参照版と
2026年改正後の現行条文の完全照合は未完了です。国保標準仕様書第1.7版は公開一覧まで、
個別の機能・帳票要件と通知は未照合です。このため、それらを根拠とする例外は自動決定せず
職員確認へ回します。

- e-Gov「国民健康保険法施行令」: https://laws.e-gov.go.jp/law/333CO0000000362
- 厚生労働省「標準仕様書・標準化基準（国民健康保険）」: https://www.mhlw.go.jp/stf/kokuho_std.html

最終的な支給可否・金額は保険者が決定します。

## OCR―制度判定接続API（v3）

`POST /v3/benefits/evaluate-ocr` は、確認済みOCR JSONと追加情報を受け取り、期間付きの
決定的ルールで高額療養費を計算します。生成AIに金額計算を任せません。

```text
領収書画像 -> /v2/documents/extract -> 人によるOCR値確認
  -> 所得・保険資格・世帯・履歴・例外情報を追加
  -> /v3/benefits/evaluate-ocr
  -> calculated / additional_information_required / human_review_required / unsupported
```

主な入力は `patient`、`service_date` または `service_month`、`insurance`、`income`、
`costs`、`care`、`household_expenses`、`prior_12_month_benefit_months`、
`special_cases`、`ocr_confidence` です。OCRだけでは通常、所得区分、世帯員の対象医療費、
過去12か月の該当履歴、公費・労災・付加給付等の認定情報が不足します。

不足時は金額を返しません。

```json
{
  "status": "additional_information_required",
  "applicable_programs": [],
  "missing_fields": ["insurance.type", "income.category"],
  "calculation": null,
  "applied_rules": [],
  "warnings": ["不足値やOCR低信頼度値を推測せず計算を停止しました。"],
  "needs_human_review": true
}
```

計算成功時は対象医療費、患者負担、自己負担限度額、給付概算額に加え、`rule_id`、
適用開始日・終了日、式、資料名、該当箇所、公式URL、確認状態を `applied_rules` へ返します。

### ルールと適用年月の管理

- 実行可能な期間別ルール: `app/rules/benefit_rules.json`
- 32パターンの対応状態: `app/rules/pattern_support.json`
- 規則選択: `app/benefits/rule_store.py`
- OCR接続・不足検出・計算: `app/benefits/service.py`

規則には `rule_id`、制度名、保険種別、年齢・所得・入外・世帯・多数回条件、式、端数、
適用開始日・終了日、根拠資料・該当箇所・URL、確認状態を保持します。診療日に一致する
実行可能ルールが0件または複数件なら計算を止めます。

制度改正時は、旧規則を上書きせず終了日を設定し、新しい `rule_id` の規則を追加します。
法令本文、施行日、附則、経過措置、公式案内を確認し、境界日の前後テストを追加してください。
2013年資料は歴史資料としてのみ扱い、現在の金額表には使用していません。

### 自動計算せず人へ回す条件

- P22 健康保険組合の付加給付、P23 共済組合の附加給付
- 公費負担・精神通院医療・特定疾病・労災・第三者行為
- P27 海外療養費、P28 治療用装具、P30 年間上限
- 月途中の保険変更、75歳到達月、70歳以上
- 金額内訳の不一致、OCR信頼度0.90未満、期間ルール0件または重複

これらは `human_review_required` または `unsupported` とし、推測金額を返しません。
`GET /v3/benefits/pattern-support` でP01～P32の現在の分類を確認できます。

### テスト

```bash
python -m pytest -q
python -m ruff check app/benefits tests/test_benefit_integration.py
```

テストでは通常計算、入力不足、金額不整合、2026年7月／8月の境界、所得・年齢の扱い、
世帯合算、多数回該当、保険外費用、OCR低信頼度、32パターン登録を確認します。

### 個人情報と環境変数

氏名は制度計算に不要なためv3入力で受け付けません。保険者番号等をログへ出さず、実患者情報を
サンプルやテストへ保存しないでください。Azure設定は `.env.example` の変数名だけを参照し、
秘密値を含む `.env` は `.gitignore` によりコミット対象外です。本番では認証、権限分離、暗号化、
監査、保存期間、削除、同意、委託先管理を追加してください。

## OCR AIエージェントから制度判定エージェントへの受け渡し

`POST /v2/documents/extract` のレスポンスに `handoff` を追加しています。既存の
`document`、不足確認、制度判定APIは削除していません。制度判定エージェントには元画像ではなく、
原則としてこの `handoff` オブジェクトだけを渡してください。この処理では給付額計算や
制度の対象判定を行いません。

既定の `mask=true` では氏名、保険識別子、OCR原文をマスクします。権限管理された内部連携で
原文を含める必要がある場合だけ `?mask=false` を指定してください。画像とOCR原文をログへ
出力せず、画像は処理後に破棄してください。

```json
{
  "schema_version": "1.0",
  "document_id": "ocr-...",
  "document_type": "medical_receipt",
  "patient": {"name": "架空太郎"},
  "medical_institution": {"name": "架空病院"},
  "treatment": {
    "date": "2026-09-10",
    "type": "outpatient",
    "department": "内科"
  },
  "issue_date": "2026-09-10",
  "amounts": {
    "total_medical_cost": 300000,
    "insurance_covered_amount": 210000,
    "patient_payment": 90000,
    "non_covered_amount": 0,
    "currency": "JPY"
  },
  "receipt_number": "FICT-001",
  "insurance": {
    "insurer_number": "00000000",
    "symbol": "架空",
    "number": "0001"
  },
  "confidence": {
    "patient.name": 0.99,
    "treatment.date": 0.98,
    "amounts.patient_payment": 0.99
  },
  "missing_fields": [],
  "low_confidence_fields": [],
  "validation_warnings": [],
  "needs_human_review": false,
  "raw_text": "OCRで読み取った原文"
}
```

`missing_fields` は読めなかった項目、`low_confidence_fields` は信頼度0.90未満の項目、
`validation_warnings` は低コントラスト・不鮮明・回転候補・金額不整合を表します。
いずれかが存在すると `needs_human_review=true` です。次工程はこの場合に自動判定せず、
人による確認・修正を要求してください。

OCRプロバイダーは `.env` の `OCR_PROVIDER` で `mock`、`azure`、
`openrouter` を選択できます。未設定か認証情報不足の場合は、実画像を読まない固定の架空
MockOCRへフォールバックします。実在患者の画像を自動テストへ含めないでください。


## ブラウザ画面（React + TypeScript）

利用者向け画面は `frontend/` にあります。APIキーはブラウザへ設定せず、Azure/OpenRouterの秘密値はバックエンドの `.env` だけに保存してください。

### Windows PowerShellで同時に起動

PowerShell 1（バックエンド）:

```powershell
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
uvicorn app.main:app --reload --env-file .env --port 8001
```

PowerShell 2（フロントエンド）:

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

ブラウザで `http://localhost:5173` を開きます。APIを8001番以外で起動する場合は、`frontend/.env` の `VITE_API_BASE_URL` を変更して再起動してください。許可する開発画面のURLは、ルート `.env` の `FRONTEND_ORIGINS`（カンマ区切り）で限定できます。

### 操作手順とMockOCR

1. PNG/JPEG（最大5MiB）を選び、OCRを開始します。
2. 抽出値・信頼度・位置情報を確認し、誤りを修正して確認済みにします。
3. 保険種別、所得区分、過去12か月の該当回数、例外情報を入力します。
4. 検証・判定を実行し、不足・例外・概算結果を確認します。
5. 必要に応じて折りたたみ領域からhandoff等のJSONをコピーまたはダウンロードします。

未設定時のOCRはMockOCRです。MockOCRは画像を解析せず固定の架空データを返し、画面にも警告が表示されます。実OCRはバックエンドの `OCR_PROVIDER` と認証情報を使います。実在患者データは許可・認証・通信暗号化等を整えた環境以外で送信しないでください。画像とOCR結果はブラウザのlocalStorageに保存しません。

### フロントエンドを含むテスト

```powershell
cd frontend
npm run typecheck
npm run lint
npm run build
cd ..
python -m pytest -q
python -m ruff check .
python -m ruff format --check .
```
