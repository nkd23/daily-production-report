# Tạo lịch chạy DayTienDo.exe lúc 9:30 mỗi sáng bằng Task Scheduler.
# Chạy bằng tài khoản Windows đang đăng nhập (tài khoản có OneDrive đồng bộ
# thư mục bảng tiến độ). Nếu 9:30 máy đang tắt, Windows tự chạy bù ngay khi
# máy bật lại. Chạy lại script này bất cứ lúc nào để cập nhật lịch.

$ErrorActionPreference = "Stop"
$exe = Join-Path $PSScriptRoot "DayTienDo.exe"
if (-not (Test-Path $exe)) { throw "Không thấy $exe - để script này cạnh DayTienDo.exe" }
if (-not (Test-Path (Join-Path $PSScriptRoot "config.ini"))) { throw "Chưa có config.ini cạnh DayTienDo.exe" }

$action = New-ScheduledTaskAction -Execute $exe -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -Daily -At "09:30"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName "DayTienDo" -Action $action -Trigger $trigger -Settings $settings `
    -Description "Gửi bảng tiến độ đơn hàng lên web Báo Cáo Sản Lượng lúc 9:30 mỗi sáng" -Force | Out-Null

Write-Host "Đã tạo lịch 'DayTienDo' chạy 9:30 hằng ngày: $exe"
