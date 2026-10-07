# Triển khai & vận hành

## Hệ thống đang chạy

| Phần | Nơi chạy | Địa chỉ |
|---|---|---|
| Web (frontend Next.js) | Vercel, project `baocaosanluong` | https://baocaosanluong-bay.vercel.app |
| API (backend FastAPI) | Vercel, project `baocaosanluong-api`, region **Singapore (sin1)** | https://baocaosanluong-api.vercel.app |
| Database (PostgreSQL) | Supabase, project `baocaosanluong`, region **Singapore** | — |

Đã thử tải trên bản thật: 100 người dùng cùng lúc, 0 lỗi, mỗi thao tác thường
~0,12–0,17 giây.

### Giới hạn của gói miễn phí — cần biết

- **Vercel Hobby chỉ cho dùng cá nhân, phi thương mại.** Dùng cho nhà máy là vi phạm
  điều khoản; Vercel có thể khoá tài khoản. Muốn hợp lệ: nâng lên Pro (20 USD/tháng),
  không phải làm lại gì. Nếu bị khoá, dữ liệu vẫn an toàn trên Supabase.
- **Supabase tạm dừng project nếu 7 ngày liền không ai dùng** (ví dụ nghỉ Tết) → web
  báo lỗi. Vào supabase.com → project `baocaosanluong` → **Restore project**.
- **Supabase miễn phí không có sao lưu.** Đã chọn không sao lưu tự động; muốn sao lưu
  tay: `python -m tools.transfer_data export <file.json>` (xem mục Chép dữ liệu).
- Hạn mức Vercel mỗi tháng: 1 triệu lượt gọi, 4 giờ CPU. Supabase: 500 MB, 5 GB truyền
  dữ liệu. 50 người dùng chỉ dùng một phần nhỏ.

## Cập nhật code lên web

Từ máy đã đăng nhập Vercel CLI (`npx vercel login` — chỉ cần làm một lần):

```bash
cd backend
npx vercel deploy --prod      # API
cd ../frontend
npx vercel deploy --prod      # Web
```

Mỗi thư mục đã được liên kết với project Vercel tương ứng (thư mục `.vercel/`, không
đưa lên git). File `.vercelignore` chặn `.env`/`.env.local` của máy dev khỏi bị đẩy lên.

**Nếu bản cập nhật có thay đổi database** (file mới trong `backend/alembic/versions/`):
chạy migration lên Supabase **trước** khi deploy backend:

```bash
cd backend
# DATABASE_URL = chuỗi "Session pooler" (cổng 5432) của Supabase, dạng postgresql+psycopg://...
DATABASE_URL="..." python -m alembic upgrade head
```

Migration mới phải viết bằng lệnh chung của Alembic (`op.add_column`, `op.create_table`…)
để chạy được trên cả SQL Server (máy dev) lẫn PostgreSQL (production).

## Biến môi trường trên Vercel

Đặt bằng `npx vercel env add <TÊN> production` (giá trị đọc từ bàn phím, không lưu vào
git). Sau khi đổi biến phải deploy lại.

**Backend (`baocaosanluong-api`)**

| Biến | Ý nghĩa |
|---|---|
| `DATABASE_URL` | Chuỗi **Transaction pooler** (cổng **6543**) của Supabase, dạng `postgresql+psycopg://postgres.<ref>:<mật khẩu đã percent-encode>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres` |
| `SECRET_KEY` | Khoá ký phiên đăng nhập, chuỗi ngẫu nhiên ≥ 32 ký tự. Đổi khoá = mọi người phải đăng nhập lại |
| `CRON_SECRET` | Mã bí mật Vercel Cron gửi kèm khi gọi `/api/cron/retention` |
| `ENVIRONMENT` | `production` (từ chối chạy với `SECRET_KEY` mẫu, ẩn `/docs`) |
| `CORS_ORIGINS` | Địa chỉ web được phép gọi API, cách nhau dấu phẩy |

Các biến khác dùng mặc định trong `backend/app/config.py`: `REPORT_LOCK_HOUR=24` (sửa được
đến hết ngày), `APP_TIMEZONE=Asia/Ho_Chi_Minh`, `DATA_RETENTION_DAYS=60`.

**Frontend (`baocaosanluong`)**: `NEXT_PUBLIC_API_URL=https://baocaosanluong-api.vercel.app`

## Tác vụ tự động

- **Dọn dữ liệu > 60 ngày**: Vercel Cron gọi `/api/cron/retention` mỗi ngày lúc 19:00 UTC
  (2–3 giờ sáng giờ VN; gói Hobby chạy trong vòng 1 tiếng quanh giờ hẹn). Cấu hình trong
  `backend/vercel.json`.

## Chép dữ liệu giữa các database

Công cụ `backend/tools/transfer_data.py` chép toàn bộ tài khoản, line, báo cáo, lịch sử,
giữ nguyên ID. Dùng `DATABASE_URL` của môi trường đang chạy lệnh.

```bash
cd backend
python -m tools.transfer_data export data-export.json   # đọc từ database hiện tại
python -m tools.transfer_data import data-export.json   # nạp vào database ĐANG TRỐNG
```

`import` từ chối nếu database đã có dữ liệu. Database mới tinh cần tạo bảng trước bằng
`python init_schema.py` (tạo từ models rồi đánh dấu Alembic ở bản mới nhất). File xuất
chứa mã băm mật khẩu — không đưa lên git (đã chặn trong `.gitignore`), xoá sau khi dùng.

## Bảo mật đã có

- Sai mật khẩu 5 lần / 15 phút → khoá tài khoản đó từ IP đó 15 phút (lưu trong database,
  áp dụng chung cho mọi bản backend đang chạy). Một IP sai quá 30 lần / 15 phút → khoá IP.
- Mật khẩu băm bcrypt (cost 10); mã băm cũ tự nâng cấp khi người dùng đăng nhập.
- Supabase: đã tắt **Data API**, database chỉ truy cập được qua chuỗi kết nối.
- Backend chỉ nhận yêu cầu từ địa chỉ web trong `CORS_ORIGINS`.

---

## Phương án dự phòng: tự host bằng Docker

Nếu cần rời Vercel/Supabase (bị khoá, muốn chạy trên máy chủ riêng): repo có sẵn bộ
Docker gồm PostgreSQL + backend + frontend + Caddy (tự cấp HTTPS).

Yêu cầu: 1 máy Ubuntu 24.04 (≥ 2 GB RAM) có IP công khai, mở cổng 80/443, và 1 tên miền
trỏ về IP đó (ví dụ tên miền miễn phí DuckDNS).

```bash
sudo git clone https://github.com/nkd23/daily-production-report.git /opt/duy1
cd /opt/duy1
sudo bash deploy/setup-server.sh ten-mien-cua-ban.duckdns.org
# chép dữ liệu (xuất từ Supabase hoặc máy cũ bằng tools.transfer_data export):
sudo bash deploy/import-data.sh /duong-dan/data-export.json
```

`setup-server.sh` cài Docker, mở tường lửa, tạo `.env` với mật khẩu database và
`SECRET_KEY` ngẫu nhiên, chạy hệ thống và đặt lịch sao lưu 01:30 hằng ngày
(`deploy/backup.sh`, giữ 14 ngày trong `backups/`).

| Việc | Lệnh (trong `/opt/duy1`) |
|---|---|
| Cập nhật code | `sudo git pull && sudo docker compose up -d --build` |
| Xem log | `sudo docker compose logs --tail=100 backend` |
| Sao lưu ngay | `sudo bash deploy/backup.sh` |
| Khôi phục (vào DB trống) | `gunzip -c backups/<file>.sql.gz \| sudo docker compose exec -T db psql -U duy1 -d duy1` |
