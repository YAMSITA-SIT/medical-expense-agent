# 医療費サポートナビ（フロントエンド）

## Windows PowerShellで起動

バックエンドを別のPowerShellで起動します。

```powershell
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
uvicorn app.main:app --reload --env-file .env --port 8001
```

フロントエンドを起動します。

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

`http://localhost:5173` を開いてください。接続先は `.env` の `VITE_API_BASE_URL` で変更できます。未指定時は `http://127.0.0.1:8001` です。

## 操作と安全上の注意

PNG/JPEG（最大5MiB）を選び、OCR結果を確認・修正してから追加情報を入力します。判定後はhandoff、検証、判定のJSONをコピーまたはダウンロードできます。

MockOCRは画像を読まず、固定の架空データを返します。画面にMockOCR警告が出た場合は実画像の結果ではありません。APIキーはフロントエンドへ設定しないでください。画像・OCR結果はlocalStorageへ保存しません。認証や通信暗号化等が整っていない開発環境へ実在患者データを送信しないでください。

## テスト

```powershell
npm run typecheck
npm run lint
npm run build
```
