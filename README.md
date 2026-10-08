# Báo Cáo Sản Lượng Hàng Ngày

Web app thay thế quy trình tổ trưởng nhắn Zalo → thư ký nhập tay Excel. Tổ trưởng
nhập trực tiếp, thư ký/sếp xem Dashboard và xuất Excel đúng layout gốc.

- **Backend**: FastAPI (Python 3.11+) + SQLAlchemy + Alembic — production chạy
  **PostgreSQL**, máy dev dùng được **Microsoft SQL Server**
- **Frontend**: Next.js 16 (App Router) + Tailwind CSS + Recharts
- **Auth**: JWT, phân quyền theo role (`to_truong` / `thu_ky` / `sep` / `executive`)

> Production: web + API chạy trên Vercel, database PostgreSQL trên Supabase
> (Singapore). Toàn bộ code dùng SQLAlchemy nên chỉ cần đổi `DATABASE_URL` là chạy
> được trên PostgreSQL hoặc SQL Server. Cách triển khai, cập nhật và vận hành: xem
> [DEPLOY.md](DEPLOY.md).

## Cấu trúc

```
backend/     FastAPI app, Alembic migrations, seed script, tools/ (chép dữ liệu giữa các database)
frontend/    Next.js app
deploy/      Script tự host bằng Docker (phương án dự phòng)
docker-compose.yml   Tự host: PostgreSQL + backend + frontend + Caddy/HTTPS
Caddyfile    Reverse proxy + tự động cấp SSL Let's Encrypt
DEPLOY.md    Hướng dẫn triển khai & vận hành
```
