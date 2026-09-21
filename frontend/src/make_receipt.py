import os
from PIL import Image, ImageDraw, ImageFont

# 画像サイズ（明細書比率）
width, height = 1200, 800
image = Image.new('RGB', (width, height), color=(255, 255, 255))
draw = ImageDraw.Draw(image)

# フォント設定
font_path = "C:/Windows/Fonts/meiryo.ttc"
if not os.path.exists(font_path):
    font_path = "C:/Windows/Fonts/msgothic.ttc"

try:
    font_title = ImageFont.truetype(font_path, 32)
    font_sub = ImageFont.truetype(font_path, 16)
    font_header = ImageFont.truetype(font_path, 18)
    font_body = ImageFont.truetype(font_path, 18)
    font_bold = ImageFont.truetype(font_path, 22)
    font_small = ImageFont.truetype(font_path, 14)
except Exception:
    font_title = font_sub = font_header = font_body = font_bold = font_small = ImageFont.load_default()

# 1. 領収書ヘッダー
draw.text((360, 40), "請 求 書 兼 領 収 証", fill=(0, 0, 0), font=font_title)
draw.text((60, 85), "※領収書の再発行はいたしません。", fill=(100, 100, 100), font=font_small)

# 医療機関情報
draw.text((750, 40), "神奈川県横須賀市久里浜 4-8-16", fill=(0, 0, 0), font=font_sub)
draw.text((750, 65), "医療法人社団 久里浜眼科", fill=(0, 0, 0), font=font_sub)
draw.text((750, 90), "TEL 046-833-0057", fill=(0, 0, 0), font=font_sub)

# 2. 患者情報
draw.rectangle([(60, 130), (1140, 200)], outline=(0, 0, 0), width=2)
draw.line([(240, 130), (240, 200)], fill=(0, 0, 0), width=1)
draw.line([(580, 130), (580, 200)], fill=(0, 0, 0), width=1)
draw.line([(700, 130), (700, 200)], fill=(0, 0, 0), width=1)
draw.line([(820, 130), (820, 200)], fill=(0, 0, 0), width=1)
draw.line([(960, 130), (960, 200)], fill=(0, 0, 0), width=1)
draw.line([(60, 165), (1140, 165)], fill=(0, 0, 0), width=1)

draw.text((90, 140), "患者番号", fill=(0, 0, 0), font=font_small)
draw.text((380, 140), "氏  名", fill=(0, 0, 0), font=font_small)
draw.text((615, 140), "保険者番号", fill=(0, 0, 0), font=font_small)
draw.text((725, 140), "負担割合", fill=(0, 0, 0), font=font_small)
draw.text((865, 140), "本・家", fill=(0, 0, 0), font=font_small)
draw.text((1010, 140), "発行日", fill=(0, 0, 0), font=font_small)

draw.text((90, 172), "103884", fill=(0, 0, 0), font=font_body)
draw.text((280, 172), "ヤマシタ アキト / 山下 暉登 様", fill=(0, 0, 0), font=font_body)
draw.text((610, 172), "06140248", fill=(0, 0, 0), font=font_body)
draw.text((750, 172), "3 割", fill=(0, 0, 0), font=font_body)
draw.text((875, 172), "本 人", fill=(0, 0, 0), font=font_body)
draw.text((980, 172), "令和8年9月12日", fill=(0, 0, 0), font=font_body)

# 3. 点数内訳テーブル
draw.rectangle([(60, 230), (1140, 420)], outline=(0, 0, 0), width=2)
draw.line([(60, 270), (1140, 270)], fill=(0, 0, 0), width=1)
draw.line([(60, 325), (1140, 325)], fill=(0, 0, 0), width=1)
draw.line([(60, 365), (1140, 365)], fill=(0, 0, 0), width=1)

col_widths = [180, 180, 180, 180, 180, 180]
cur_x = 60
for w in col_widths[:-1]:
    cur_x += w
    draw.line([(cur_x, 230), (cur_x, 420)], fill=(0, 0, 0), width=1)

draw.text((90, 240), "初・再診料", fill=(0, 0, 0), font=font_small)
draw.text((270, 240), "医学管理等", fill=(0, 0, 0), font=font_small)
draw.text((465, 240), "在宅医療", fill=(0, 0, 0), font=font_small)
draw.text((660, 240), "検 査", fill=(0, 0, 0), font=font_small)
draw.text((825, 240), "画像診断", fill=(0, 0, 0), font=font_small)
draw.text((1025, 240), "投 薬", fill=(0, 0, 0), font=font_small)

draw.text((180, 285), "288 点", fill=(0, 0, 0), font=font_body)
draw.text((360, 285), "0 点", fill=(0, 0, 0), font=font_body)
draw.text((540, 285), "0 点", fill=(0, 0, 0), font=font_body)
draw.text((690, 285), "1,200 点", fill=(0, 0, 0), font=font_body)
draw.text((900, 285), "0 点", fill=(0, 0, 0), font=font_body)
draw.text((1060, 285), "0 点", fill=(0, 0, 0), font=font_body)

draw.text((100, 335), "処 置", fill=(0, 0, 0), font=font_small)
draw.text((270, 335), "手 術 (白内障)", fill=(0, 0, 0), font=font_small)
draw.text((455, 335), "麻 酔", fill=(0, 0, 0), font=font_small)
draw.text((640, 335), "放射線治療", fill=(0, 0, 0), font=font_small)
draw.text((825, 335), "病理診断", fill=(0, 0, 0), font=font_small)
draw.text((1015, 335), "そ の 他", fill=(0, 0, 0), font=font_small)

draw.text((180, 380), "512 点", fill=(0, 0, 0), font=font_body)
draw.text((330, 380), "36,000 点", fill=(0, 0, 0), font=font_bold)
draw.text((510, 380), "2,000 点", fill=(0, 0, 0), font=font_body)
draw.text((720, 380), "0 点", fill=(0, 0, 0), font=font_body)
draw.text((900, 380), "0 点", fill=(0, 0, 0), font=font_body)
draw.text((1060, 380), "0 点", fill=(0, 0, 0), font=font_body)

# 4. 金額欄
draw.rectangle([(60, 470), (1140, 680)], outline=(0, 0, 0), width=2)
draw.line([(60, 520), (1140, 520)], fill=(0, 0, 0), width=1)
draw.line([(60, 600), (1140, 600)], fill=(0, 0, 0), width=1)

draw.line([(400, 470), (400, 680)], fill=(0, 0, 0), width=1)
draw.line([(750, 470), (750, 680)], fill=(0, 0, 0), width=1)

draw.text((140, 485), "保 険 合 計 点 数", fill=(0, 0, 0), font=font_header)
draw.text((470, 485), "医 療 費 総 額 (10割)", fill=(0, 0, 0), font=font_header)
draw.text((840, 485), "請 求 金 額 / 領 収 金 額", fill=(0, 0, 0), font=font_header)

draw.text((120, 545), "40,000 点", fill=(0, 0, 0), font=font_bold)
draw.text((460, 545), "400,000 円", fill=(0, 0, 0), font=font_bold)
draw.text((820, 535), "120,000 円", fill=(180, 0, 0), font=font_title)

draw.text((100, 630), "診療年月: 令和8年9月 (2026-09)", fill=(0, 0, 0), font=font_body)
draw.text((450, 630), "保険適用: 有り (3割負担)", fill=(0, 0, 0), font=font_body)
draw.text((800, 630), "領収印: [済]", fill=(0, 0, 0), font=font_body)

output_filename = "high_cost_receipt_sample.png"
image.save(output_filename)
print(f"領収書画像を生成しました: {output_filename}")