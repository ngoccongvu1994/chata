import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { User, Room, Message } from './src/types';

const app = express();
const PORT = 3000;

// Enable JSON body parsing with large limit for potential base64 or heavy content
app.use(express.json({ limit: '10mb' }));

// Directories
const DATA_DIR = path.join(process.cwd(), 'data');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

// --- DATABASE IN-MEMORY CACHE WITH FILE SYNC ---

// Initial/default accounts
// Password is stored directly (simple secure demo hash or clean text for direct admin visibility)
interface UserRecord {
  user: User;
  passwordHash: string; // we can use simple plain text for this local prototype
}

let userRecords: UserRecord[] = [];
let roomsList: Room[] = [];
let messagesList: Message[] = [];

// Helper functions to load/save
function loadDB() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      userRecords = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    } else {
      // Default accounts
      userRecords = [
        {
          user: { id: 'admin-id', username: 'admin', name: 'Hệ Thống Admin', role: 'admin', createdAt: new Date().toISOString() },
          passwordHash: 'admin123'
        },
        {
          user: { id: 'user1-id', username: 'user1', name: 'Phòng Kinh Doanh', role: 'user', createdAt: new Date().toISOString() },
          passwordHash: 'user123'
        },
        {
          user: { id: 'user2-id', username: 'user2', name: 'Phòng Kỹ Thuật', role: 'user', createdAt: new Date().toISOString() },
          passwordHash: 'user123'
        }
      ];
      fs.writeFileSync(USERS_FILE, JSON.stringify(userRecords, null, 2), 'utf-8');
    }

    if (fs.existsSync(ROOMS_FILE)) {
      roomsList = JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf-8'));
    } else {
      // Default rooms
      roomsList = [
        { id: 'room-general', name: '💬 Phòng Chung', description: 'Nơi thảo luận chung của mọi người', createdBy: 'admin-id', createdAt: new Date().toISOString() },
        { id: 'room-announcements', name: '📢 Thông Báo Quan Trọng', description: 'Các thông báo quan trọng từ Admin', createdBy: 'admin-id', createdAt: new Date().toISOString() },
        { id: 'room-media', name: '🎬 Kho Ảnh & Video', description: 'Nơi lưu trữ và chia sẻ file đa phương tiện', createdBy: 'admin-id', createdAt: new Date().toISOString() }
      ];
      fs.writeFileSync(ROOMS_FILE, JSON.stringify(roomsList, null, 2), 'utf-8');
    }

    if (fs.existsSync(MESSAGES_FILE)) {
      messagesList = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf-8'));
    } else {
      messagesList = [
        {
          id: 'msg-welcome',
          roomId: 'room-general',
          senderId: 'admin-id',
          senderName: 'Hệ Thống Admin',
          senderRole: 'admin',
          type: 'text',
          content: 'Chào mừng tất cả mọi người đến với hệ thống Chata! Đây là kênh chung, lịch sử chat được lưu trữ an toàn trên đám mây.',
          createdAt: new Date().toISOString()
        }
      ];
      fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messagesList, null, 2), 'utf-8');
    }
  } catch (error) {
    console.error('Lỗi khi tải cơ sở dữ liệu:', error);
  }
}

function saveUsers() {
  fs.writeFileSync(USERS_FILE, JSON.stringify(userRecords, null, 2), 'utf-8');
}

function saveRooms() {
  fs.writeFileSync(ROOMS_FILE, JSON.stringify(roomsList, null, 2), 'utf-8');
}

function saveMessages() {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messagesList, null, 2), 'utf-8');
}

loadDB();

// --- SESSION MANAGER ---
const SESSIONS = new Map<string, User>();

// --- MULTER STORAGE SETUP ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  }
});

// Serve uploaded static files with correct cache-control and headers
app.use('/uploads', express.static(UPLOADS_DIR, {
  maxAge: '31536000',
  setHeaders: (res, filePath) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}));

// --- MIDDLEWARES ---
function authenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Không tìm thấy token xác thực' });
    return;
  }
  const token = authHeader.split(' ')[1];
  const user = SESSIONS.get(token);
  if (!user) {
    res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ' });
    return;
  }
  (req as any).user = user;
  next();
}

function adminOnly(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = (req as any).user as User;
  if (user.role !== 'admin') {
    res.status(403).json({ error: 'Quyền truy cập bị từ chối. Chỉ dành cho Admin.' });
    return;
  }
  next();
}

// --- API ENDPOINTS ---

// 1. Auth Endpoint
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ tài khoản và mật khẩu' });
    return;
  }

  const record = userRecords.find(u => u.user.username.toLowerCase() === username.toLowerCase());
  if (!record || record.passwordHash !== password) {
    res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    return;
  }

  // Generate session token
  const token = 'sess_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
  SESSIONS.set(token, record.user);

  res.json({
    token,
    user: record.user
  });
});

// Logout
app.post('/api/auth/logout', authenticate, (req, res) => {
  const authHeader = req.headers.authorization!;
  const token = authHeader.split(' ')[1];
  SESSIONS.delete(token);
  res.json({ success: true });
});

// Get self info
app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({ user: (req as any).user });
});

// 2. Users Management (All Authenticated users can list; Admin Only can create/delete)
app.get('/api/users', authenticate, (req, res) => {
  res.json(userRecords.map(r => r.user));
});

app.post('/api/users', authenticate, adminOnly, (req, res) => {
  const { username, password, name, role } = req.body;
  if (!username || !password || !name || !role) {
    res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ thông tin: username, password, name, role' });
    return;
  }

  const exists = userRecords.some(r => r.user.username.toLowerCase() === username.toLowerCase());
  if (exists) {
    res.status(400).json({ error: 'Tên đăng nhập đã tồn tại trên hệ thống' });
    return;
  }

  const newUser: User = {
    id: 'user_' + Math.random().toString(36).substring(2) + Date.now().toString(36),
    username,
    name,
    role: role as 'admin' | 'user',
    createdAt: new Date().toISOString()
  };

  userRecords.push({
    user: newUser,
    passwordHash: password
  });

  saveUsers();
  res.status(201).json(newUser);
});

app.delete('/api/users/:id', authenticate, adminOnly, (req, res) => {
  const userId = req.params.id;
  if (userId === 'admin-id') {
    res.status(400).json({ error: 'Không thể xóa tài khoản Admin gốc của hệ thống' });
    return;
  }

  const index = userRecords.findIndex(r => r.user.id === userId);
  if (index === -1) {
    res.status(404).json({ error: 'Không tìm thấy người dùng' });
    return;
  }

  userRecords.splice(index, 1);
  saveUsers();
  res.json({ success: true, message: 'Đã xóa người dùng thành công' });
});

// Update user password (Admin can do for anyone, or user can update their own)
app.post('/api/users/:id/change-password', authenticate, (req, res) => {
  const targetUserId = req.params.id;
  const { newPassword } = req.body;
  const currentUser = (req as any).user as User;

  if (currentUser.role !== 'admin' && currentUser.id !== targetUserId) {
    res.status(403).json({ error: 'Bạn không có quyền đổi mật khẩu cho tài khoản này' });
    return;
  }

  if (!newPassword || newPassword.length < 4) {
    res.status(400).json({ error: 'Mật khẩu mới phải từ 4 ký tự trở lên' });
    return;
  }

  const record = userRecords.find(r => r.user.id === targetUserId);
  if (!record) {
    res.status(404).json({ error: 'Không tìm thấy người dùng' });
    return;
  }

  record.passwordHash = newPassword;
  saveUsers();
  res.json({ success: true, message: 'Đổi mật khẩu thành công' });
});

// 3. Rooms Endpoints
app.get('/api/rooms', authenticate, (req, res) => {
  const user = (req as any).user as User;
  
  // Filter rooms that user is allowed to access
  const visibleRooms = roomsList.filter(room => {
    // Admin can see everything
    if (user.role === 'admin') return true;
    
    // Default general room is public
    if (room.id === 'room-general') return true;
    
    // Room creator can always see their room
    if (room.createdBy === user.id) return true;
    
    // Check if the room is private
    const isPrivate = room.isPrivate || (room.allowedUserIds && room.allowedUserIds.length > 0);
    if (isPrivate) {
      return Array.isArray(room.allowedUserIds) && room.allowedUserIds.includes(user.id);
    }
    
    // Public rooms are visible to everyone
    return true;
  });

  res.json(visibleRooms);
});

app.post('/api/rooms', authenticate, (req, res) => {
  const { name, description, isPrivate, allowedUserIds } = req.body;
  const user = (req as any).user as User;

  if (!name || name.trim() === '') {
    res.status(400).json({ error: 'Tên phòng không được bỏ trống' });
    return;
  }

  const newRoom: Room = {
    id: 'room_' + Math.random().toString(36).substring(2) + Date.now().toString(36),
    name: name.trim(),
    description: (description || '').trim(),
    createdBy: user.id,
    createdAt: new Date().toISOString(),
    isPrivate: typeof isPrivate === 'boolean' ? isPrivate : false,
    allowedUserIds: Array.isArray(allowedUserIds) ? allowedUserIds : []
  };

  roomsList.push(newRoom);
  saveRooms();
  res.status(201).json(newRoom);
});

app.put('/api/rooms/:id/allowed-users', authenticate, (req, res) => {
  const roomId = req.params.id;
  const { allowedUserIds, isPrivate } = req.body;
  const user = (req as any).user as User;

  const room = roomsList.find(r => r.id === roomId);
  if (!room) {
    res.status(404).json({ error: 'Không tìm thấy phòng trò chuyện' });
    return;
  }

  // Only Admin or the Room Creator can update room access settings
  if (user.role !== 'admin' && room.createdBy !== user.id) {
    res.status(403).json({ error: 'Bạn không có quyền chỉnh sửa cài đặt của kênh chat này' });
    return;
  }

  if (Array.isArray(allowedUserIds)) {
    room.allowedUserIds = allowedUserIds;
  }

  if (typeof isPrivate === 'boolean') {
    room.isPrivate = isPrivate;
  }

  saveRooms();
  res.json({ success: true, room });
});

app.delete('/api/rooms/:id', authenticate, (req, res) => {
  const roomId = req.params.id;
  const user = (req as any).user as User;

  if (roomId === 'room-general') {
    res.status(400).json({ error: 'Không thể xóa phòng trò chuyện mặc định' });
    return;
  }

  const index = roomsList.findIndex(r => r.id === roomId);
  if (index === -1) {
    res.status(404).json({ error: 'Không tìm thấy phòng' });
    return;
  }

  const room = roomsList[index];
  
  // Only Admin or Room Creator can delete a room
  if (user.role !== 'admin' && room.createdBy !== user.id) {
    res.status(403).json({ error: 'Bạn không có quyền xóa phòng trò chuyện này' });
    return;
  }

  roomsList.splice(index, 1);
  saveRooms();

  // Optionally clean up room messages
  messagesList = messagesList.filter(m => m.roomId !== roomId);
  saveMessages();

  res.json({ success: true, message: 'Đã xóa phòng trò chuyện thành công' });
});

// 4. Messages Endpoints
app.get('/api/rooms/:roomId/messages', authenticate, (req, res) => {
  const roomId = req.params.roomId;
  const user = (req as any).user as User;

  const room = roomsList.find(r => r.id === roomId);
  if (!room) {
    res.status(404).json({ error: 'Không tìm thấy phòng trò chuyện' });
    return;
  }

  // Check access permission
  const isPrivate = room.isPrivate || (room.allowedUserIds && room.allowedUserIds.length > 0);
  const isAllowed = 
    user.role === 'admin' ||
    room.id === 'room-general' ||
    room.createdBy === user.id ||
    !isPrivate ||
    (room.allowedUserIds && room.allowedUserIds.includes(user.id));

  if (!isAllowed) {
    res.status(403).json({ error: 'Bạn không có quyền truy cập kênh trò chuyện này' });
    return;
  }

  const roomMessages = messagesList.filter(m => m.roomId === roomId);
  res.json(roomMessages);
});

app.post('/api/rooms/:roomId/messages', authenticate, (req, res) => {
  const roomId = req.params.roomId;
  const { content } = req.body;
  const user = (req as any).user as User;

  const room = roomsList.find(r => r.id === roomId);
  if (!room) {
    res.status(404).json({ error: 'Không tìm thấy phòng trò chuyện' });
    return;
  }

  // Check access permission
  const isPrivate = room.isPrivate || (room.allowedUserIds && room.allowedUserIds.length > 0);
  const isAllowed = 
    user.role === 'admin' ||
    room.id === 'room-general' ||
    room.createdBy === user.id ||
    !isPrivate ||
    (room.allowedUserIds && room.allowedUserIds.includes(user.id));

  if (!isAllowed) {
    res.status(403).json({ error: 'Bạn không có quyền gửi tin nhắn vào kênh này' });
    return;
  }

  if (!content || content.trim() === '') {
    res.status(400).json({ error: 'Nội dung tin nhắn không được bỏ trống' });
    return;
  }

  const newMessage: Message = {
    id: 'msg_' + Math.random().toString(36).substring(2) + Date.now().toString(36),
    roomId,
    senderId: user.id,
    senderName: user.name,
    senderRole: user.role,
    type: 'text',
    content: content,
    createdAt: new Date().toISOString()
  };

  messagesList.push(newMessage);
  saveMessages();
  res.status(201).json(newMessage);
});

// 5. High-Speed Upload API (Image/Video)
app.post('/api/rooms/:roomId/upload', authenticate, upload.single('file'), (req, res) => {
  const roomId = req.params.roomId;
  const user = (req as any).user as User;
  const file = req.file;

  const room = roomsList.find(r => r.id === roomId);
  if (!room) {
    res.status(404).json({ error: 'Không tìm thấy phòng trò chuyện' });
    return;
  }

  // Check access permission
  const isPrivate = room.isPrivate || (room.allowedUserIds && room.allowedUserIds.length > 0);
  const isAllowed = 
    user.role === 'admin' ||
    room.id === 'room-general' ||
    room.createdBy === user.id ||
    !isPrivate ||
    (room.allowedUserIds && room.allowedUserIds.includes(user.id));

  if (!isAllowed) {
    res.status(403).json({ error: 'Bạn không có quyền đăng tải tệp vào kênh này' });
    return;
  }

  if (!file) {
    res.status(400).json({ error: 'Không tìm thấy file tải lên' });
    return;
  }

  // Detect file type
  let msgType: 'image' | 'video' = 'image';
  if (file.mimetype.startsWith('video/')) {
    msgType = 'video';
  } else if (!file.mimetype.startsWith('image/')) {
    res.status(400).json({ error: 'Hệ thống chỉ hỗ trợ gửi hình ảnh và video chất lượng cao' });
    return;
  }

  const fileUrl = `/uploads/${file.filename}`;
  const fileSizeMb = (file.size / (1024 * 1024)).toFixed(2);

  const newMessage: Message = {
    id: 'msg_' + Math.random().toString(36).substring(2) + Date.now().toString(36),
    roomId,
    senderId: user.id,
    senderName: user.name,
    senderRole: user.role,
    type: msgType,
    content: msgType === 'image' ? 'Đã gửi một hình ảnh' : 'Đã gửi một video',
    fileUrl,
    fileName: file.originalname,
    fileSize: `${fileSizeMb} MB`,
    createdAt: new Date().toISOString()
  };

  messagesList.push(newMessage);
  saveMessages();
  res.status(201).json(newMessage);
});

// Delete message (Admin Only)
app.delete('/api/messages/:id', authenticate, adminOnly, (req, res) => {
  const messageId = req.params.id;
  const index = messagesList.findIndex(m => m.id === messageId);
  if (index === -1) {
    res.status(404).json({ error: 'Không tìm thấy tin nhắn' });
    return;
  }

  const msg = messagesList[index];

  // If message had an uploaded file, we can optionally delete the actual file
  if (msg.fileUrl) {
    const filename = msg.fileUrl.replace('/uploads/', '');
    const filepath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(filepath)) {
      try {
        fs.unlinkSync(filepath);
      } catch (err) {
        console.error('Lỗi khi xóa file đính kèm:', err);
      }
    }
  }

  messagesList.splice(index, 1);
  saveMessages();
  res.json({ success: true, message: 'Đã xóa tin nhắn thành công' });
});


// --- INTEGRATE VITE FOR FE ASSETS SERVING ---
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Support wildcard routing for React SPA
    app.get('*', (req, res, next) => {
      // Don't intercept API or uploaded file requests
      if (req.url.startsWith('/api') || req.url.startsWith('/uploads')) {
        return next();
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
