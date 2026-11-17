﻿# Tạo 2 lịch chạy trong Task Scheduler:
#   DayTienDo             9:00 mỗi sáng         -> tab Tiến độ
#   DayTienDo-CloseOrder  15:00 thứ 5 hằng tuần -> tab Close order (chốt tuần trước)
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

$weekly = New-ScheduledTaskAction -Execute $exe -Argument "--close-order" -WorkingDirectory $PSScriptRoot
Register-ScheduledTask -TaskName "DayTienDo-CloseOrder" -Action $weekly -Settings $settings `
    -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Thursday -At "15:00") `
    -Description "Gửi số Close order lên web lúc 15:00 thứ 5 hằng tuần (chốt tuần trước)" -Force | Out-Null

Write-Host "Đã tạo lịch 'DayTienDo' (9:00 hằng ngày) và 'DayTienDo-CloseOrder' (15:00 thứ 5): $exe"
