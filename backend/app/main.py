from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import auth, dashboard, export, lines, reports, users

settings = get_settings()

app = FastAPI(title="Daily Production Report API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(lines.router)
app.include_router(reports.router)
app.include_router(dashboard.router)
app.include_router(export.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
