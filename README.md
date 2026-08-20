# Báo Cáo Sản Lượng Hàng Ngày

Web app thay thế quy trình tổ trưởng nhắn Zalo → thư ký nhập tay Excel. Tổ trưởng
nhập trực tiếp, thư ký/sếp xem Dashboard và xuất Excel đúng layout gốc.

- **Backend**: FastAPI (Python 3.11) + SQLAlchemy + Alembic, **Microsoft SQL Server**
- **Frontend**: Next.js 16 (App Router) + Tailwind CSS + Recharts
- **Auth**: JWT, phân quyền theo role (`to_truong` / `thu_ky` / `sep`)

> production (Docker) dùng SQL Server 2022 Express (miễn phí bản quyền) qua SA
> login. Toàn bộ code dùng SQLAlchemy nên nếu sau này cần đổi lại MySQL/Postgres,
> chỉ cần đổi `DATABASE_URL` + driver, model layer không phải viết lại.

## Cấu trúc

```
backend/     FastAPI app, Alembic migrations, seed script
frontend/    Next.js app
docker-compose.yml   Triển khai production (SQL Server + backend + frontend + Caddy/HTTPS)
Caddyfile    Reverse proxy + tự động cấp SSL Let's Encrypt
```

