# Roon Data Plugin

Plugin kết nối với Roon để lấy thông tin bài hát đang phát và cung cấp các file để sử dụng trong OBS Studio / Discord RPC.

## Tính năng

- Lấy thông tin bài hát đang phát (tên bài hát, nghệ sĩ, album)
- Tải ảnh bìa album
- Tạo các file text riêng biệt cho từng thông tin để sử dụng trong OBS
- API endpoint để lấy thông tin bài hát hiện tại
- Discord Rich Presence để hiển thị bài hát đang phát trên Discord

## Yêu cầu

- [Node.js](https://nodejs.org/) (v14 trở lên)
- Roon Core đang chạy trong mạng nội bộ

## Cài đặt

1. Clone hoặc tải repository này về máy
2. Mở terminal và di chuyển đến thư mục dự án
3. Cài đặt các phụ thuộc:

```
npm install
```

4. Chạy plugin:

```
npm start
```

## Cấu hình

Bạn có thể chỉnh sửa file `config.js` để thay đổi các thiết lập chung, `config.json` để thay đổi zoneplayer.

### Discord Rich Presence

```javascript
discord: {
    // Bật/tắt Discord RPC (true/false)
    enabled: false,
    // ID ứng dụng Discord (cần tạo ứng dụng tại Discord Developer Portal)
    client_id: "",
    // Hiển thị thời gian còn lại thay vì thời gian đã phát (true/false)
    show_remaining_time: true
}
```

Để dùng Discord RPC:
1. Tạo ứng dụng mới tại [Discord Developer Portal](https://discord.com/developers/applications)
2. Sao chép Application ID và đặt vào `client_id` trong cấu hình
3. Tải lên ảnh có tên "roon_logo" trong phần Rich Presence > Art Assets
4. Đặt `enabled` ở `config.js` từ `false` thành `true`

### Hiển thị

```javascript
display: {
    // Thêm "on" trước tên album (true/false)
    prefix_on_before_album: false,
    // Thêm "by" trước tên nghệ sĩ (true/false)
    prefix_by_before_artist: false
}
```

## Cách hoạt động

1. Plugin sẽ tự động kết nối với Roon Core trong mạng nội bộ
2. Khi có bài hát đang phát, plugin sẽ cập nhật thông tin vào các file trong thư mục `output`
3. Nếu bật Discord RPC, thông tin bài hát sẽ hiển thị trên hồ sơ Discord của bạn

## API Endpoints

- `http://localhost:3000/api/now-playing` - Trả về thông tin bài hát đang phát dưới dạng JSON
- `http://localhost:3000/output/cover.jpg` - Truy cập trực tiếp ảnh bìa album

## Xử lý sự cố

- Nếu plugin không kết nối được với Roon, hãy đảm bảo Roon Core đang chạy và nằm trong cùng mạng
- Trong Roon, vào Settings > Extensions và cho phép extension.
- Nếu ảnh bìa album không hiển thị, hãy kiểm tra xem file `output/cover.jpg` có tồn tại không
- Nếu Discord RPC không hoạt động, hãy đảm bảo bạn đã nhập đúng client_id và Discord đang chạy