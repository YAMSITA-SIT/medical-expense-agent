from typing import Any


def mask_sensitive(value: Any) -> Any:
    """Return a copy; never log request/response bodies or exception input values."""
    sensitive = {
        "name",
        "birth_date",
        "address",
        "insurance_number",
        "account_number",
        "insurer_number",
        "symbol",
        "number",
        "raw_text",
    }
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            if key in sensitive:
                if isinstance(item, dict) and "value" in item:
                    result[key] = {**item, "value": "***" if item["value"] else None}
                else:
                    result[key] = "***" if item is not None else None
            else:
                result[key] = mask_sensitive(item)
        return result
    if isinstance(value, list):
        return [mask_sensitive(item) for item in value]
    return value
