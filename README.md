# Mizze · Telegram License Console

Bot quản trị key + mật khẩu cho **dự án chính vghgfhf-7000b**, tương thích menu
Mizze R14.10 trở lên và API firstUse R14.19/R14.20. Bot không chứa source game,
bytes, proxy hoặc private key ký giấy phép.

## Quyền truy cập cố định

- Owner **6482147126**: xem và quản lý toàn bộ key.
- Admin **7567932286**: tạo key và quản lý key do chính admin này tạo.
- Tất cả người khác, group/channel/inline message bị từ chối. Username không cấp quyền.
- Khi admin tạo key, báo cáo riêng cho owner được lưu trong outbox và thử gửi lại
  khi lỗi mạng hoặc owner chưa bấm `/start`. Giao thông Telegram có thể giao lặp
  thông báo nếu mất phản hồi đúng lúc gửi; không tạo thêm key vì gửi lặp.

Hai tài khoản cần mở bot rồi bấm **Start**. Dùng `/menu` để mở nút thao tác:
tạo 1–10 key/lần, 1–3650 ngày, 1–50 máy/key; danh sách có phân trang, tra cứu,
xem Key/mật khẩu, khóa/mở, gỡ một hoặc toàn bộ máy, đổi hạn mức, xóa có xác nhận,
thống kê. Key firstUse chưa kích hoạt chưa tính giờ. Gỡ máy không đặt lại thời hạn.

## Cấu hình GitHub Actions Secrets

Settings → Secrets and variables → Actions → New repository secret:

1. `TELEGRAM_BOT_TOKEN`: token từ BotFather.
2. `FIREBASE_ADMIN_JSON`: JSON Admin SDK của **vghgfhf-7000b**; không commit file này.
3. `BOT_VAULT_KEY`: khóa AES 32 byte, base64. Có thể tạo trên máy quản trị bằng:
   `node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))"`.

Giữ bản sao vault key riêng: đổi/mất khóa này làm mất khả năng đọc lại mật khẩu
bot đã lưu. Khóa/mật khẩu được mã hóa AES-256-GCM trong metadata quản trị; raw
password không vào record `licensesV9`. Vault key, bot token và Admin JSON chỉ
ở Secrets, không đi vào code/log/artifact. Bot không cần RSA private signing key.
Publish Rules đi kèm bản API R14.20, giữ `_mizzeBotV1` không cho client truy cập.

Chạy Actions → **Mizze Telegram Key Bot** → Run workflow. Chỉ chạy một poller cho
token này; bot từ chối startup nếu đang có webhook, không tự xóa webhook khác.

## Icon Telegram Premium

Bản giao diện 14.20.1 dùng bộ 18 custom emoji động đã kiểm tra metadata Telegram:
vương miện, kim cương, tia chớp, tìm kiếm, biểu đồ, lịch, thiết bị, xác nhận và
thông báo. Tiêu đề và từng nhóm nút dùng icon riêng; không lặp một icon mặc định
cho mọi thao tác. Chỉ chọn sticker có animation/video; không giả animation bằng
cách sửa tin nhắn liên tục.

Bot lấy custom emoji ID từ Telegram, gắn vào nút `icon_custom_emoji_id` cùng màu
nút primary/success/danger. Telegram yêu cầu bot có quyền dùng custom emoji
(owner bot có Premium hoặc bot đủ điều kiện Fragment). Nếu Telegram từ chối,
menu vẫn hoạt động với icon thường; code không giả lập quyền Premium.
Tài liệu: https://core.telegram.org/bots/api#inlinekeyboardbutton.

## Lịch chạy

Workflow có lịch mỗi 5 giờ trong ngày UTC, phút 17 để giảm đụng giờ cao điểm;
chuyển từ 20:17 sang 00:17 là 4 giờ vì ngày có 24 giờ. Worker chạy tối đa khoảng
5 giờ 29 phút, lượt mới hủy lượt cũ; distributed lease trong Firebase ngăn hai
poller hoạt động đồng thời. Offset, luồng nhập và outbox lưu ngoài runner, nên
khởi động lại không xóa key hoặc đặt lại thời gian. Nếu bị kill không kịp trả
lock, lượt mới chờ tối đa 90 giây. GitHub có thể trễ/bỏ lượt cron hoặc dừng lịch
repo public sau 60 ngày không hoạt động: Actions không bảo đảm bot luôn online.
Muốn 24/7, chạy `npm ci --ignore-scripts` rồi `npm start` dưới service trên VPS.

Giới hạn GitHub: https://docs.github.com/en/actions/reference/limits.
Lịch cron: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule.

## Kiểm tra / phát triển

Node 24: `npm ci --ignore-scripts` → `npm test`. Unit tests dùng fake DB/Telegram,
không nhắn người thật hoặc sửa dữ liệu thật. Key cũ tạo bằng web không có mật
khẩu trong database; bot không tự khôi phục hoặc đoán mật khẩu key cũ.
