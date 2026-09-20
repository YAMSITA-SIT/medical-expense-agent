import sys
import os
from pathlib import Path

# プロジェクトルートの絶対パスを取得
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.append(str(PROJECT_ROOT))

# .env ファイルを自動読み込み
try:
    from dotenv import load_dotenv
    load_dotenv(PROJECT_ROOT / ".env")
except ImportError:
    pass  # python-dotenv が入っていない場合は通常の環境変数を使用

import asyncio
from app.workflow.ocr import OpenRouterOCR, check_exceptions_and_generate_advice

if __name__ == "__main__":
    async def run_ocr_test():
        # tmp フォルダの画像を直接指定
        image_filename = "fictional-receipt_2.jpg"
        image_path = PROJECT_ROOT / "tmp" / image_filename
        
        if not image_path.exists():
            print(f"画像ファイルが見つかりません: {image_path}")
            print("`tmp` フォルダの中に対象の画像を配置してください。")
            return

        ext = image_path.suffix.lower()
        mime_type = "image/jpeg" if ext in [".jpg", ".jpeg"] else "image/png"

        print(f"画像を読み込んでいます: {image_path}")
        with open(image_path, "rb") as f:
            image_bytes = f.read()

        # 強制的に OpenRouterOCR（AI解析）を使用
        api_key = os.getenv("OPENROUTER_API_KEY")
        
        if not api_key:
            print("エラー: OPENROUTER_API_KEY が取得できていません。")
            print(".env ファイルの記述を確認するか、python-dotenv をインストールしてください。")
            return

        provider = OpenRouterOCR(api_key=api_key)
        print(f"使用プロバイダー: {provider.__class__.__name__}")
        
        print("AIが画像を解析中...（数十秒かかる場合があります）")
        try:
            document = await provider.extract(image_bytes, mime_type)
        except Exception as e:
            # エラーの詳細（型や詳細メッセージ、トレースバック）を詳しく出力
            print(f"\n【OCRエラー発生】: {type(e).__name__} - {repr(e)}")
            import traceback
            traceback.print_exc()
            return

        print("\n=================== OCR読み取り結果 ===================")
        print(f"氏名        : {document.name.value}")
        print(f"診療年月日  : {document.service_date.value}")
        print(f"医療機関名  : {document.provider_name.value}")
        print(f"総医療費    : {document.total_medical_cost_yen.value} 円")
        print(f"自己負担額  : {document.patient_paid_yen.value} 円")
        print("=======================================================\n")

        # 計算チェック＆判定
        result = check_exceptions_and_generate_advice(document)
        
        if result["has_exception"]:
            print("【検出された問題点】")
            for issue in result["issues"]:
                print(f" ・{issue}")
            print("\n" + result["agent_advice"])
        else:
            print("問題は検出されませんでした（全項目正常・計算整合）")

    asyncio.run(run_ocr_test())