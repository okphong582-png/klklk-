# Mizze · Telegram License Console

## Upload từ Windows

Chạy `UP-BOT-LEN-GITHUB.bat` để đưa bản báo cáo mới lên repo
`okphong582-png/klklk-`. Cần Git for Windows và Node.js 22–24. Script clone riêng
nhánh main, backup các file sẽ thay vào thư mục backups của New folder (18),
kiểm tra checksum, chạy tests rồi mới commit/push. Git xử lý đăng nhập bằng
tài khoản có quyền ghi repo. `--check` chỉ kiểm tra công cụ và file, không upload.
Chỉ sáu file giao diện báo cáo/test/uploader được commit; không đưa Secrets,
node_modules, mã game hoặc toàn bộ dự án proxy lên repo bot. Xem Actions sau push.

Bot quản trị key + mật khẩu cho **dự án chính vghgfhf-7000b**, tương thích menu
Mizze R14.10 trở lên và API firstUse R14.19/R14.20. Bot không chứa source game,
bytes, proxy hoặc private key ký giấy phép.

## Quyền truy cập cố định

- Owner **6482147126**: xem và quản lý toàn bộ key.
- Admin **7567932286** và **7976468365**: mỗi người tạo và quản lý key của mình.
- Tất cả người khác, group/channel/inline message bị từ chối. Username không cấp quyền.
- Khi admin tạo key, báo cáo riêng cho owner được lưu trong outbox và thử gửi lại
  khi lỗi mạng hoặc owner chưa bấm `/start`. Giao thông Telegram có thể giao lặp
  thông báo nếu mất phản hồi đúng lúc gửi; không tạo thêm key vì gửi lặp.

Ba tài khoản cần mở bot rồi bấm **Start**. Dùng `/menu` để mở nút thao tác:
tạo 1–10 key/lần, 1–50 máy/key; admin chọn 1/7/30 ngày, owner chọn 1–3650 ngày.
Danh sách có phân trang, tra cứu,
xem Key/mật khẩu, khóa/mở, gỡ một hoặc toàn bộ máy, đổi hạn mức, xóa có xác nhận,
thống kê. Key firstUse chưa kích hoạt chưa tính giờ. Gỡ máy không đặt lại thời hạn.

Tin giao Key/mật khẩu có nút copy từng phần hoặc cả hai, cho phép chuyển tiếp
và chia sẻ. Những tin quản trị khác vẫn được bảo vệ nội dung. Nút xóa key hết
hạn có xác nhận, kiểm tra lại thời hạn và quyền trước khi xóa; key chưa kích
hoạt hoặc còn hạn không bị xóa. Admin chỉ xóa key của mình, owner xóa toàn bộ.

## Báo cáo doanh số

Bố cục mới ngày 25/10/2026: thẻ tổng công nợ, số key và số admin; cơ cấu các gói
1/7/30 ngày; tổng riêng từng admin; bảng chi tiết từng key và caption Telegram
dễ đọc. Giá lấy từ lịch sử tạo key, không áp giá hiện tại ngược lên key cũ.
Key dài tự xuống dòng; trang trống có trạng thái riêng. Vẫn 24 key/trang để giữ
tiến độ gửi và lịch chốt ngày hiện tại. Không gửi tin thử tới tài khoản thật.

Giá key admin: 1 ngày = 5.000đ, 7 ngày = 20.000đ, 30 ngày = 40.000đ. Lịch sử
được ghi cùng giao dịch tạo key và vẫn giữ khi key bị xóa. Không tính key owner
tạo vào tiền admin phải trả. Báo cáo tính theo số key tạo, không phải xác nhận
thanh toán hay số key đã kích hoạt. Key cũ ngoài ba kỳ hạn được đánh dấu chưa có giá.

Owner dùng `/check today` hoặc nút báo cáo để xem ảnh tổng kết hôm nay theo giờ
Việt Nam (UTC+7). Lúc 00:00 bot gửi ảnh chốt ngày trước, chia trang nếu nhiều key.
Con trỏ báo cáo và tiến độ gửi lưu trong Firebase để tiếp tục sau khi runner đổi.
Nếu bot offline lúc nửa đêm, bot gửi bù khi hoạt động trở lại. Telegram có thể
giao lặp một trang nếu mất phản hồi đúng lúc gửi; số liệu doanh số không bị nhân đôi.

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

Bản 14.21.1 xử lý trường hợp chưa publish index doanh số: chỉ khi Firebase báo
thiếu index, bot đọc riêng nhánh sales rồi lọc đúng ngày và admin ở server.
Lỗi mạng hoặc mất quyền vẫn báo lỗi, không biến thành báo cáo trống. Lỗi báo
cáo có lịch thử lại riêng và không chặn nhận tin nhắn. Log chỉ ghi bước lỗi,
mã HTTP/loại lỗi và số lần thử; không in token, key, URL hoặc nội dung exception.

Chạy Actions → **Mizze Telegram Key Bot** → Run workflow. Chỉ chạy một poller cho
token này; bot từ chối startup nếu đang có webhook, không tự xóa webhook khác.

## Icon Telegram Premium

Bản giao diện dùng bộ 18 custom emoji động đã kiểm tra metadata Telegram:
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

Worker chạy tối đa 5 giờ, nhả lease rồi dùng workflow_dispatch gọi lượt tiếp theo.
GITHUB_TOKEN cần quyền actions:write như workflow đi kèm; không cần PAT trong code.
Lịch mỗi giờ phút 17 là dự phòng nếu lượt cũ lỗi. Distributed lease trong Firebase
ngăn hai poller đồng thời; lượt dự phòng thoát nhanh khi đang có leader khỏe.
Offset, luồng nhập, báo cáo và outbox lưu ngoài runner, nên khởi động lại không
xóa key hoặc đặt lại thời gian. Nếu bị kill không kịp trả lock, lease hết sau
tối đa 90 giây. Bật rotation_test khi Run workflow để thử chuyển phiên 60 giây;
lượt tiếp theo tự chạy bình thường 5 giờ. GitHub có thể trễ/bỏ lượt cron hoặc dừng lịch
repo public sau 60 ngày không hoạt động: Actions không bảo đảm bot luôn online.
Muốn 24/7, chạy `npm ci --ignore-scripts` rồi `npm start` dưới service trên VPS.

Giới hạn GitHub: https://docs.github.com/en/actions/reference/limits.
Lịch cron: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule.

## Kiểm tra / phát triển

Node 24: `npm ci --ignore-scripts` → `npm test`. Unit tests dùng fake DB/Telegram,
không nhắn người thật hoặc sửa dữ liệu thật. Key cũ tạo bằng web không có mật
khẩu trong database; bot không tự khôi phục hoặc đoán mật khẩu key cũ.
