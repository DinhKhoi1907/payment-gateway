# Hướng dẫn Deploy Payment Services lên Vercel

Hướng dẫn chi tiết để deploy ứng dụng NestJS (Payment Services) với PostgreSQL lên Vercel sử dụng GitHub Actions.

## 📋 Yêu cầu

- Tài khoản [Vercel](https://vercel.com) (miễn phí)
- Tài khoản [GitHub](https://github.com)
- Repository GitHub đã chứa mã nguồn
- [Vercel CLI](https://vercel.com/docs/cli) (để cấu hình ban đầu)

## 🚀 Bước 1: Thiết lập Vercel Postgres

1. Đăng nhập vào [Vercel Dashboard](https://vercel.com/dashboard)
2. Chọn project hoặc tạo project mới
3. Vào **Storage** → **Create Database** → Chọn **Postgres**
4. Chọn khu vực (region) gần nhất (ví dụ: `Southeast Asia (Singapore)`)
5. Chọn plan (Hobby plan miễn phí cho dự án nhỏ)
6. Đặt tên database (ví dụ: `payment-db`)
7. Sau khi tạo, Vercel sẽ tự động tạo các biến môi trường:
   - `POSTGRES_URL` - Connection string chính
   - `POSTGRES_PRISMA_URL` - Connection string cho Prisma (có thể bỏ qua)
   - `POSTGRES_URL_NON_POOLING` - Connection string không pooling (cho migrations)

## 🔧 Bước 2: Thiết lập Vercel Project

### 2.1. Cài đặt Vercel CLI

```bash
npm install -g vercel
```

### 2.2. Đăng nhập và liên kết project

```bash
cd payment-services
vercel login
vercel link
```

Khi chạy `vercel link`, bạn sẽ được hỏi:
- **Set up and develop "payment-services"?** → `Y`
- **Which scope?** → Chọn scope của bạn
- **Link to existing project?** → `N` (nếu project mới) hoặc `Y` (nếu đã có)
- **What's your project's name?** → Nhập tên project (ví dụ: `payment-services`)
- **In which directory is your code located?** → `./`

Lệnh này sẽ tạo file `.vercel/project.json` với thông tin project.

### 2.3. Lấy thông tin Project ID và Org ID

```bash
cat .vercel/project.json
```

Bạn sẽ thấy:
```json
{
  "orgId": "your-org-id",
  "projectId": "your-project-id"
}
```

**Lưu lại các giá trị này!**

## 🔐 Bước 3: Thiết lập GitHub Secrets

1. Vào repository GitHub của bạn
2. Vào **Settings** → **Secrets and variables** → **Actions**
3. Thêm các secrets sau:

### Secrets cần thiết:

| Secret Name | Giá trị | Mô tả |
|------------|---------|-------|
| `VERCEL_TOKEN` | Token từ Vercel | Lấy tại: Vercel Dashboard → Settings → Tokens → Create Token |
| `VERCEL_ORG_ID` | Org ID từ `.vercel/project.json` | Đã lấy ở bước 2.3 |
| `VERCEL_PROJECT_ID` | Project ID từ `.vercel/project.json` | Đã lấy ở bước 2.3 |

### Cách lấy VERCEL_TOKEN:

1. Vào [Vercel Dashboard](https://vercel.com/dashboard)
2. Click vào avatar → **Settings**
3. Vào **Tokens** → **Create Token**
4. Đặt tên token (ví dụ: `github-actions-deploy`)
5. Chọn scope: **Full Account** (hoặc chỉ project cụ thể)
6. Copy token và lưu vào GitHub Secrets

## ⚙️ Bước 4: Cấu hình Environment Variables trên Vercel

1. Vào Vercel Dashboard → Project của bạn
2. Vào **Settings** → **Environment Variables**
3. Thêm các biến môi trường sau:

### Biến môi trường cần thiết:

#### Database (tự động tạo bởi Vercel Postgres):
- `POSTGRES_URL` - Đã tự động tạo khi setup Postgres

#### Application Configuration:
```
NODE_ENV=production
PORT=3000
```

#### Payment Service Configuration:
```
PAYMENT_SERVICE_API_KEY=your_secret_api_key
PAYMENT_SERVICE_WEBHOOK_SECRET=your_webhook_secret
```

#### Laravel Integration:
```
LARAVEL_SECRET_KEY=your_laravel_secret_key
LARAVEL_CALLBACK_URL=https://your-laravel-app.com/api/payment/callback
LARAVEL_URL=https://your-laravel-app.com
NESTJS_URL=https://your-vercel-app.vercel.app
NESTJS_SECRET_KEY=your_nestjs_secret_key
IDEMPOTENCY_TTL_MINUTES=10
```

#### Sepay Configuration:
```
SEPAY_API_URL=https://pay-sandbox.sepay.vn
SEPAY_MERCHANT_ID=your_sepay_merchant_id
SEPAY_SECRET_KEY=your_sepay_secret_key
SEPAY_USE_REAL_API=false
SEPAY_ACCOUNT=0356936816
SEPAY_BANK=MBBank
```

#### MoMo Configuration:
```
MOMO_API_URL=https://test-payment.momo.vn/v2/gateway/api
MOMO_PARTNER_CODE=your_momo_partner_code
MOMO_ACCESS_KEY=your_momo_access_key
MOMO_SECRET_KEY=your_momo_secret_key
MOMO_NOTIFY_URL=https://your-vercel-app.vercel.app/api/payment/webhook/momo
MOMO_DEFAULT_TTL_MINUTES=30
```

#### PayPal Configuration:
```
PAYPAL_API_URL=https://api.sandbox.paypal.com
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_VND_TO_USD_RATE=23000
```

**Lưu ý:** 
- Chọn environment: **Production**, **Preview**, và **Development** (tùy nhu cầu)
- Thay thế các giá trị placeholder bằng giá trị thực tế
- URL webhook phải là URL Vercel của bạn (sẽ có sau khi deploy)

## 🗄️ Bước 5: Chạy Database Migrations

Sau khi deploy lần đầu, bạn cần chạy migrations để tạo các bảng trong database:

### Cách 1: Sử dụng Vercel CLI (Khuyến nghị)

```bash
cd payment-services

# Build project
npm run build

# Pull environment variables
vercel env pull .env.production

# Chạy migrations
npm run migration:run
```

**Lưu ý:** Bạn cần cập nhật `ormconfig.ts` để sử dụng `POSTGRES_URL`:

```typescript
export default new DataSource({
  type: 'postgres',
  url: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  entities: ['dist/**/*.entity.js'],
  migrations: ['dist/migrations/*.js'],
  synchronize: false,
  ssl: process.env.POSTGRES_URL ? { rejectUnauthorized: false } : false,
});
```

### Cách 2: Sử dụng Vercel CLI remote

```bash
# Kết nối với Postgres từ local
vercel env pull .env.production
# Sau đó chạy migrations như bình thường
```

## 🚢 Bước 6: Deploy và Test

### 6.1. Push code lên GitHub

```bash
git add .
git commit -m "Setup Vercel deployment"
git push origin main
```

### 6.2. Kiểm tra GitHub Actions

1. Vào repository GitHub → **Actions** tab
2. Kiểm tra workflow `Deploy Payment Services to Vercel`
3. Đợi quá trình build và deploy hoàn tất

### 6.3. Xem logs deployment

- Trên Vercel Dashboard → **Deployments** → Click vào deployment mới nhất
- Hoặc trên GitHub Actions → Click vào workflow run → Xem logs

### 6.4. Kiểm tra ứng dụng

Sau khi deploy thành công, Vercel sẽ cung cấp URL:
- Production: `https://your-project-name.vercel.app`
- Preview: `https://your-project-name-git-branch.vercel.app`

Test API endpoints:
```bash
curl https://your-project-name.vercel.app/api/payment/health
```

## 📝 Bước 7: Cấu hình Custom Domain (Tùy chọn)

1. Vào Vercel Dashboard → Project → **Settings** → **Domains**
2. Thêm domain của bạn (ví dụ: `api.yourdomain.com`)
3. Cấu hình DNS records theo hướng dẫn của Vercel
4. Đợi DNS propagate (có thể mất vài phút đến vài giờ)

## 🔄 Bước 8: Cập nhật Webhook URLs

Sau khi có URL production, cập nhật các webhook URLs trong:
- MoMo dashboard: `MOMO_NOTIFY_URL`
- PayPal dashboard: Webhook URL
- Sepay dashboard: Webhook URL
- Environment variables trên Vercel

## 🛠️ Troubleshooting

### Lỗi: "Cannot find module"

- Đảm bảo đã build project trước khi deploy: `npm run build`
- Kiểm tra `package.json` có đầy đủ dependencies

### Lỗi: Database connection failed

- Kiểm tra `POSTGRES_URL` đã được set trong Vercel Environment Variables
- Đảm bảo đã tạo Vercel Postgres database
- Kiểm tra SSL settings trong `app.module.ts`

### Lỗi: Migrations không chạy

- Chạy migrations manually từ local với Vercel Postgres URL
- Hoặc tạo một Vercel Function để chạy migrations

### Lỗi: Timeout

- Tăng `maxDuration` trong `vercel.json` (giới hạn 60 giây cho Hobby plan)
- Tối ưu hóa code và queries

### Lỗi: Build failed

- Kiểm tra logs trong GitHub Actions
- Đảm bảo Node.js version tương thích
- Kiểm tra TypeScript errors: `npm run build` local

## 📚 Tài liệu tham khảo

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres)
- [NestJS Deployment](https://docs.nestjs.com/recipes/deployment)
- [GitHub Actions](https://docs.github.com/en/actions)

## ✅ Checklist Deploy

- [ ] Đã tạo Vercel Postgres database
- [ ] Đã setup Vercel project và link local
- [ ] Đã thêm GitHub Secrets (VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID)
- [ ] Đã cấu hình tất cả Environment Variables trên Vercel
- [ ] Đã test build local: `npm run build`
- [ ] Đã push code lên GitHub
- [ ] Đã kiểm tra GitHub Actions workflow chạy thành công
- [ ] Đã chạy database migrations
- [ ] Đã test API endpoints
- [ ] Đã cập nhật webhook URLs

---

**Chúc bạn deploy thành công! 🎉**

