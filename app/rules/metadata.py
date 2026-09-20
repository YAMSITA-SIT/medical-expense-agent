"""Evidence metadata: unverified sources are never executable rules."""

CHECKED_ON = "2026-09-20"
SOURCES = [
    {
        "id": "monthly_limits",
        "kind": "official_guidance",
        "name": "全国健康保険協会 高額療養費",
        "url": "https://www.kyoukaikenpo.or.jp/benefit/high_cost_medical_expenses/002/",
        "provision": "70歳未満・所得区分別上限／世帯合算／多数回該当",
        "effective_period": "2018-08..2026-07 / 2026-08..2027-07",
        "verification": "monthly_tables_verified",
        "checked_on": CHECKED_ON,
    },
    {
        "id": "reform",
        "kind": "official_guidance",
        "name": "厚生労働省 高額療養費制度を利用される皆さまへ",
        "url": "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryouhoken/"
        "juuyou/kougakuiryou/index.html",
        "provision": "令和8年8月・令和9年8月の見直し（別期間）",
        "effective_period": "2026-08..2027-07（本PoCの新制度表）",
        "verification": "guidance_verified",
        "checked_on": CHECKED_ON,
    },
    {
        "id": "nhi_order",
        "kind": "law",
        "name": "国民健康保険法施行令",
        "url": "https://laws.e-gov.go.jp/document?lawid=333CO0000000362_20240401_506CO0000000009",
        "provision": "第29条の2・第29条の3（月間支給・算定基準額）",
        "effective_period": "参照版2024-04-01。2026年改正後との条文照合は未完了",
        "verification": "historical_text_only_not_current_legal_certification",
        "checked_on": CHECKED_ON,
    },
    {
        "id": "standard",
        "kind": "standard_specification",
        "name": "国民健康保険システム標準仕様書 第1.7版（令和8年8月）",
        "url": "https://www.mhlw.go.jp/stf/kokuho_std.html",
        "provision": None,
        "effective_period": "版表示2026-08、個別要件の適合日は未照合",
        "verification": "catalog_only_not_used_for_automated_decisions",
        "checked_on": CHECKED_ON,
    },
    {
        "id": "notification",
        "kind": "notification",
        "name": "適用する個別通知は未特定",
        "url": None,
        "provision": None,
        "effective_period": None,
        "verification": "unverified_not_executable",
        "checked_on": CHECKED_ON,
    },
]

WORKFLOW_RULES = {
    "version": "2.0",
    "sources": SOURCES,
    "minimum_unit_payment_yen": 21000,
    "grouping": "person / benefit household / insurer / month / provider / medical-dental / in-out",
    "frequency": "保険者確認済みの対象月を含む12か月内の先行支給月数が3以上",
    "rounding": "端数が生じる場合は職員確認（旧APIの切捨て計算に流さない）",
    "exception_rules": "法定の不支給要件ではなくPoCの保守的な職員確認ルール",
}
