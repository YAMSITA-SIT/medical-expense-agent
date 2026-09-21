from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.benefits.api import router as benefits_router
from app.workflow.api import router as workflow_router


app = FastAPI(
    title="Medical Expense Support Agent API",
    version="2.0.0",
    description="領収書画像解析および医療費支援制度判定API",
)


# 開発環境のフロントエンドからAPIを呼び出せるようにする設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# benefits/api.py 側に /v3/benefits が定義されているため、
# 実際のURLは /v1/v3/benefits/... になります。
app.include_router(benefits_router, prefix="/v1")


# workflow/api.py 側ですでに /v2 が定義されています。
# ここで prefix="/v2" を付けると /v2/v2/... になるため付けません。
app.include_router(workflow_router)


@app.get("/")
def read_root() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "medical-expense-agent",
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
    }