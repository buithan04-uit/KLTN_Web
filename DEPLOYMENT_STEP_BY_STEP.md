# 📘 HƯỚNG DẪN TRIỂN KHAI CHI TIẾT - Ubuntu 24.04 (Không Domain)

**Ngày:** 15/05/2026
**Server:** 64.176.80.227
**Status:** Bước-theo-bước, copy-paste được

---

## 📋 MỤC LỤC

1. [Chuẩn Bị](#chuẩn-bị)
2. [Bước 1: SSH vào Server](#bước-1-ssh-vào-server)
3. [Bước 2: Chuẩn Bị Thư Mục](#bước-2-chuẩn-bị-thư-mục)
4. [Bước 3: Tạo File Cấu Hình](#bước-3-tạo-file-cấu-hình)
5. [Bước 4: Cài Docker](#bước-4-cài-docker)
6. [Bước 5: Khởi Động Ứng Dụng](#bước-5-khởi-động-ứng-dụng)
7. [Bước 6: Kiểm Tra](#bước-6-kiểm-tra)
8. [Cập Nhật Domain (Nếu Có Sau)](#cập-nhật-domain-nếu-có-sau)
9. [Lệnh Hữu Dụng](#lệnh-hữu-dụng)
10. [Troubleshooting](#troubleshooting)

---

## 🔍 CHUẨN BỊ

### Các Thứ Cần Có:

- ✅ **SSH Client** (Terminal, PowerShell, PuTTY)
- ✅ **Server IP:** 64.176.80.227
- ✅ **Password:** Th06092k4@
- ✅ **Git Repository URL** (của dự án)
- ✅ **Dung lượng:** 20GB trống trên server
- ✅ **Internet:** Ổn định

### Kiểm Tra Kết Nối SSH (Tùy Chọn):

```bash
# Từ máy local, chạy:
ping 64.176.80.227
# Nếu thấy phản hồi, server online ✅
```

---

## 🚀 BƯỚC 1: SSH VÀO SERVER

### Mục Đích:

Kết nối remote vào Ubuntu server để chạy các lệnh triển khai.

### Chi Tiết:

#### 📍 Trên Windows (PowerShell hoặc Command Prompt):

```bash
ssh root@64.176.80.227
```

#### 📍 Trên Mac/Linux (Terminal):

```bash
ssh root@64.176.80.227
```

### Nhập Password:

```
Password: Th06092k4@
```

### Kết Quả Thành Công:

```
root@64.176.80.227:~#
```

⚠️ **Chú ý:** Dòng kết thúc bằng `#` = bạn đã login thành công!

### ❌ Nếu Lỗi:

```
ssh: connect to host 64.176.80.227 port 22 (tcp) failed: Connection refused
```

**Nguyên nhân:** Server offline hoặc firewall chặn
**Cách sửa:** Kiểm tra IP server hoặc chờ server khởi động lại

---

## 📁 BƯỚC 2: CHUẨN BỊ THƯ MỤC

### Mục Đích:

Tạo thư mục `/home/kltn` để chứa dự án.

### Lệnh:

```bash
# 1. Cập nhật hệ thống
apt update && apt upgrade -y

# 2. Tạo thư mục dự án
mkdir -p /home/kltn

# 3. Vào thư mục
cd /home/kltn
```

### Giải Thích:

- `apt update` = Cập nhật danh sách package
- `apt upgrade -y` = Nâng cấp package (tự động chấp nhận: `-y`)
- `mkdir -p /home/kltn` = Tạo thư mục (nếu đã có thì skip)
- `cd /home/kltn` = Vào thư mục vừa tạo

### Kết Quả:

```
root@64.176.80.227:/home/kltn#
```

✅ Nếu thấy đường dẫn là `/home/kltn` = thành công!

---

## 📥 BƯỚC 3: CLONE DỰ ÁN

### Mục Đích:

Tải code dự án từ Git về server.

### Lệnh:

```bash
# Thay <YOUR_REPO_URL> bằng URL của repository bạn
# Ví dụ: https://github.com/username/project.git
git clone <YOUR_REPO_URL> .
```

### Ví Dụ Thực Tế:

```bash
git clone https://github.com/myname/telehealth-app.git .
```

### Giải Thích:

- `git clone` = Tải code từ Git
- `<YOUR_REPO_URL>` = URL repository (có .git ở cuối)
- `.` = Tải vào thư mục hiện tại (`/home/kltn`)

### Kết Quả:

```
Cloning into '.'...
remote: Enumerating objects: 150, done.
remote: Counting objects: 100% (150/150), done.
...
Receiving objects: 100% (150/150), 2.50 MiB | 1.25 MiB/s, done.
Resolving deltas: 100% (50/50), done.
```

### ❌ Nếu Lỗi:

```
fatal: repository not found
```

**Nguyên nhân:** URL repository sai
**Cách sửa:** Kiểm tra lại URL, chắc chắn repository là public hoặc bạn có quyền truy cập

---

## ⚙️ BƯỚC 4: TẠO FILE CẤU HÌNH (.env.production)

### Mục Đích:

Tạo file chứa các biến môi trường (database password, API keys, etc.)

### Lệnh:

```bash
#cd toi thu muc du an vua clone
cd /home/kltn/KTLN_Web

# Tạo file .env.production
cat > .env.production << 'EOF'
# Database Configuration
DB_USER=admin
DB_PASSWORD=$(openssl rand -base64 32)
DB_NAME=telehealth_system
DB_PORT=5432

# Backend Configuration
BACKEND_PORT=5000
BACKEND_URL=http://64.176.80.227:5000
FRONTEND_URL=http://64.176.80.227:3001
NODE_ENV=production

# Frontend Configuration
NEXT_PUBLIC_API_URL=http://64.176.80.227:5000

# MQTT Configuration
MQTT_BROKER=mqtt://mosquitto:1883
MQTT_PORT=1883
MQTT_USERNAME=mqtt_user
MQTT_PASSWORD=$(openssl rand -base64 16)

# Security
JWT_SECRET=$(openssl rand -base64 32)
JWT_EXPIRY=7d
EOF
```

### Giải Thích:

- `cat > .env.production` = Tạo file mới
- `<< 'EOF'` = Bắt đầu input, kết thúc bằng `EOF`
- `$(openssl rand -base64 32)` = Tạo password ngẫu nhiên an toàn
- `DB_USER`, `DB_PASSWORD`, etc. = Các biến cấu hình

### Kết Quả:

```
root@64.176.80.227:/home/kltn#
```

✅ File đã được tạo (không có thông báo = thành công)

### Kiểm Tra:

```bash
# Xem nội dung file vừa tạo
cat .env.production
```

Kết quả sẽ hiển thị:

```
DB_USER=admin
DB_PASSWORD=xyz123...
DB_NAME=telehealth_system
...
```

---

## 🐳 BƯỚC 5: CÀI ĐẶT DOCKER

### Mục Đích:

Cài Docker (container engine) để chạy ứng dụng.

### Lệnh:

```bash
# Cài Docker từ script chính thức
curl -fsSL https://get.docker.com | sh

# Enable Docker khởi động tự động
systemctl enable docker

# Khởi động Docker ngay
systemctl start docker

# Kiểm tra cài đặt
docker --version
docker-compose --version
```

### Giải Thích:

- `curl -fsSL https://get.docker.com | sh` = Tải script cài đặt Docker từ docker.com rồi chạy
- `systemctl enable docker` = Cho Docker khởi động cùng hệ thống
- `systemctl start docker` = Khởi động Docker
- `docker --version` = Kiểm tra version Docker

### Kết Quả:

```
Docker version 24.0.x, build ...
Docker Compose version v2.xx.x
```

✅ Nếu thấy version number = Docker cài thành công!

### ⏱️ Thời Gian:

~5 phút (tùy vào tốc độ internet)

### ❌ Nếu Lỗi:

```
Command not found: docker
```

**Cách sửa:** Chạy lại lệnh cài đặt, hoặc chờ script hoàn thành

---

## ▶️ BƯỚC 6: KHỞI ĐỘNG ỨNG DỤNG

### Mục Đích:

Chạy các Docker containers (Backend, Frontend, Database, MQTT).

### Lệnh:

```bash
# Đảm bảo bạn trong thư mục /home/kltn
cd /home/kltn/KTLN_Web

# Khởi động tất cả containers
docker-compose -f docker-compose.prod.yml up -d --build

# Chờ 30 giây để services khởi động
sleep 30

# Kiểm tra trạng thái
docker-compose -f docker-compose.prod.yml ps
```

### Giải Thích:

- `docker-compose -f docker-compose.prod.yml` = Sử dụng file cấu hình production
- `up -d --build` = Khởi động containers ở background (`-d`), build lại image (`--build`)
- `sleep 30` = Chờ 30 giây
- `ps` = Hiển thị danh sách containers

### Kết Quả:

```
NAME                    STATUS
telehealth_backend      Up 10 seconds
telehealth_frontend     Up 10 seconds
telehealth_db           Up 10 seconds
telehealth_mqtt         Up 10 seconds
```

✅ **Tất cả containers phải là `Up`!**

### ⏱️ Thời Gian:

~2-3 phút (tùy vào kích thước images)

### ❌ Nếu Lỗi:

```
ERROR: docker-compose.prod.yml not found
```

**Nguyên nhân:** File không tồn tại
**Cách sửa:** Chắc chắn bạn đã clone dự án đầy đủ (xem lại Bước 3)

---

## ✅ BƯỚC 7: KIỂM TRA TRIỂN KHAI

### A. Kiểm Tra Containers:

```bash
# Xem trạng thái tất cả containers
docker-compose -f docker-compose.prod.yml ps

# Xem logs từ backend
docker-compose -f docker-compose.prod.yml logs backend

# Xem logs từ frontend
docker-compose -f docker-compose.prod.yml logs frontend
```

### Kết Quả Thành Công:

```
# Logs không có ERROR hoặc CRASH
Backend: Server running on port 5000
Frontend: Ready in 1.2s
```

### B. Kiểm Tra Web Browser:

#### 🌐 Frontend:

```
Mở browser: http://64.176.80.227:3001
```

**Kết quả thành công:** Thấy giao diện ứng dụng (login page, dashboard, etc.)

#### 🔌 API:

```bash
# Chạy lệnh này từ máy local hoặc server
curl http://64.176.80.227:5000/api/health
```

**Kết quả thành công:**

```json
{ "status": "ok", "uptime": 123 }
```

### C. Kiểm Tra Database:

```bash
# SSH vào database container
docker-compose -f docker-compose.prod.yml exec db psql -U admin -d telehealth_system

# Khi vào psql shell, chạy:
\dt

# Xem danh sách tables
# Rồi thoát:
\q
```

### ✅ Tất Cả Thành Công?

```
✓ Containers đang chạy
✓ Frontend hiển thị trên http://64.176.80.227:3001
✓ API response từ http://64.176.80.227:5000/api/health
✓ Database có dữ liệu
```

🎉 **TRIỂN KHAI HOÀN THÀNH!**

---

## 🔄 CẬP NHẬT DOMAIN (NẾU CÓ SAU)

### Khi Bạn Có Domain (Ví Dụ: yourdomain.com):

#### Bước 1: Cập Nhật DNS

```
Tại nhà cung cấp domain (GoDaddy, Namecheap, etc.):
yourdomain.com A 64.176.80.227
api.yourdomain.com A 64.176.80.227
```

#### Bước 2: SSH Vào Server

```bash
ssh root@64.176.80.227
cd /home/kltn
```

#### Bước 3: Cập Nhật .env.production

```bash
# Chỉnh sửa file
nano .env.production
```

**Tìm và thay đổi:**

```
FRONTEND_URL=https://yourdomain.com
BACKEND_URL=https://api.yourdomain.com
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

**Lưu:** Nhấn `Ctrl+O` → `Enter` → `Ctrl+X`

#### Bước 4: Cài SSL & Nginx

```bash
# Cài Nginx
apt install -y nginx certbot python3-certbot-nginx

# Cấp SSL certificate
certbot certonly --standalone \
  -d yourdomain.com \
  -d api.yourdomain.com \
  --non-interactive \
  --agree-tos \
  -m admin@yourdomain.com

# Restart dịch vụ
docker-compose restart
systemctl restart nginx
```

#### Bước 5: Truy Cập

```
Frontend: https://yourdomain.com
API: https://api.yourdomain.com
```

---

## 🛠️ LỆNH HỮU DỤC

### Xem Logs Thời Gian Thực:

```bash
# Tất cả containers
docker-compose -f docker-compose.prod.yml logs -f

# Chỉ backend
docker-compose -f docker-compose.prod.yml logs -f backend

# Chỉ frontend
docker-compose -f docker-compose.prod.yml logs -f frontend

# Chỉ database
docker-compose -f docker-compose.prod.yml logs -f db
```

### Dừng/Khởi Động Lại:

```bash
# Khởi động lại tất cả
docker-compose -f docker-compose.prod.yml restart

# Khởi động lại service cụ thể
docker-compose -f docker-compose.prod.yml restart backend

# Dừng tất cả
docker-compose -f docker-compose.prod.yml down

# Khởi động lại từ đầu (build image mới)
docker-compose -f docker-compose.prod.yml up -d --build
```

### SSH Vào Container:

```bash
# Vào backend container
docker-compose -f docker-compose.prod.yml exec backend bash

# Vào database container
docker-compose -f docker-compose.prod.yml exec db bash

# Thoát container
exit
```

### Kiểm Tra Tài Nguyên:

```bash
# Xem memory, CPU usage
docker stats

# Xem dung lượng disk
df -h

# Xem logs hệ thống
journalctl -xe
```

### Cập Nhật Code Mới:

```bash
# Pull code mới từ Git
cd /home/kltn
git pull origin main

# Build lại images
docker-compose -f docker-compose.prod.yml up -d --build

# Xem quá trình
docker-compose -f docker-compose.prod.yml logs -f
```

---

## 🔧 TROUBLESHOOTING

### ❌ Lỗi: "Cannot connect to Docker daemon"

**Nguyên nhân:** Docker chưa khởi động
**Cách sửa:**

```bash
systemctl start docker
systemctl enable docker
```

---

### ❌ Lỗi: "Port 5000 already in use"

**Nguyên nhân:** Port bị container khác sử dụng
**Cách sửa:**

```bash
# Xem container nào dùng port 5000
lsof -i :5000

# Kill process đó
kill -9 <PID>
```

---

### ❌ Lỗi: "Cannot reach http://64.176.80.227:3001"

**Nguyên nhân:** Containers chưa khởi động xong
**Cách sửa:**

```bash
# Chờ 30 giây rồi thử lại
sleep 30

# Kiểm tra containers
docker-compose -f docker-compose.prod.yml ps

# Xem logs
docker-compose -f docker-compose.prod.yml logs frontend
```

---

### ❌ Lỗi: "Connection refused" khi SSH

**Nguyên nhân:** IP sai hoặc server offline
**Cách sửa:**

```bash
# Kiểm tra IP
ping 64.176.80.227

# Thử lại SSH
ssh root@64.176.80.227
```

---

### ❌ Lỗi: "docker-compose.prod.yml not found"

**Nguyên nhân:** Chưa clone dự án hoặc sai đường dẫn
**Cách sửa:**

```bash
# Kiểm tra thư mục hiện tại
pwd

# Kiểm tra file có tồn tại không
ls -la docker-compose.prod.yml

# Nếu không có, quay lại Bước 3 clone dự án
```

---

### ❌ Database Connection Error

**Nguyên nhân:** Credentials sai hoặc DB chưa sẵn sàng
**Cách sửa:**

```bash
# Kiểm tra .env.production
cat .env.production

# Chắc chắn password được sinh ra
grep DB_PASSWORD .env.production

# Chờ DB khởi động (có thể mất 30 giây)
sleep 30

# Restart database
docker-compose -f docker-compose.prod.yml restart db
```

---

## 📊 KIỂM TRA CUỐI CÙNG

Chạy lệnh này để xác nhận triển khai thành công:

```bash
#!/bin/bash
echo "=== DOCKER CONTAINERS ==="
docker-compose -f docker-compose.prod.yml ps

echo ""
echo "=== DISK USAGE ==="
df -h /

echo ""
echo "=== MEMORY USAGE ==="
free -h

echo ""
echo "=== CONTAINER RESOURCES ==="
docker stats --no-stream

echo ""
echo "=== FINAL STATUS ==="
echo "✓ Frontend: http://64.176.80.227:3001"
echo "✓ API: http://64.176.80.227:5000"
echo "✓ Database: PostgreSQL on :5432"
echo "✓ MQTT: Mosquitto on :1883"
```

Lưu script trên thành file `check-status.sh` rồi chạy:

```bash
chmod +x check-status.sh
./check-status.sh
```

---

## 📋 CHECKLIST HOÀN THÀNH

Đánh dấu những item hoàn thành:

```
Chuẩn Bị:
  [ ] Có SSH client
  [ ] Biết password server
  [ ] Biết Git repo URL

Triển Khai:
  [ ] SSH vào server thành công (Bước 1)
  [ ] Update hệ thống (Bước 2)
  [ ] Clone dự án (Bước 3)
  [ ] Tạo .env.production (Bước 4)
  [ ] Cài Docker (Bước 5)
  [ ] Khởi động containers (Bước 6)

Kiểm Tra:
  [ ] Containers đang chạy (ps)
  [ ] Xem được Frontend (http://64.176.80.227:3001)
  [ ] API response (curl .../api/health)
  [ ] Database hoạt động

Tùy Chọn:
  [ ] Cài Nginx (khi có domain)
  [ ] Cài SSL (khi có domain)
  [ ] Setup Firewall
  [ ] Backup database
```

---

## 🎯 TÓNG TẮT LỆNH (COPY-PASTE NHANH)

Nếu bạn muốn chạy nhanh mà không đọc chi tiết:

```bash
# 1. SSH
ssh root@64.176.80.227

# 2. Chuẩn bị
apt update && apt upgrade -y
cd /home/kltn

# 3. Clone dự án (thay URL)
git clone <YOUR_REPO_URL> .

# 4. Tạo .env.production
cat > .env.production << 'EOF'
DB_USER=admin
DB_PASSWORD=$(openssl rand -base64 32)
DB_NAME=telehealth_system
DB_PORT=5432
BACKEND_PORT=5000
BACKEND_URL=http://64.176.80.227:5000
FRONTEND_URL=http://64.176.80.227:3001
NODE_ENV=production
NEXT_PUBLIC_API_URL=http://64.176.80.227:5000
MQTT_BROKER=mqtt://mosquitto:1883
MQTT_PORT=1883
MQTT_USERNAME=mqtt_user
MQTT_PASSWORD=$(openssl rand -base64 16)
JWT_SECRET=$(openssl rand -base64 32)
JWT_EXPIRY=7d
EOF

# 5. Cài Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# 6. Khởi động
docker-compose -f docker-compose.prod.yml up -d --build
sleep 30

# 7. Kiểm tra
docker-compose -f docker-compose.prod.yml ps
curl http://64.176.80.227:5000/api/health
```

---

## ✨ KẾT THÚC

🎉 Nếu thực hiện đủ các bước trên, ứng dụng của bạn đã chạy trên:

- **Frontend:** http://64.176.80.227:3001
- **API:** http://64.176.80.227:5000
- **Database:** PostgreSQL (internal)
- **MQTT:** Mosquitto (internal)

Khi có domain, follow phần **CẬP NHẬT DOMAIN** để chuyển từ IP sang domain + HTTPS.

**Thành công!** 🚀

---

**Hỗ Trợ:**

- Xem logs: `docker-compose logs -f`
- Restart: `docker-compose restart`
- Dừng: `docker-compose down`

**Ngày tạo:** 15/05/2026
**Version:** 1.0
