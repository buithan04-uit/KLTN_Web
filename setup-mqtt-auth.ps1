# ────────────────────────────────────────────────────────────────────────────
# setup-mqtt-auth.ps1
# Thiết lập username/password cho Mosquitto MQTT Broker
#
# Chạy một lần sau khi `docker compose up -d`:
#   .\setup-mqtt-auth.ps1
#
# Tùy chọn đặt password riêng:
#   .\setup-mqtt-auth.ps1 -ServerPassword "my_server_pw" -DevicePassword "my_device_pw"
# ────────────────────────────────────────────────────────────────────────────
param (
    [string]$ServerPassword = "Srv9mK2pL7qR4tWx!",
    [string]$DevicePassword = "Dev3nX8yF5hJ1cBz@"
)

$CONTAINER = "telehealth_mqtt"
$PASSWD_FILE = "/mosquitto/config/passwd"

Write-Host ""
Write-Host "🔐 Thiết lập MQTT Authentication" -ForegroundColor Cyan
Write-Host "─────────────────────────────────────────────" -ForegroundColor DarkGray

# ── 1. Kiểm tra container đang chạy ─────────────────────────────────────────
$running = docker ps --filter "name=$CONTAINER" --filter "status=running" --format "{{.Names}}"
if (-not $running) {
    Write-Host "❌  Container '$CONTAINER' chưa chạy." -ForegroundColor Red
    Write-Host "    Chạy trước: docker compose up -d mosquitto" -ForegroundColor Yellow
    exit 1
}

# ── 2. Tạo/reset file passwd (xoá entries cũ nếu có) ────────────────────────
Write-Host "📝 Tạo user 'server'  (backend Node.js)..."
docker exec $CONTAINER mosquitto_passwd -b $PASSWD_FILE server $ServerPassword
if ($LASTEXITCODE -ne 0) { Write-Host "❌ Lỗi tạo user 'server'" -ForegroundColor Red; exit 1 }

Write-Host "📝 Tạo user 'device'  (ESP32 / thiết bị đo)..."
docker exec $CONTAINER mosquitto_passwd -b $PASSWD_FILE device $DevicePassword
if ($LASTEXITCODE -ne 0) { Write-Host "❌ Lỗi tạo user 'device'" -ForegroundColor Red; exit 1 }

# ── 3. Reload Mosquitto để áp dụng cấu hình mới ─────────────────────────────
Write-Host "🔄 Restart Mosquitto..."
docker restart $CONTAINER | Out-Null
Start-Sleep -Seconds 3

$ok = docker ps --filter "name=$CONTAINER" --filter "status=running" --format "{{.Names}}"
if (-not $ok) {
    Write-Host "❌ Mosquitto không khởi động được." -ForegroundColor Red
    Write-Host "   Xem log: docker logs $CONTAINER" -ForegroundColor Yellow
    exit 1
}

# ── 4. In hướng dẫn cập nhật cấu hình ──────────────────────────────────────
Write-Host ""
Write-Host "✅  MQTT Broker đã bật xác thực thành công!" -ForegroundColor Green
Write-Host ""
Write-Host "── Thêm vào  backend/.env ────────────────────────────────────" -ForegroundColor Yellow
Write-Host "   MQTT_USERNAME=server"
Write-Host "   MQTT_PASSWORD=$ServerPassword"
Write-Host ""
Write-Host "── Nạp vào firmware ESP32 ────────────────────────────────────" -ForegroundColor Yellow
Write-Host "   MQTT_USER : device"
Write-Host "   MQTT_PASS : $DevicePassword"
Write-Host "   MQTT_TOPIC: vitals/{DEVICE_ID}/data"
Write-Host ""
Write-Host "── Kiểm tra kết nối (cần mosquitto-clients) ──────────────────" -ForegroundColor DarkGray
Write-Host "   mosquitto_pub -h localhost -p 1883 -u device -P `"$DevicePassword`" \"
Write-Host "     -t vitals/ESP32_TEST/data -m '{`"hr`":75,`"spo2`":98,`"temp`":36.7}'"
