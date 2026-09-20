"""Generate a clearly fictional Japanese hospital receipt for OCR testing."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT_CANDIDATES = (
    Path("C:/Windows/Fonts/YuGothM.ttc"),
    Path("C:/Windows/Fonts/meiryo.ttc"),
    Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
)

LINES = (
    "【テスト専用・架空】領収書",
    "患者氏名：架空 太郎",
    "生年月日：2000年1月2日",
    "診療年月日：2026年9月20日",
    "医療機関名：架空テスト病院",
    "保険診療の総医療費：100,000円",
    "自己負担額：30,000円",
    "診療区分：外来",
    "診療科区分：医科",
    "保険外費用：0円",
    "差額ベッド代：0円",
    "食事療養費：0円",
    "領収書番号：FICTIONAL-20260920-001",
    "実在の患者・医療機関とは関係ありません",
)


def _font(size: int = 34) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if path.exists():
            return ImageFont.truetype(str(path), size)
    raise RuntimeError(
        "日本語フォントが見つかりません。Windows標準の游ゴシックまたはメイリオが必要です。"
    )


def generate(output: Path) -> Path:
    image = Image.new("RGB", (1400, 1600), "white")
    draw = ImageDraw.Draw(image)
    font = _font()
    y = 80
    for line in LINES:
        draw.text((100, y), line, fill="black", font=font)
        y += 90
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, format="PNG")
    return output


if __name__ == "__main__":
    path = generate(Path("tmp/fictional-receipt.png"))
    print(f"created: {path}")
