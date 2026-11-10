# DayTienDo - đẩy bảng tiến độ lên web

Chạy trên một máy văn phòng luôn bật lúc 9:30, máy này đồng bộ thư mục
SharePoint "Bảng tiến độ mới" về bằng OneDrive. Mỗi sáng chương trình:

1. đọc sheet `bảng tiến độ` của mọi file `.xlsx/.xlsm` trong thư mục
   (cột được nhận theo tên, không theo vị trí),
2. giữ các dòng có `Pack - cut` khác 0,
3. tra `Product Category` (cột WF) và `Cust. Style No` theo JO trong file
   `THV PRODUCTION PLAN *.xlsm` mới nhất,
4. gửi lên `POST /api/progress/ingest` kèm header `X-Progress-Key`.

Mọi quy tắc hiển thị (chuẩn hóa tên line, Executive, cột late, ẩn đơn quá
Shipment plan) nằm ở `backend/app/services/progress.py`, nên sửa quy tắc
không cần cài lại chương trình.

## Build

```bat
build_exe.bat
```

Ra `dist\DayTienDo.exe` (1 file, không mở cửa sổ). Đóng gói cùng
`config.ini` (mẫu: `config.example.ini`), `CaiLich.bat`,
`cai_lich_9h30.ps1`, `ChayNgay.bat`.

`config.ini` chứa khóa `PROGRESS_INGEST_KEY` của web - không commit.

## Chạy thử không gửi

```bat
DayTienDo.exe --thu
```

Ghi kết quả đọc được ra `thu_nghiem.json` cạnh file .exe.
