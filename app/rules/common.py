from dataclasses import dataclass

from app.models import IncomeCategory


@dataclass(frozen=True)
class LimitRule:
    base_yen: int
    threshold_yen: int | None
    frequent_yen: int

    def normal_limit(self, total_medical_cost_yen: int) -> int:
        if self.threshold_yen is None:
            return self.base_yen
        excess = max(0, total_medical_cost_yen - self.threshold_yen)
        return self.base_yen + excess // 100

    @property
    def formula(self) -> str:
        if self.threshold_yen is None:
            return f"{self.base_yen:,}円"
        return f"{self.base_yen:,}円 + (総医療費 - {self.threshold_yen:,}円) × 1%"


PolicyTable = dict[IncomeCategory, LimitRule]
