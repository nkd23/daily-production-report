# Báo Cáo Sản Lượng Hàng Ngày

Web app thay thế quy trình tổ trưởng nhắn Zalo → thư ký nhập tay Excel. Tổ trưởng
nhập trực tiếp, thư ký/sếp xem Dashboard và xuất Excel đúng layout gốc.

- **Backend**: FastAPI (Python 3.11) + SQLAlchemy + Alembic, **Microsoft SQL Server**
- **Frontend**: Next.js 16 (App Router) + Tailwind CSS + Recharts
- **Auth**: JWT, phân quyền theo role (`to_truong` / `thu_ky` / `sep`)

> Đề bài gốc yêu cầu MySQL 8.0, nhưng dự án được đổi sang SQL Server vì máy dev
> đã có sẵn SQL Server 2022 cài trước đó. Local dev dùng Windows Authentication;
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

## Chạy local (development)

### 1. SQL Server

Dùng SQL Server có sẵn trên máy (Windows Authentication, không cần tạo user riêng),
hoặc cài SQL Server Express nếu chưa có. Tạo database:

```sql
CREATE DATABASE duy1_production;
```

### 2. Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate   # Windows; source .venv/bin/activate trên Linux/Mac
pip install -r requirements.txt
cp .env.example .env     # sửa DATABASE_URL nếu cần
alembic upgrade head
python seed.py           # tạo tài khoản + line mẫu để test
uvicorn app.main:app --reload
```

Backend chạy tại `http://localhost:8000`, xem docs tại `/docs`.

Tài khoản demo sau khi seed:

| Username | Password | Vai trò |
|---|---|---|
| sep | sep123 | Sếp |
| thuky | thuky123 | Thư ký |
| totruong1 | tt123 | Tổ trưởng (Line 1, 2) |
| totruong2 | tt123 | Tổ trưởng (Line 3, 4) |
| totruong3 | tt123 | Tổ trưởng (Line 5) |

**Đổi mật khẩu các tài khoản demo trước khi dùng thật.**

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```

Mở `http://localhost:3000`.

## Triển khai lên Hostinger VPS (Docker)

Yêu cầu: Hostinger **VPS** (không phải shared hosting — shared hosting không chạy
được Python/Node liên tục), đã cài Docker + Docker Compose, và một domain đã trỏ
bản ghi A về IP của VPS.

```bash
# 1. SSH vào VPS, clone repo
git clone <repo-url> duy1 && cd duy1

# 2. Tạo file .env từ mẫu, điền domain + mật khẩu thật
cp .env.example .env
nano .env

# 3. Build & chạy toàn bộ (SQL Server + backend + frontend + Caddy/HTTPS)
docker compose up -d --build

# 4. Tạo tài khoản/line mẫu ban đầu (chỉ chạy 1 lần)
docker compose exec backend python seed.py
```

Caddy tự động lấy chứng chỉ HTTPS Let's Encrypt cho domain trong `.env` (`DOMAIN=...`)
— chỉ cần cổng 80/443 của VPS mở và domain đã trỏ đúng IP. Sau vài giây, truy cập
`https://<domain-của-bạn>` là dùng được.

Container `db` chạy **SQL Server 2022 Express** (`MSSQL_PID=Express`, miễn phí,
đủ cho quy mô 1 nhà máy) và khởi tạo database qua `backend/init_db.py` trước khi
chạy migration — không cần bước tạo database thủ công.

### Cập nhật khi có code mới

```bash
git pull
docker compose up -d --build
```

### Backup dữ liệu SQL Server

```bash
docker compose exec db /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$DB_SA_PASSWORD" -C \
  -Q "BACKUP DATABASE duy1_production TO DISK = N'/var/opt/mssql/backup_$(date +%F).bak'"
docker compose cp db:/var/opt/mssql/backup_$(date +%F).bak ./backup_$(date +%F).bak
```

## Cấu hình đáng chú ý

- **Giờ khoá báo cáo**: biến `REPORT_LOCK_HOUR` (mặc định 21 = 21h). Sau giờ này,
  tổ trưởng không sửa được dữ liệu ngày hiện tại — chỉ Thư ký/Sếp mở khoá được.
- **Ngưỡng tô màu cảnh báo hiệu suất trong Excel**: `EFF_WARNING_THRESHOLD` (0.75)
  và `EFF_CRITICAL_THRESHOLD` (0.60) trong [backend/app/services/excel_export.py](backend/app/services/excel_export.py).
  Đây là số **chưa được xác nhận chính thức** — cần hỏi lại IE/PPC rồi chỉnh 2
  hằng số này.
- **EFF-SEW / EFF-FIN** là số tổ trưởng tự nhập tay, hệ thống **không** tự tính từ
  OUT/Target (theo yêu cầu, vì công thức gốc chưa xác định được).
