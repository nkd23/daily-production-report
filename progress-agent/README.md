# DayTienDo - đẩy bảng tiến độ lên web

Chạy trên một máy văn phòng luôn bật lúc 9:00, máy này đồng bộ thư mục
SharePoint "Bảng tiến độ mới" về bằng OneDrive. Mỗi sáng chương trình:

1. đọc sheet `bảng tiến độ` của mọi file `.xlsx/.xlsm` trong thư mục
   (cột được nhận theo tên, không theo vị trí),
2. giữ các dòng có `Pack - cut` khác 0, hoặc đã có `Cut qty` mà chưa có `Sew qty`,
3. tra `Product Category` (cột WF) và `Cust. Style No` theo JO trong file
   `THV PRODUCTION PLAN *.xlsm` mới nhất,
4. gửi lên `POST /api/progress/ingest` kèm header `X-Progress-Key`.

Chạy với `--close-order` (15:00 thứ 5, lịch `DayTienDo-CloseOrder`): gửi End
sew/End pack, số lượng và Product Category của mọi màu thuộc các JO có End
sew trong 120 ngày gần nhất lên `POST /api/close-order/ingest`; web chốt
danh sách Close order của tuần trước (xem `backend/app/services/close_order.py`).

Mọi quy tắc hiển thị (chuẩn hóa tên line, Executive, cột late) nằm ở `backend/app/services/progress.py`, nên sửa quy tắc
không cần cài lại chương trình.

## Build

```bat
build_exe.bat
```

Ra `dist\DayTienDo.exe` (1 file, không mở cửa sổ). Đóng gói cùng
`config.ini` (mẫu: `config.example.ini`), `CaiLich.bat`,
`cai_lich.ps1`, `ChayNgay.bat`, `ChayCloseOrder.bat`.

`config.ini` chứa khóa `PROGRESS_INGEST_KEY` của web - không commit.

## Chạy thử không gửi

```bat
DayTienDo.exe --thu
```

Ghi kết quả đọc được ra `thu_nghiem.json` cạnh file .exe.
