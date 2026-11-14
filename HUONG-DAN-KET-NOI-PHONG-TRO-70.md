# PHÒNG TRỌ 70 HOÀNG SÂM – Hướng dẫn kết nối app mới từ đầu (A → Z)

App này là **bản độc lập hoàn toàn** với app "Nhà trọ 44". Bạn phải tạo **bộ tài khoản dịch vụ MỚI** cho nó (kho GitHub mới, dự án Vercel mới, cơ sở dữ liệu Upstash mới, kho ảnh Blob mới, Google Sheet mới) để dữ liệu của hai nhà **không bao giờ lẫn nhau**. Tên khóa dữ liệu trong app cũng đã đổi (tiền tố `pt70:` thay cho `nt44:`) để an toàn thêm một lớp.

Thông tin đã cài sẵn trong mã nguồn:
| Mục | Giá trị |
|---|---|
| Tên app (tiêu đề, tab trình duyệt, hóa đơn, hợp đồng, icon thêm vào màn hình) | **PHÒNG TRỌ 70 HOÀNG SÂM** |
| Chữ nhỏ cạnh tên | **BusCafe** |
| Icon | Ngôi nhà số **70**, nền cam – hồng – tím (khác icon nhà 44) |
| Tên miền | **https://phongtro70.vercel.app** (xem Bước 3) |
| Mật khẩu đăng nhập | Do bạn tự đặt, khai báo ở Bước 3 (biến `APP_PASSWORD`). **Không ghi mật khẩu vào file này.** |

> Vì sao mật khẩu phải khai báo trên Vercel mà không viết cứng trong mã? Mã nguồn nằm trên GitHub; nếu mật khẩu nằm trong mã thì ai xem được kho mã sẽ biết mật khẩu. Nên mật khẩu của bạn được đặt bằng biến `APP_PASSWORD` trên Vercel – đăng nhập xong là dùng được ngay. Đừng ghi mật khẩu vào bất kỳ file nào trong kho GitHub. Muốn đổi sau này chỉ cần sửa biến đó (xem cuối file).

Chuẩn bị: email, điện thoại nhận mã, khoảng 40 phút, mở sẵn Notepad để dán các đoạn cần ghi nhớ. **Nên dùng Chrome hoặc Edge trên máy tính.** Dùng **cùng tài khoản GitHub/Vercel** như app 44 cũng được – chỉ cần tạo dự án và cơ sở dữ liệu **mới**.

---
## Bước 1. Giải nén mã nguồn
1. Tải file `phong-tro-70-website.zip` về máy → bấm chuột phải → **Giải nén tất cả** (Extract All).
2. Mở thư mục `phong-tro-70-website` vừa giải nén. Phải thấy: `api`, `lib`, `public`, `tests`, `docs`, `scripts`, `package.json`, `vercel.json`.

## Bước 2. Tạo kho GitHub MỚI và tải mã lên
1. Vào https://github.com → đăng nhập → bấm dấu **+** (góc phải trên) → **New repository**.
2. **Repository name**: gõ `phong-tro-70-website`. Chọn **Private**. **Không** tick "Add a README". Bấm **Create repository**.
3. Ở trang kế tiếp bấm liên kết **uploading an existing file**.
4. Trong thư mục đã giải nén, bấm vào một file bất kỳ rồi **Ctrl+A** (chọn tất cả thư mục + file BÊN TRONG thư mục `phong-tro-70-website`) → kéo thả vào trang GitHub. Đừng kéo thư mục bao ngoài, đừng upload file zip. Đợi chạy đủ 100%.
5. Cuộn xuống → bấm **Commit changes**.
✔ Kiểm tra: trong kho thấy `api`, `lib`, `public`, `vercel.json`; mở `public` thấy `index.html`.

## Bước 3. Tạo dự án Vercel MỚI, đặt tên miền `phongtro70.vercel.app`, khai báo mật khẩu
1. Vào https://vercel.com → đăng nhập (**Continue with GitHub**).
2. Bấm **Add New…** → **Project**. Cạnh `phong-tro-70-website` bấm **Import** (không thấy thì bấm **Adjust GitHub App Permissions** → cho phép kho đó).
3. Ở màn hình **Configure Project**:
   - **Project Name**: xóa tên cũ, gõ **`phongtro70`** → địa chỉ web sẽ là **https://phongtro70.vercel.app**. (Nếu Vercel báo tên đã có người dùng, xem "Nếu tên miền bị trùng" bên dưới.)
   - **Framework Preset**: chọn **Other**.
   - **Build Command**: để trống. **Output Directory** (nếu có ô): gõ `public`.
4. Bấm mũi tên mở **Environment Variables**, thêm **2 biến** (gõ Key → gõ Value → bấm **Add** cho từng biến):
   - Key: `APP_PASSWORD` — Value: mật khẩu đăng nhập của bạn (nên ≥ 12 ký tự, có chữ + số + ký hiệu)
   - Key: `SESSION_SECRET` — Value: một chuỗi bất kỳ dài ≥ 32 ký tự, gồm chữ và số, ví dụ gõ bừa `Zq7Lm2Xv9Pt4Rb8Nc3Hd6Jw1Ys5Ke0Ga` (đừng dùng đúng ví dụ này; **không dùng lại chuỗi của app 44**).
5. Bấm **Deploy**, đợi chữ **Congratulations!** → **Continue to Dashboard**.
6. Kiểm tra tên miền: ở Dashboard thấy địa chỉ `phongtro70.vercel.app`. Nếu chỉ thấy tên dạng `phongtro70-abc123.vercel.app`: vào **Settings** → **Domains** → gõ `phongtro70.vercel.app` → **Add** → chọn **Connect to an environment: Production** → **Save**.
   - *Nếu tên miền bị trùng:* `phongtro70.vercel.app` là tên dùng chung toàn Vercel, ai đăng ký trước được trước. Nếu bị lấy mất, hãy dùng tên gần giống (ví dụ `phongtro70hs.vercel.app`) – app vẫn chạy y hệt, chỉ khác địa chỉ.

## Bước 4. Tạo cơ sở dữ liệu Upstash Redis MỚI (nơi lưu dữ liệu thật)
1. Trong dự án `phongtro70` trên Vercel → thẻ **Storage** → **Create Database** (hoặc **Browse Marketplace**) → chọn **Upstash** → **Redis** → **Continue**.
2. Chọn gói **Free**. **Region**: **Singapore (ap-southeast-1)**. **Name**: `phongtro70` → **Create**.
3. Khi hỏi nối vào dự án: chọn `phongtro70`, tick **Production, Preview, Development** → **Connect**.
4. **KHÔNG nhập thẻ thanh toán.**
✔ Kiểm tra: **Settings → Environment Variables** có thêm các biến bắt đầu bằng `KV_` hoặc `UPSTASH_`.
⚠ **Phải tạo database mới tên `phongtro70`**, không dùng lại database `nhatro44` của app cũ.

## Bước 5. Tạo kho ảnh CCCD Vercel Blob MỚI (riêng tư)
1. **Storage** → **Create Database** → chọn **Blob** → **Continue**.
2. **Name**: `cccd70`. Mục **Access** chọn **Private** (tuyệt đối không chọn Public) → **Create** → nối vào dự án `phongtro70` (đủ 3 môi trường).
✔ Kiểm tra: có biến `BLOB_READ_WRITE_TOKEN` trong **Environment Variables**.

## Bước 6. Triển khai lại để nhận kết nối
**Deployments** → dòng trên cùng → dấu **⋯** → **Redeploy** → **Redeploy**. Đợi xong (chữ **Ready**).

## Bước 7. Kiểm tra từng mắt xích
1. Mở https://phongtro70.vercel.app/api/health → phải thấy: `"api":"đang chạy"`, `daKetNoiNoiLuuDuLieu: true`, `kiemTraDocDuLieu: "ok"`, `daDatMatKhau: true`, `daDatSessionSecret: true`, `daKetNoiKhoAnh: true`.
2. Mở https://phongtro70.vercel.app/kiemtra.html → trang tự kiểm tra và báo ✅/❌ từng mục.
3. Mở https://phongtro70.vercel.app → thấy tiêu đề **PHÒNG TRỌ 70 HOÀNG SÂM** (chữ nhỏ **BusCafe** kế bên).
4. Bấm đăng nhập → nhập mật khẩu bạn đã đặt ở Bước 3 → thấy 5 phòng và thẻ Chủ Nhà.
5. Cuối tab **Sao lưu** có thẻ **"Kiểm tra tất cả kết nối"** → bấm → mọi dòng phải ✅ (trừ Google Sheet nếu chưa làm Bước 8).
6. Thử: Phòng 1 → **Thêm khách thuê** → chụp 2 mặt CCCD → lưu → tải lại trang vẫn còn dữ liệu. Sau thử xong có thể xóa khách thử (hoặc khôi phục file sao lưu trống).

## Bước 8. Kết nối Google Sheet sao lưu MỚI (khuyên dùng)
Làm đúng theo file **`docs/GOOGLE-SHEET.md`** (đã đổi tên sẵn cho app 70). Tóm tắt:
1. https://sheets.google.com → **Trống** → đặt tên `Phòng Trọ 70 - sao lưu`. **Phải là Sheet mới**, không dùng Sheet của nhà 44.
2. **Tiện ích → Apps Script** → xóa code mẫu → dán nội dung file `docs/google-apps-script.gs` → sửa dòng 7 `const SECRET = '…'` thành mã bí mật của bạn (≥ 16 ký tự, chữ + số, ví dụ `pt70-Kx92LmQ7pRt3`) → **Lưu**.
3. **Triển khai → Tùy chọn triển khai mới → bánh răng → Ứng dụng web** → Thực thi: **Tôi**, Quyền truy cập: **Bất kỳ ai** → **Triển khai** → **Cấp quyền** → sao chép địa chỉ dạng `https://script.google.com/macros/s/…/exec`.
4. Vercel → **Settings → Environment Variables**, thêm: `GOOGLE_SHEET_WEBHOOK_URL` = địa chỉ `/exec` vừa chép; `GOOGLE_SHEET_SECRET` = đúng mã ở bước 2 → **Redeploy**.
5. Web → **Sao lưu → Sao lưu vào Google Sheet → Kiểm tra kết nối** → ✅; bấm **Gửi dòng thử**, rồi **Sao lưu đầy đủ ngay**.
(Mẹo: trong web có sẵn nút **Tạo mã bí mật** và **Sao chép mã Apps Script** đã kèm mã bí mật – chỉ việc dán.)

## Bước 9. Cài icon như ứng dụng trên điện thoại
- iPhone/iPad (Safari): nút **Chia sẻ** → **Thêm vào Màn hình chính**. Android (Chrome): ⋮ → **Thêm vào màn hình chính**. Tên hiện là "Phòng Trọ 70" với icon ngôi nhà số 70.

## Bước 10. Nhập thông tin chủ nhà và bắt đầu dùng
- Vào phòng **Chủ Nhà** → điền "Thông tin Bên A" (họ tên, CCCD…, **Công An Quản Lý** ví dụ "Công An Phường …", địa chỉ nhà trọ `70 Hoàng Sâm, …`) → hợp đồng và bản khai CT01 tự điền.
- Đổi tên/giá/số phòng nếu nhà 70 không đúng 5 phòng: dùng **Thêm phòng** và **Sửa Tình Trạng Phòng** ngay ở Tổng quan.

---
## Đổi mật khẩu sau này
Vercel → dự án `phongtro70` → **Settings → Environment Variables** → `APP_PASSWORD` → **⋯ → Edit** → nhập mật khẩu mới → **Save** → **Deployments → Redeploy**. Muốn đăng xuất mọi thiết bị: đổi `SESSION_SECRET` rồi Redeploy.

## Sao lưu định kỳ
Mỗi tháng vào **Sao lưu** → **Tải database.json** và **Tải Excel**, cất ở Google Drive/email. Hệ thống còn tự lưu vào Google Sheet và Upstash.

## Khi gặp lỗi
| Thấy gì | Cách xử lý |
|---|---|
| `/api/health` báo 404 | Kho GitHub thiếu thư mục `api` hoặc `vercel.json` → upload lại, Redeploy |
| "Chưa kết nối nơi lưu dữ liệu" | Làm Bước 4 rồi Redeploy |
| "Chưa kết nối kho ảnh" | Làm Bước 5 rồi Redeploy |
| Không đăng nhập được | Kiểm tra biến `APP_PASSWORD` đúng mật khẩu bạn gõ (không thừa dấu cách), rồi Redeploy |
| Thấy dữ liệu của nhà 44 | Bạn đã nối nhầm database cũ → Storage → ngắt database cũ, tạo database mới Bước 4 |
Các hướng dẫn chi tiết khác nằm trong thư mục `docs/` (Render, CMD, Google Sheet, giới hạn miễn phí…).
