﻿# Tạo 2 lịch chạy trong Task Scheduler:
#   DayTienDo             9:00 mỗi sáng         -> tab Tiến độ
#   DayTienDo-CloseOrderNhap  9:00 thứ 5     -> Close order bản nháp, chỉ Finishing xem
#   DayTienDo-CloseOrder  15:00 thứ 5 hằng tuần -> Close order công bố cho mọi người
# Chạy bằng tài khoản Windows đang đăng nhập (tài khoản có OneDrive đồng bộ
# thư mục bảng tiến độ). Nếu tới giờ mà máy đang tắt, Windows tự chạy bù ngay
# khi máy bật lại. Chạy lại script này bất cứ lúc nào để cập nhật lịch.

$ErrorActionPreference = "Stop"
$exe = Join-Path $PSScriptRoot "DayTienDo.exe"
if (-not (Test-Path $exe)) { throw "Không thấy $exe - để script này cạnh DayTienDo.exe" }
if (-not (Test-Path (Join-Path $PSScriptRoot "config.ini"))) { throw "Chưa có config.ini cạnh DayTienDo.exe" }

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew

$daily = New-ScheduledTaskAction -Execute $exe -WorkingDirectory $PSScriptRoot
Register-ScheduledTask -TaskName "DayTienDo" -Action $daily -Settings $settings `
    -Trigger (New-ScheduledTaskTrigger -Daily -At "09:00") `
    -Description "Gửi bảng tiến độ đơn hàng lên web Báo Cáo Sản Lượng lúc 9:00 mỗi sáng" -Force | Out-Null

$draft = New-ScheduledTaskAction -Execute $exe -Argument "--close-order --nhap" -WorkingDirectory $PSScriptRoot
Register-ScheduledTask -TaskName "DayTienDo-CloseOrderNhap" -Action $draft -Settings $settings `
    -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Thursday -At "09:00") `
    -Description "Close order bản nháp lúc 9:00 thứ 5 - chỉ Finishing xem, để hỏi lý do late" -Force | Out-Null

$weekly = New-ScheduledTaskAction -Execute $exe -Argument "--close-order" -WorkingDirectory $PSScriptRoot
Register-ScheduledTask -TaskName "DayTienDo-CloseOrder" -Action $weekly -Settings $settings `
    -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Thursday -At "15:00") `
    -Description "Công bố Close order tuần trước cho mọi người lúc 15:00 thứ 5" -Force | Out-Null

Write-Host "Đã tạo lịch: 'DayTienDo' (9:00 hằng ngày), 'DayTienDo-CloseOrderNhap' (9:00 thứ 5, bản nháp Finishing), 'DayTienDo-CloseOrder' (15:00 thứ 5, công bố): $exe"
