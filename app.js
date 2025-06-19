const originalRequire = module.require;

// chặn console.log module Roon
module.require = function(id) {
    const mod = originalRequire.apply(this, arguments);
    
    if (id.includes('node-roon-api') && mod) {
        if (mod.log) {
            const originalLog = mod.log;
            mod.log = function() {
                //chặn log
                return;
            };
        }
        
        // ghi đè các phương thức log khác, 
        ['debug', 'info', 'warn', 'error'].forEach(method => {
            if (mod[method]) {
                mod[method] = function() {
                    // Không làm gì cả - chặn log
                    return;
                };
            }
        });
        
        // ghi đè phương thức mạng
        if (mod.transport && mod.transport.socket && mod.transport.socket.send) {
            const originalSend = mod.transport.socket.send;
            mod.transport.socket.send = function() {
                try {
                    return originalSend.apply(this, arguments);
                } catch (e) {
                    // Bỏ qua lỗi
                    return;
                }
            };
        }
    }
    
    return mod;
};

try {
    // Ghi đè WebSocket
    if (global.WebSocket) {
        const originalWebSocketSend = global.WebSocket.prototype.send;
        global.WebSocket.prototype.send = function() {
            try {
                return originalWebSocketSend.apply(this, arguments);
            } catch (e) {
                // Bỏ qua lỗi
                return;
            }
        };
    }
    
    // Ghi đè các phương thức mạng
    const net = require('net');
    if (net && net.Socket && net.Socket.prototype.write) {
        const originalSocketWrite = net.Socket.prototype.write;
        net.Socket.prototype.write = function(data) {
            // Nếu dữ liệu chứa thông tin Buffer, không log
            if (data && typeof data === 'string' && 
                (data.includes('COMPLETE') || data.includes('Buffer'))) {
                // gửi dữ liệu nhưng không log
                try {
                    return originalSocketWrite.apply(this, arguments);
                } catch (e) {
                    // Bỏ qua lỗi
                    return true;
                }
            }
            return originalSocketWrite.apply(this, arguments);
        };
    }
} catch (e) {
    // Bỏ qua lỗi khi ghi đè các phương thức mạng
}

const RoonApi = require("node-roon-api");
const RoonApiStatus = require("node-roon-api-status");
const RoonApiTransport = require("node-roon-api-transport");
const RoonApiImage = require("node-roon-api-image");
const express = require("express");
const fs = require("fs-extra");
const path = require("path");
const config = require("./config");

// Khởi tạo Discord RPC nếu được bật
let rpc = null;
if (config.discord && config.discord.enabled) {
    try {
        const DiscordRPC = require('discord-rpc');
        rpc = new DiscordRPC.Client({ transport: 'ipc' });
        
        // Đăng ký sự kiện khi kết nối thành công
        rpc.on('ready', () => {
            safeLog("connection", `Đã kết nối với Discord RPC! Đăng nhập với ${rpc.user.username}#${rpc.user.discriminator}`);
        });
        
        // Kết nối với Discord
        if (config.discord.client_id) {
            rpc.login({ clientId: config.discord.client_id }).catch(error => {
                safeLog("connection", `Lỗi khi kết nối với Discord RPC: ${error.message || 'Không rõ lỗi'}`);
            });
        } else {
            safeLog("connection", "Không thể kết nối với Discord RPC: Thiếu client_id");
        }
    } catch (error) {
        safeLog("connection", `Lỗi khi khởi tạo Discord RPC: ${error.message || 'Không rõ lỗi'}`);
        safeLog("connection", "Vui lòng cài đặt discord-rpc bằng lệnh: npm install discord-rpc");
    }
}

// Lưu console.log gốc
const originalConsoleLog = console.log;
const originalConsoleDebug = console.debug;
const originalConsoleInfo = console.info;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

// Tắt tất cả các loại log từ thư viện node-roon-api
if (!config.debug || !config.debug.enabled) {
    // Ghi đè tất cả các phương thức console
    console.log = function() {};
    console.debug = function() {};
    console.info = function() {};
    console.warn = function() {};
    console.error = function() {};
    
    // Ghi đè process.stdout.write và process.stderr.write
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    
    process.stdout.write = function(chunk, encoding, callback) {
        // Kiểm tra nếu chunk chứa chuỗi Buffer data
        if (typeof chunk === 'string' && (chunk.includes('COMPLETE') || chunk.includes('Buffer'))) {
            // Bỏ qua log này
            if (typeof callback === 'function') callback();
            return true;
        }
        return originalStdoutWrite.apply(process.stdout, arguments);
    };
    
    process.stderr.write = function(chunk, encoding, callback) {
        // Kiểm tra nếu chunk chứa chuỗi Buffer data
        if (typeof chunk === 'string' && (chunk.includes('COMPLETE') || chunk.includes('Buffer'))) {
            // Bỏ qua log này
            if (typeof callback === 'function') callback();
            return true;
        }
        return originalStderrWrite.apply(process.stderr, arguments);
    };
} else {
    // Nếu debug được bật, vẫn lọc các log không mong muốn
    const originalStdoutWrite = process.stdout.write;
    process.stdout.write = function(chunk, encoding, callback) {
        // Kiểm tra nếu chunk chứa chuỗi Buffer data
        if (typeof chunk === 'string' && (chunk.includes('COMPLETE') || chunk.includes('Buffer'))) {
            // Bỏ qua log này
            if (typeof callback === 'function') callback();
            return true;
        }
        return originalStdoutWrite.apply(process.stdout, arguments);
    };
}

// Tạo thư mục output nếu chưa tồn tại
const outputDir = path.join(__dirname, config.output.directory.replace(/^\.\//, ""));
fs.ensureDirSync(outputDir);

// Khởi tạo Express server để phục vụ file ảnh và thông tin
const app = express();
let PORT = config.server.port;
const HOST = config.server.host;

// Phục vụ thư mục output như static files
app.use("/output", express.static(outputDir));

// API endpoint để lấy thông tin bài hát hiện tại
app.get("/api/now-playing", (req, res) => {
    try {
        const data = fs.readJsonSync(path.join(outputDir, "now_playing.json"));
        res.json(data);
    } catch (err) {
        res.status(404).json({ error: "Không có thông tin bài hát" });
    }
});

// Hàm log an toàn - chỉ hiển thị khi debug được bật và theo cấu hình
function safeLog(type, ...args) {
    // Chỉ log khi debug được bật
    if (config.debug && config.debug.enabled) {
        // Nếu chỉ log thông tin bài hát, kiểm tra loại log
        if (config.debug.only_song_info) {
            // Các loại log được phép: song_info, connection
            if (type === 'song_info' || type === 'connection') {
                originalConsoleLog('[INFO]', ...args);
            }
            // Không log thông tin ảnh nếu image_details = false
            else if (type === 'image' && config.debug.image_details) {
                originalConsoleLog('[IMAGE]', ...args);
            }
        } else {
            // Log tất cả nếu only_song_info = false
            originalConsoleLog(`[${type.toUpperCase()}]`, ...args);
        }
    }
    return;
}

// Khởi động Express server với xử lý lỗi
function startServer(retryCount = 0) {
    const maxRetries = 5;
    const server = app.listen(PORT, HOST, () => {
        safeLog("connection", `Server đang chạy tại http://${HOST}:${PORT}`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            safeLog("connection", `Cổng ${PORT} đã được sử dụng, đang thử cổng khác...`);
            if (retryCount < maxRetries) {
                PORT++;
                startServer(retryCount + 1);
            } else {
                safeLog("connection", `Không thể khởi động server sau ${maxRetries} lần thử. Vui lòng kiểm tra lại cấu hình.`);
            }
        } else {
            safeLog("connection", `Lỗi khi khởi động server: ${err.message}`);
        }
    });
}

// Khởi động server
startServer();

// Biến để lưu trữ core hiện tại
var core = null;
// Biến để lưu trữ ID bài hát hiện tại để tránh cập nhật trùng lặp
var currentSongId = null;
// Biến để lưu trữ thông tin bài hát hiện tại
var currentSongInfo = null;
// Biến để lưu trữ thời điểm cập nhật thời gian gần nhất
var lastTimeUpdate = 0;

// Hàm lưu thông tin bài hát hiện tại
function saveNowPlaying(data) {
    const filePath = path.join(outputDir, "now_playing.json");
    fs.writeJsonSync(filePath, data, { spaces: 2 });
    
    // Áp dụng tiền tố nếu được cấu hình
    let artistText = data.artist || "";
    let albumText = data.album || "";
    
    if (config.display && config.display.prefix_by_before_artist && artistText) {
        artistText = `by ${artistText}`;
    }
    
    if (config.display && config.display.prefix_on_before_album && albumText) {
        albumText = `on ${albumText}`;
    }
    
    // Lưu thông tin riêng lẻ vào các file text
    if (data.title) fs.writeFileSync(path.join(outputDir, "title.txt"), data.title);
    fs.writeFileSync(path.join(outputDir, "artist.txt"), artistText);
    fs.writeFileSync(path.join(outputDir, "album.txt"), albumText);
}

// Hàm cập nhật Discord Rich Presence
function updateDiscordPresence(songInfo) {
    if (!config.discord || !config.discord.enabled || !rpc) return;
    
    try {
        if (!songInfo || !songInfo.title) {
            // Không có bài hát nào đang phát
            rpc.setActivity({
                details: "Không có bài hát nào đang phát",
                state: "Đang dừng",
                largeImageKey: "roon_logo",
                largeImageText: "Roon",
                instance: false,
            });
            return;
        }
        
        // Tính toán thời gian
        const startTimestamp = Date.now() - (songInfo.seek_position || 0);
        let endTimestamp = null;
        
        if (songInfo.length && songInfo.length > 0) {
            endTimestamp = startTimestamp + (songInfo.length - (songInfo.seek_position || 0));
        }
        
        // Tạo activity object
        const activity = {
            details: songInfo.title,
            state: songInfo.artist ? (config.display.prefix_by_before_artist ? `by ${songInfo.artist}` : songInfo.artist) : "",
            largeImageKey: "roon_logo",
            largeImageText: songInfo.album ? (config.display.prefix_on_before_album ? `on ${songInfo.album}` : songInfo.album) : "Roon",
            instance: false,
        };
        
        // Thêm thông tin thời gian nếu có
        if (songInfo.length && songInfo.length > 0) {
            if (config.discord.show_remaining_time) {
                activity.endTimestamp = endTimestamp;
            } else {
                activity.startTimestamp = startTimestamp;
            }
        }
        
        // Cập nhật Discord Rich Presence
        rpc.setActivity(activity);
    } catch (error) {
        safeLog("connection", `Lỗi khi cập nhật Discord Rich Presence: ${error.message || 'Không rõ lỗi'}`);
    }
}

// Hàm tải ảnh bìa album
function downloadImage(imageUrl, outputPath) {
    if (!imageUrl || !core || !core.services || !core.services.RoonApiImage) return Promise.resolve(false);
    
    return new Promise((resolve, reject) => {
        core.services.RoonApiImage.get_image(imageUrl, { 
            scale: "fit", 
            width: config.output.image.width, 
            height: config.output.image.height, 
            format: config.output.image.format 
        }, (err, contentType, body) => {
            if (err) {
                safeLog("connection", "Lỗi khi tải ảnh:", err.message || 'Không rõ lỗi');
                return resolve(false);
            }
            
            try {
                // Lưu ảnh vào file mà không log nội dung
                fs.writeFileSync(outputPath, body);
                safeLog("image", `Đã lưu ảnh vào ${outputPath} (${body ? body.length : 0} bytes)`);
                resolve(true);
            } catch (error) {
                safeLog("connection", "Lỗi khi lưu ảnh:", error.message || 'Không rõ lỗi');
                resolve(false);
            }
        });
    });
}

// Hàm định dạng thời gian từ mili giây sang phút:giây
function formatTime(ms) {
    // Kiểm tra nếu ms là null, undefined hoặc 0
    if (!ms) return "0:00";
    
    // Đảm bảo ms là số
    ms = Number(ms);
    if (isNaN(ms) || ms <= 0) return "0:00";
    
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Xử lý khi có thay đổi trạng thái
function handleStatusChange(transport_service, data) {
    if (!data || !data.zones) return;
    
    // Tìm zone đang phát nhạc
    const playingZone = Object.values(data.zones).find(zone => 
        zone.state === "playing" && zone.now_playing);
    
    if (playingZone && playingZone.now_playing) {
        const nowPlaying = playingZone.now_playing;
        
        // Tạo ID duy nhất cho bài hát hiện tại để phát hiện thay đổi
        const songId = `${nowPlaying.three_line?.line1 || ''}-${nowPlaying.three_line?.line2 || ''}`;
        
        // Lấy thông tin bài hát
        const songInfo = {
            title: (nowPlaying.three_line && nowPlaying.three_line.line1) || 'Không có tiêu đề',
            artist: (nowPlaying.three_line && nowPlaying.three_line.line2) || '',
            album: (nowPlaying.three_line && nowPlaying.three_line.line3) || '',
            image_key: nowPlaying.image_key,
            length: nowPlaying.length || 0,
            seek_position: nowPlaying.seek_position || 0,
            zone_name: playingZone.display_name,
            state: playingZone.state,
            updated_at: new Date().toISOString()
        };
        
        // Kiểm tra bài hát có thay đổi không
        if (songId !== currentSongId) {
            currentSongId = songId;
            currentSongInfo = songInfo;
            lastTimeUpdate = Date.now();
            
            // Log thông tin bài hát mới
            safeLog("song_info", "=== THÔNG TIN BÀI HÁT ===");
            safeLog("song_info", `Tiêu đề: ${songInfo.title}`);
            safeLog("song_info", `Nghệ sĩ: ${songInfo.artist}`);
            safeLog("song_info", `Album: ${songInfo.album}`);
            safeLog("song_info", `Vùng phát: ${songInfo.zone_name}`);
            
            safeLog("song_info", "============================");
            
            // Lưu thông tin bài hát
            saveNowPlaying(songInfo);
            
            // Tải ảnh bìa album nếu có
            if (songInfo.image_key) {
                downloadImage(songInfo.image_key, path.join(outputDir, "cover.jpg"));
            }
            
            // Cập nhật Discord Rich Presence
            updateDiscordPresence(songInfo);
        } else {
            // Cập nhật thời gian phát nếu bài hát vẫn đang phát
            currentSongInfo = {
                ...currentSongInfo,
                seek_position: nowPlaying.seek_position || 0,
                state: playingZone.state,
                updated_at: new Date().toISOString()
            };
            
            // Chỉ cập nhật thời gian trong file mỗi giây để tránh ghi file quá nhiều
            const now = Date.now();
            if (now - lastTimeUpdate >= 1000 && currentSongInfo.length > 0) {
                lastTimeUpdate = now;
                // Cập nhật file now_playing.json để đảm bảo seek_position được cập nhật
                saveNowPlaying(currentSongInfo);
                
                // Cập nhật Discord Rich Presence
                updateDiscordPresence(currentSongInfo);
            }
        }
    } else {
        // Không có bài hát nào đang phát
        if (currentSongId !== null) {
            currentSongId = null;
            currentSongInfo = null;
            const emptyInfo = {
                title: "Không có bài hát nào đang phát",
                artist: "",
                album: "",
                image_key: null,
                updated_at: new Date().toISOString()
            };
            safeLog("song_info", "=== DỪNG PHÁT NHẠC ===");
            saveNowPlaying(emptyInfo);
            
            // Cập nhật Discord Rich Presence
            updateDiscordPresence(null);
        }
    }
}

// Khởi tạo Roon API
var roon = new RoonApi({
    extension_id: config.roon.extension_id,
    display_name: config.roon.display_name,
    display_version: config.roon.display_version,
    publisher: config.roon.publisher,
    email: config.roon.email,
    website: config.roon.website,
    logger_level: 'none',  // Tắt log từ thư viện Roon API
    
    // Thêm các callback bắt buộc
    core_paired: function(core_) {
        core = core_;
        svc_status.set_status("Đã kết nối với Roon Core", false);
        safeLog("connection", "Đã kết nối với Roon Core!");
        
        // Monkey patch các hàm nội bộ của core để chặn log
        if (core && typeof core === 'object') {
            // Tìm và vô hiệu hóa các hàm log trong core object
            disableLoggingInObject(core);
        }
        
        // Đăng ký nhận thông báo khi có thay đổi
        if (core && core.services && core.services.RoonApiTransport) {
            try {
                core.services.RoonApiTransport.subscribe_zones((cmd, data) => {
                    if (core && core.services) {
                        handleStatusChange(core.services.RoonApiTransport, data);
                    }
                });
            } catch (error) {
                safeLog("connection", "Lỗi khi đăng ký nhận thông báo:", error.message || 'Không rõ lỗi');
            }
        }
    },
    
    core_unpaired: function(core_) {
        core = null;
        svc_status.set_status("Đã ngắt kết nối với Roon Core", true);
        safeLog("connection", "Đã ngắt kết nối với Roon Core!");
    }
});

// Thêm Roon API Status Service
var svc_status = new RoonApiStatus(roon);

// Khởi tạo Roon API Transport Service
var svc_transport = new RoonApiTransport(roon);

// Sự kiện khi kết nối với Roon Core
roon.init_services({
    required_services: [RoonApiTransport, RoonApiImage],
    provided_services: [svc_status],
});

// Cập nhật thông tin định kỳ để đảm bảo không bỏ lỡ sự kiện
setInterval(() => {
    if (core && core.services && core.services.RoonApiTransport) {
        core.services.RoonApiTransport.get_zones((error, zones) => {
            if (!error && zones) {
                handleStatusChange(core.services.RoonApiTransport, zones);
            }
        });
    }
}, config.update.interval);

// Khởi động Roon API Discovery
roon.start_discovery();

safeLog("connection", "Plugin đã khởi động");
safeLog("connection", "Đang tìm kiếm Roon Core...");
safeLog("connection", `Thông tin bài hát sẽ được lưu vào thư mục: ${outputDir}`);

// Hàm đệ quy để vô hiệu hóa các hàm log trong một đối tượng
function disableLoggingInObject(obj, visited = new Set()) {
    if (!obj || typeof obj !== 'object' || visited.has(obj)) return;
    visited.add(obj);
    
    // Danh sách các tên hàm log cần vô hiệu hóa
    const logFunctionNames = ['log', 'debug', 'info', 'warn', 'error', 'trace', 'print', 'write_log'];
    
    // Duyệt qua tất cả các thuộc tính của đối tượng
    for (const key in obj) {
        try {
            const value = obj[key];
            
            // Nếu là hàm và tên nằm trong danh sách log functions
            if (typeof value === 'function' && logFunctionNames.some(name => key.toLowerCase().includes(name))) {
                obj[key] = function() { return; }; // Thay thế bằng hàm rỗng
            }
            // Nếu là đối tượng, đệ quy vào bên trong
            else if (value && typeof value === 'object' && !visited.has(value)) {
                disableLoggingInObject(value, visited);
            }
        } catch (e) {
            // Bỏ qua lỗi khi truy cập thuộc tính
        }
    }
}

// Vô hiệu hóa logging trong RoonApi và các module liên quan
disableLoggingInObject(RoonApi);
disableLoggingInObject(RoonApiStatus);
disableLoggingInObject(RoonApiTransport);
disableLoggingInObject(RoonApiImage); 