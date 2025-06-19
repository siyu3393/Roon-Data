module.exports = {
    server: {
        port: 3000,
        host: "localhost"
    },
    
    roon: {
        extension_id: "com.siyu.roon.data",
        display_name: "Roon Data",
        display_version: "1.0.1",
        publisher: "Siyu",
        email: "siyu339@gmail.com",
        website: "",
    },
    
    // Thiết lập output
    output: {
        directory: "./output",
        image: {
            width: 500,
            height: 500,
            format: "image/jpeg"
        }
    },
    
    // Thiết lập cập nhật
    update: {
        // Tần suất cập nhật thông tin (ms)
        interval: 500
    },
    
    // Discord Rich Presence
    discord: {
        // Bật/tắt Discord RPC (true/false)
        enabled: false,
        client_id: "",
        // Hiển thị thời gian còn lại thay vì thời gian đã phát (true/false)
        show_remaining_time: true
    },
    
    // Thiết lập hiển thị
    display: {
        // Thêm "on" trước tên album (true/false)
        prefix_on_before_album: true,
        // Thêm "by" trước tên nghệ sĩ (true/false)
        prefix_by_before_artist: true
    },
    
    // Thiết lập debug
    debug: {
        // Bật/tắt log debug (true/false)
        enabled: true,
        // Chỉ log thông tin bài hát và trạng thái kết nối
        only_song_info: true,
        // Log chi tiết về ảnh (false để tắt)
        image_details: false
    }
}; 