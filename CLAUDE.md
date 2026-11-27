# Báo Cáo Sản Lượng – hướng dẫn cho AI / người mới

Web nội bộ của xưởng may: Tổ trưởng nhập sản lượng hằng ngày, Thư ký/Manager/
Executive xem Dashboard, xuất Excel; theo dõi tiến độ đơn hàng (Tiến độ), báo cáo
Close order hằng tuần, và bot Zalo nhắn vào nhóm chat của xưởng.

Người dùng chính nói **tiếng Việt** – trả lời bằng tiếng Việt. Chữ trên giao diện
viết tiếng Việt; comment/docstring trong code viết tiếng Anh.

## Hệ thống đang chạy

| Phần | Nơi chạy | Địa chỉ |
|---|---|---|
| Web (Next.js) | Vercel project `baocaosanluong` | https://baocaosanluong-bay.vercel.app |
| API (FastAPI) | Vercel project `baocaosanluong-api`, region sin1 | https://baocaosanluong-api.vercel.app |
| Database | Supabase PostgreSQL (Singapore) | – |
| Đẩy dữ liệu tiến độ | Một máy văn phòng (Windows) chạy `progress-agent` theo lịch | – |
| Bot Zalo | Zalo Bot Platform, webhook `/api/zalo/webhook` | – |

Cách deploy, biến môi trường, chuyển sang máy khác: **[DEPLOY.md](DEPLOY.md)**.
Agent máy văn phòng: **[progress-agent/README.md](progress-agent/README.md)**.

## Cấu trúc code

```
backend/app/
  models.py          bảng SQLAlchemy (đọc docstring từng class)
  config.py          mọi biến môi trường
  deps.py            đăng nhập, phân quyền theo role, giờ VN (local_now/local_today)
  routers/           API: auth, users, lines, reports, dashboard, export, targets,
                     progress (Tiến độ), close_order, zalo
  services/          nghiệp vụ: aggregation (dashboard), weekly, line_parts (39A/39B),
                     progress, close_order, zalo_alerts / zalo_bot / zalo_client,
                     excel_export, progress_excel, retention
backend/alembic/versions/   migration (phải chạy được trên cả SQL Server lẫn PostgreSQL)
backend/tools/              chép dữ liệu giữa database, import báo cáo Close order cũ
frontend/src/app/           các trang: to-truong, thu-ky, dashboard, bao-cao-tuan,
                            target, tien-do (+ tien-do/close-order), du-lieu-san-xuat
frontend/src/components/    LineEntryCard (form nhập), Navbar, EffDashboard, ...
frontend/src/lib/           api.ts (gọi API), types.ts, auth-context
progress-agent/             push_progress.py + .bat/.ps1 cài lịch trên máy văn phòng
```

Frontend là **Next.js 16** – khác bản cũ; đọc `frontend/AGENTS.md` và
`frontend/node_modules/next/dist/docs/` trước khi viết code Next.

## Vai trò (UserRole)

| role | Tên hiển thị | Làm gì |
|---|---|---|
| `to_truong` | Tổ trưởng | Nhập báo cáo ngày cho line của mình |
| `thu_ky` | Thư ký | Theo dõi, khoá/mở báo cáo, cấu hình line |
| `sep` | Manager | Xem tất cả; sửa số Tiến độ; điền WF/remark/bộ phận Close order; quản lý ngày lễ |
| `executive` | Executive | Chỉ xem các line có `Line.executive_name` = tên mình |
| `finishing` | Finishing | Xem dashboard; toàn quyền sửa Close order (Late, End Sew/Pack, Pack-Cut, xoá đơn), thấy bản nháp thứ 5 |

## Quy tắc nghiệp vụ đã chốt (đừng tự đổi – hỏi người dùng trước)

**Báo cáo ngày**: mỗi line mỗi ngày một báo cáo `part="AB"`; line tách ca thì nhập
riêng `A` và/hoặc `B` (không trộn AB với A/B trong cùng ngày). Dashboard hiện 39A/39B
thành 2 dòng; báo cáo tuần cộng lại thành 39AB.

**Tiến độ** (`services/progress.py`): dữ liệu từ các file "bảng tiến độ" (mỗi file
một người phụ trách, tên người lấy từ tên file). Hiện đơn khi chưa End pack và
Pack-cut ≠ 0, hoặc đã có Cut mà chưa có Sew. Có "Đóng đơn" tay, remark EX/FIN, sửa số
(Manager/Finishing), sửa Late (Finishing).

**Close order** (`services/close_order.py`, docstring đầu file là chuẩn):
- Gom theo (Line, JO); số lượng cộng các màu; chỉ tính khi **mọi màu** có End Sew.
- Đơn thuộc **tuần (thứ 2–thứ 7) chứa End Sew của màu cuối**.
- Late duration = ngày làm việc (thứ 2–7, trừ ngày lễ) từ End Sew → End Pack (hoặc
  hôm nay) − 1. > 3 là late; = 3 chỉ ontime với WF & TAP (Product Category `WWF_T`).
- Đơn chưa End pack của tối đa 8 tuần trước được đưa lại vào tuần hiện tại ("tồn").
- 9:00 thứ 5 tạo **bản nháp** (chỉ Finishing thấy), 15:00 **công bố** cho mọi người;
  giữ 6 tuần gần nhất.
- Phần Finishing sửa tay và đơn đã xoá **ẩn với người khác** (họ chỉ thấy giá trị đã
  sửa, không thấy giá trị gốc, không tô màu). Ô "chưa End pack" ghi đúng chữ
  "Chưa End pack".

**Bot Zalo** (`services/zalo_*.py`): chỉ dùng trong **một nhóm** đã đăng ký bằng
`@bot dangky <ZALO_GROUP_CODE>`. Tự nhắn: cảnh báo đơn sắp late sau lượt Tiến độ 9:00
(gọi tên chủ file bảng tiến độ: "Hương ơi, ..."), bản nháp Close order thứ 5, lỗi dữ
liệu/máy văn phòng không chạy. Trả lời khi được tag: mã JO, `line 28`, `sắp late`,
`late`, `tuần`, `tem`, `tem <JO>`, `hd`. Nhóm thấy dữ liệu như Manager. Không có lệnh sửa qua Zalo.

**Đặt tem** (`services/labels.py`, `routers/labels.py`): công cụ "Sổ theo dõi đặt tem" trên
máy Duy (ngoài repo, `DuAn_CongCu_Duy\DatTemCT`) đẩy `POST /api/labels/ingest` (header
`X-Label-Key` = `LABEL_INGEST_KEY`) mỗi sáng / khi có plan mới / sau khi tự đặt SRN in tem.
Dữ liệu mới nhất lưu JSON trong `zalo_state` (`labels:*`), không có bảng riêng, không cần
migration. Đơn vị = JO + màu + line; hạn đặt = Start sew − 5. Bot nhắn 1 lần/ngày làm việc
danh sách cần đặt theo người, và báo mỗi lần công cụ tự đặt SRN.
`POST /api/labels/cartons` (cùng khoá X-Label-Key): n8n đẩy tem thùng CT (SRN CTN) từ pre-PKL mới trong
thư mục `PrePKL CT - NEW` - `can_dat` / `da_dat` / `can_xem` -> bot đăng 1 tin; lưu `labels:cartons`.

## Lịch tự động

| Giờ (VN) | Ở đâu | Việc |
|---|---|---|
| 9:00 hằng ngày | Máy văn phòng, lịch `DayTienDo` | Đẩy Tiến độ → bot cảnh báo sắp late |
| 9:00 thứ 5 | `DayTienDo-CloseOrderNhap` | Bản nháp Close order → bot gửi checklist |
| 15:00 thứ 5 | `DayTienDo-CloseOrder` | Công bố Close order |
| ~10:00 thứ 2–7 | Vercel Cron | Bot báo nếu sáng nay chưa có dữ liệu Tiến độ |
| ~14:00 thứ 5 | Vercel Cron | Bot nhắc bản nháp còn thiếu |
| ~16:00 thứ 5 | Vercel Cron | Bot báo nếu chưa công bố |
| ~2:00 hằng ngày | Vercel Cron | Xoá báo cáo > 60 ngày |

Vercel Hobby chạy cron trong vòng 1 tiếng quanh giờ hẹn (`backend/vercel.json`, giờ UTC).

## Chạy trên máy dev

- Máy dev dùng **SQL Server** (`backend/.env`), production dùng PostgreSQL – code chỉ
  dùng SQLAlchemy/Alembic chung nên chạy được cả hai.
- `.claude/launch.json` có cấu hình `backend` (uvicorn :8000) và `frontend` (next dev :3000).
- Sau khi sửa backend phải khởi động lại server backend.
- Thử đăng nhập local: tạo token bằng `app.security.create_access_token(str(user.id))`
  rồi đặt vào `localStorage["duy1_token"]`.

## Quy tắc bắt buộc

- **Repo là public.** Không bao giờ commit mật khẩu, token, chuỗi kết nối, file dữ
  liệu thật (`.gitignore` đã chặn `backup_*.csv`, `*.xlsx`, `progress-agent/config.ini`,
  `Claude outputs/`...). Kiểm tra `git diff --cached` trước khi commit.
- Bí mật nằm ngoài repo, ở `%USERPROFILE%\.duy1-deploy\` (Supabase, Zalo, ...) và
  `progress-agent/config.ini` (khóa ingest) – không in nội dung ra màn hình/chat.
- Không chạy backend local nối vào Supabase; dữ liệu thử chỉ tạo ở database local và
  xoá sau khi thử.
- Chỉ commit / push / deploy khi người dùng bảo (thường là "deploy đi"). Thứ tự:
  migration lên Supabase (nếu có) → deploy backend → deploy frontend → commit + push.
- **Dự án được sửa từ nhiều máy.** Trước khi deploy luôn `git fetch` + `git pull --rebase`
  (commit phần của mình trước): `vercel deploy` đẩy đúng thư mục trên máy đang chạy, nên
  deploy từ code cũ sẽ xoá mất chức năng máy kia đã đưa lên.
- Công thức nghiệp vụ chưa rõ thì hỏi, không đoán.
- Windows: file có thể là CRLF; viết script sửa file bằng Python và chuẩn hoá xuống dòng.
- Lỗi lint `react-hooks/set-state-in-effect` ở vài file cũ là đã biết, không cần sửa.
