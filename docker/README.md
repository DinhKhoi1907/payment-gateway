# Docker Configuration cho Payment Services

## Cấu trúc thư mục

```
docker/
├── nginx/
│   ├── default.conf           # Cấu hình Nginx
│   └── Dockerfile             # Dockerfile cho Nginx
├── postgres/
│   ├── init.sql               # Script khởi tạo database
│   └── Dockerfile             # Dockerfile cho PostgreSQL
└── README.md                  # File này
```

## Các service

### 1. PostgreSQL Database
- **Container**: `payment-postgres`
- **Port**: 5432
- **Database**: `payment_db` (có thể thay đổi qua biến môi trường)
- **User**: `postgres` (có thể thay đổi qua biến môi trường)
- **Password**: `postgres123` (có thể thay đổi qua biến môi trường)

### 2. NestJS Application
- **Container**: `payment-services`
- **Port**: 3000
- **Hot reload**: Có (trong development mode)
- **Health check**: `/health` endpoint

### 3. Nginx Reverse Proxy
- **Container**: `payment-nginx`
- **Port**: 80
- **Proxy**: Chuyển tiếp request đến NestJS app
- **Gzip**: Bật nén gzip
- **Health check**: `/health` endpoint

## Biến môi trường

Tạo file `.env` từ `env.example` và điều chỉnh các giá trị:

```bash
cp env.example .env
```

### Các biến quan trọng:

- `DB_HOST`: Host của database (mặc định: postgres)
- `DB_PORT`: Port của database (mặc định: 5432)
- `DB_USERNAME`: Username database (mặc định: postgres)
- `DB_PASSWORD`: Password database (mặc định: postgres123)
- `DB_DATABASE`: Tên database (mặc định: payment_db)
- `PORT`: Port của NestJS app (mặc định: 3000)
- `NGINX_PORT`: Port của Nginx (mặc định: 80)

## Cách sử dụng

### Development mode (với hot reload):
```bash
docker-compose up --build
```

### Production mode:
```bash
docker-compose -f docker-compose.prod.yml up --build
```

### Chạy trong background:
```bash
docker-compose up -d --build
```

### Dừng services:
```bash
docker-compose down
```

### Xem logs:
```bash
# Tất cả services
docker-compose logs -f

# Chỉ NestJS app
docker-compose logs -f payment-services

# Chỉ PostgreSQL
docker-compose logs -f postgres

# Chỉ Nginx
docker-compose logs -f nginx
```

### Truy cập ứng dụng:
- **Qua Nginx**: http://localhost (port 80)
- **Trực tiếp NestJS**: http://localhost:3000
- **PostgreSQL**: localhost:5432

## Logs

Logs được lưu trong thư mục `logs/`:
- `logs/nginx/`: Logs của Nginx
- `logs/postgres/`: Logs của PostgreSQL
- `logs/app/`: Logs của ứng dụng NestJS

## Health Checks

Tất cả services đều có health check:
- **PostgreSQL**: Kiểm tra kết nối database
- **NestJS**: Kiểm tra endpoint `/health`
- **Nginx**: Kiểm tra endpoint `/health`

## Troubleshooting

### 1. Port đã được sử dụng:
```bash
# Kiểm tra port đang được sử dụng
lsof -i :80
lsof -i :3000
lsof -i :5432

# Dừng process đang sử dụng port
sudo kill -9 <PID>
```

### 2. Database connection failed:
- Kiểm tra biến môi trường database
- Đảm bảo PostgreSQL container đã khởi động hoàn toàn
- Kiểm tra logs: `docker-compose logs postgres`

### 3. NestJS app không start:
- Kiểm tra logs: `docker-compose logs payment-services`
- Đảm bảo dependencies đã được cài đặt
- Kiểm tra file `.env` có đúng format không

### 4. Nginx không proxy được:
- Kiểm tra logs: `docker-compose logs nginx`
- Kiểm tra NestJS app có chạy không
- Kiểm tra cấu hình nginx trong `docker/nginx/default.conf`
