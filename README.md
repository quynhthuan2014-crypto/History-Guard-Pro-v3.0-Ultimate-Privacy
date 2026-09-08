# History Guard Pro 3.0.2

Ultimate privacy control extension for Chrome / Chromium-based browsers.

## Cài đặt từ GitHub ZIP

1. Bấm **Code → Download ZIP**.
2. Giải nén ZIP.
3. Mở `chrome://extensions`.
4. Bật **Developer mode / Chế độ nhà phát triển**.
5. Bấm **Load unpacked / Tải tiện ích đã giải nén**.
6. Chọn thư mục vừa giải nén, nơi có `manifest.json` ngay bên trong.

Không chọn một thư mục cha khác chứa thư mục dự án.

## Cấu trúc

```text
History-Guard-Pro-v3.0.2/
├─ manifest.json
├─ icons/
├─ popup/
├─ options/
├─ sidepanel/
├─ src/
└─ test/
```

Bản 3.0.2 bỏ khai báo `sidePanel` khỏi manifest để tránh lỗi tải extension trên Chromium-based browser không hỗ trợ API này. Nút Side Panel trong giao diện vẫn tự kiểm tra API và báo không hỗ trợ khi cần.
