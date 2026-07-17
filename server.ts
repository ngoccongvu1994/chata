import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { User, Room, Message } from './src/types';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  deleteDoc, 
  updateDoc 
} from 'firebase/firestore';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Enable CORS
app.use(cors());

// Enable JSON body parsing with large limit for potential base64 or heavy content
app.use(express.json({ limit: '10mb' }));

// Directories
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// --- INITIALIZE FIREBASE FIRESTORE ---
const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
let firebaseApp: any;
let db: any;

let firebaseConfig: any = null;

if (process.env.FIREBASE_CONFIG) {
  try {
    firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG);
  } catch (err) {
    console.error('Lỗi phân tích FIREBASE_CONFIG env:', err);
  }
} else if (fs.existsSync(configPath)) {
  try {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (err) {
    console.error('Lỗi đọc firebase-applet-config.json:', err);
  }
}

if (firebaseConfig) {
  try {
    firebaseApp = initializeApp(firebaseConfig);
    db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId || '(default)');
    console.log('Firebase initialized successfully with project:', firebaseConfig.projectId);
  } catch (error) {
    console.error('Lỗi khi khởi tạo Firebase:', error);
  }
} else {
  console.warn('CẢNH BÁO: Không tìm thấy cấu hình Firebase (FIREBASE_CONFIG env hoặc firebase-applet-config.json)!');
}

// --- SEED FIREBASE CODES ---
async function seedFirestoreIfNeeded() {
  if (!db) return;
  try {
    // Check if rooms exist
    const roomsRef = collection(db, 'rooms');
    const roomsSnap = await getDocs(roomsRef);
    if (roomsSnap.empty) {
      console.log('Seeding default rooms...');
      const defaultRooms = [
        { id: 'room-general', name: '💬 Phòng Chung', description: 'Nơi thảo luận chung của mọi người', createdBy: 'admin-id', createdAt: new Date().toISOString(), isPrivate: false, allowedUserIds: [] },
        { id: 'room-announcements', name: '📢 Thông Báo Quan Trọng', description: 'Các thông báo quan trọng từ Admin', createdBy: 'admin-id', createdAt: new Date().toISOString(), isPrivate: false, allowedUserIds: [] },
        { id: 'room-media', name: '🎬 Kho Ảnh & Video', description: 'Nơi lưu trữ và chia sẻ file đa phương tiện', createdBy: 'admin-id', createdAt: new Date().toISOString(), isPrivate: false, allowedUserIds: [] }
      ];
      for (const r of defaultRooms) {
        await setDoc(doc(db, 'rooms', r.id), r);
      }
    }

    // Check if users exist
    const usersRef = collection(db, 'users');
    const usersSnap = await getDocs(usersRef);
    if (usersSnap.empty) {
      console.log('Seeding default users...');
      const defaultUsers = [
        {
          id: 'admin-id',
          username: 'admin',
          name: 'Hệ Thống Admin',
          role: 'admin',
          createdAt: new Date().toISOString(),
          passwordHash: 'admin123'
        },
        {
          id: 'user1-id',
          username: 'user1',
          name: 'Phòng Kinh Doanh',
          role: 'user',
          createdAt: new Date().toISOString(),
          passwordHash: 'user123'
        },
        {
          id: 'user2-id',
          username: 'user2',
          name: 'Phòng Kỹ Thuật',
          role: 'user',
          createdAt: new Date().toISOString(),
          passwordHash: 'user123'
        }
      ];
      for (const u of defaultUsers) {
        await setDoc(doc(db, 'users', u.id), u);
      }
    }

    // Check if welcome message exists
    const msgsRef = collection(db, 'messages');
    const msgsSnap = await getDocs(msgsRef);
    if (msgsSnap.empty) {
      console.log('Seeding default welcome message...');
      const welcomeMsg = {
        id: 'msg-welcome',
        roomId: 'room-general',
        senderId: 'admin-id',
        senderName: 'Hệ Thống Admin',
        senderRole: 'admin',
        type: 'text',
        content: 'Chào mừng tất cả mọi người đến với hệ thống Chata! Đây là kênh chung, lịch sử chat được lưu trữ an toàn trên đám mây.',
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'messages', welcomeMsg.id), welcomeMsg);
    }
  } catch (error) {
    console.error('Lỗi khi seed dữ liệu lên Firestore:', error);
  }
}

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
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ tài khoản và mật khẩu' });
    return;
  }

  try {
    const q = query(collection(db, 'users'), where('username', '==', username.toLowerCase()));
    const snap = await getDocs(q);
    if (snap.empty) {
      res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' });
      return;
    }

    const userDoc = snap.docs[0].data();
    if (userDoc.passwordHash !== password) {
      res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' });
      return;
    }

    const userObj: User = {
      id: userDoc.id,
      username: userDoc.username,
      name: userDoc.name,
      role: userDoc.role,
      createdAt: userDoc.createdAt
    };

    // Generate session token
    const token = 'sess_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    SESSIONS.set(token, userObj);

    res.json({
      token,
      user: userObj
    });
  } catch (error) {
    console.error('Lỗi đăng nhập:', error);
    res.status(500).json({ error: 'Lỗi máy chủ xác thực' });
  }
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
app.get('/api/users', authenticate, async (req, res) => {
  try {
    const snap = await getDocs(collection(db, 'users'));
    const users = snap.docs.map(d => {
      const data = d.data();
      return {
        id: data.id,
        username: data.username,
        name: data.name,
        role: data.role,
        createdAt: data.createdAt
      };
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Lỗi tải danh sách người dùng' });
  }
});

app.post('/api/users', authenticate, adminOnly, async (req, res) => {
  const { username, password, name, role } = req.body;
  if (!username || !password || !name || !role) {
    res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ thông tin: username, password, name, role' });
    return;
  }

  try {
    const q = query(collection(db, 'users'), where('username', '==', username.toLowerCase()));
    const snap = await getDocs(q);
    if (!snap.empty) {
      res.status(400).json({ error: 'Tên đăng nhập đã tồn tại trên hệ thống' });
      return;
    }

    const newUserId = 'user_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    const newUserDoc = {
      id: newUserId,
      username: username.toLowerCase(),
      name,
      role: role as 'admin' | 'user',
      createdAt: new Date().toISOString(),
      passwordHash: password
    };

    await setDoc(doc(db, 'users', newUserId), newUserDoc);

    const newUserObj: User = {
      id: newUserId,
      username: newUserDoc.username,
      name: newUserDoc.name,
      role: newUserDoc.role,
      createdAt: newUserDoc.createdAt
    };

    res.status(201).json(newUserObj);
  } catch (err) {
    res.status(500).json({ error: 'Lỗi thêm người dùng mới' });
  }
});

app.delete('/api/users/:id', authenticate, adminOnly, async (req, res) => {
  const userId = req.params.id;
  if (userId === 'admin-id') {
    res.status(400).json({ error: 'Không thể xóa tài khoản Admin gốc của hệ thống' });
    return;
  }

  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      res.status(404).json({ error: 'Không tìm thấy người dùng' });
      return;
    }

    await deleteDoc(userRef);
    res.json({ success: true, message: 'Đã xóa người dùng thành công' });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi khi xóa người dùng' });
  }
});

// Update user password (Admin can do for anyone, or user can update their own)
app.post('/api/users/:id/change-password', authenticate, async (req, res) => {
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

  try {
    const userRef = doc(db, 'users', targetUserId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      res.status(404).json({ error: 'Không tìm thấy người dùng' });
      return;
    }

    await updateDoc(userRef, { passwordHash: newPassword });
    res.json({ success: true, message: 'Đổi mật khẩu thành công' });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi đổi mật khẩu' });
  }
});

// 3. Rooms Endpoints
app.get('/api/rooms', authenticate, async (req, res) => {
  const user = (req as any).user as User;
  
  try {
    const snap = await getDocs(collection(db, 'rooms'));
    const allRooms = snap.docs.map(d => d.data() as Room);

    // Filter rooms that user is allowed to access
    const visibleRooms = allRooms.filter(room => {
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
  } catch (err) {
    res.status(500).json({ error: 'Lỗi tải danh sách phòng' });
  }
});

app.post('/api/rooms', authenticate, async (req, res) => {
  const { name, description, isPrivate, allowedUserIds } = req.body;
  const user = (req as any).user as User;

  if (!name || name.trim() === '') {
    res.status(400).json({ error: 'Tên phòng không được bỏ trống' });
    return;
  }

  try {
    const newRoomId = 'room_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    const newRoom: Room = {
      id: newRoomId,
      name: name.trim(),
      description: (description || '').trim(),
      createdBy: user.id,
      createdAt: new Date().toISOString(),
      isPrivate: typeof isPrivate === 'boolean' ? isPrivate : false,
      allowedUserIds: Array.isArray(allowedUserIds) ? allowedUserIds : []
    };

    await setDoc(doc(db, 'rooms', newRoomId), newRoom);
    res.status(201).json(newRoom);
  } catch (err) {
    res.status(500).json({ error: 'Lỗi tạo phòng trò chuyện' });
  }
});

app.put('/api/rooms/:id/allowed-users', authenticate, async (req, res) => {
  const roomId = req.params.id;
  const { allowedUserIds, isPrivate } = req.body;
  const user = (req as any).user as User;

  try {
    const roomRef = doc(db, 'rooms', roomId);
    const roomSnap = await getDoc(roomRef);
    if (!roomSnap.exists()) {
      res.status(404).json({ error: 'Không tìm thấy phòng trò chuyện' });
      return;
    }

    const room = roomSnap.data() as Room;

    // Only Admin or the Room Creator can update room access settings
    if (user.role !== 'admin' && room.createdBy !== user.id) {
      res.status(403).json({ error: 'Bạn không có quyền chỉnh sửa cài đặt của kênh chat này' });
      return;
    }

    const updates: Partial<Room> = {};
    if (Array.isArray(allowedUserIds)) {
      updates.allowedUserIds = allowedUserIds;
    }
    if (typeof isPrivate === 'boolean') {
      updates.isPrivate = isPrivate;
    }

    await updateDoc(roomRef, updates);
    res.json({ success: true, room: { ...room, ...updates } });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi cập nhật phân quyền phòng' });
  }
});

app.delete('/api/rooms/:id', authenticate, async (req, res) => {
  const roomId = req.params.id;
  const user = (req as any).user as User;

  if (roomId === 'room-general') {
    res.status(400).json({ error: 'Không thể xóa phòng trò chuyện mặc định' });
    return;
  }

  try {
    const roomRef = doc(db, 'rooms', roomId);
    const roomSnap = await getDoc(roomRef);
    if (!roomSnap.exists()) {
      res.status(404).json({ error: 'Không tìm thấy phòng' });
      return;
    }

    const room = roomSnap.data() as Room;
    
    // Only Admin or Room Creator can delete a room
    if (user.role !== 'admin' && room.createdBy !== user.id) {
      res.status(403).json({ error: 'Bạn không có quyền xóa phòng trò chuyện này' });
      return;
    }

    await deleteDoc(roomRef);

    // Clean up room messages in Firestore
    const q = query(collection(db, 'messages'), where('roomId', '==', roomId));
    const msgSnaps = await getDocs(q);
    for (const d of msgSnaps.docs) {
      await deleteDoc(doc(db, 'messages', d.id));
    }

    res.json({ success: true, message: 'Đã xóa phòng trò chuyện thành công' });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi xóa phòng trò chuyện' });
  }
});

// 4. Messages Endpoints
app.get('/api/rooms/:roomId/messages', authenticate, async (req, res) => {
  const roomId = req.params.roomId;
  const user = (req as any).user as User;

  try {
    const roomSnap = await getDoc(doc(db, 'rooms', roomId));
    if (!roomSnap.exists()) {
      res.status(404).json({ error: 'Không tìm thấy phòng trò chuyện' });
      return;
    }

    const room = roomSnap.data() as Room;

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

    const q = query(collection(db, 'messages'), where('roomId', '==', roomId));
    const msgSnaps = await getDocs(q);
    const roomMessages = msgSnaps.docs.map(d => d.data() as Message);
    
    // Sort roomMessages by createdAt ascending
    roomMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    res.json(roomMessages);
  } catch (err) {
    res.status(500).json({ error: 'Lỗi tải danh sách tin nhắn' });
  }
});

app.post('/api/rooms/:roomId/messages', authenticate, async (req, res) => {
  const roomId = req.params.roomId;
  const { content } = req.body;
  const user = (req as any).user as User;

  try {
    const roomSnap = await getDoc(doc(db, 'rooms', roomId));
    if (!roomSnap.exists()) {
      res.status(404).json({ error: 'Không tìm thấy phòng trò chuyện' });
      return;
    }

    const room = roomSnap.data() as Room;

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

    const newMessageId = 'msg_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    const newMessage: Message = {
      id: newMessageId,
      roomId,
      senderId: user.id,
      senderName: user.name,
      senderRole: user.role,
      type: 'text',
      content: content,
      createdAt: new Date().toISOString()
    };

    await setDoc(doc(db, 'messages', newMessageId), newMessage);
    res.status(201).json(newMessage);
  } catch (err) {
    res.status(500).json({ error: 'Lỗi gửi tin nhắn' });
  }
});

// 5. High-Speed Upload API (Image/Video)
app.post('/api/rooms/:roomId/upload', authenticate, upload.single('file'), async (req, res) => {
  const roomId = req.params.roomId;
  const user = (req as any).user as User;
  const file = req.file;

  try {
    const roomSnap = await getDoc(doc(db, 'rooms', roomId));
    if (!roomSnap.exists()) {
      res.status(404).json({ error: 'Không tìm thấy phòng trò chuyện' });
      return;
    }

    const room = roomSnap.data() as Room;

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

    const newMessageId = 'msg_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    const newMessage: Message = {
      id: newMessageId,
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

    await setDoc(doc(db, 'messages', newMessageId), newMessage);
    res.status(201).json(newMessage);
  } catch (err) {
    res.status(500).json({ error: 'Lỗi tải lên tệp tin' });
  }
});

// Delete message (Admin Only)
app.delete('/api/messages/:id', authenticate, adminOnly, async (req, res) => {
  const messageId = req.params.id;

  try {
    const msgRef = doc(db, 'messages', messageId);
    const msgSnap = await getDoc(msgRef);
    if (!msgSnap.exists()) {
      res.status(404).json({ error: 'Không tìm thấy tin nhắn' });
      return;
    }

    const msg = msgSnap.data() as Message;

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

    await deleteDoc(msgRef);
    res.json({ success: true, message: 'Đã xóa tin nhắn thành công' });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi khi xóa tin nhắn' });
  }
});


// --- INTEGRATE VITE FOR FE ASSETS SERVING ---
async function startServer() {
  // Seed database safely without blocking startup if there are connection issues
  try {
    console.log('Bắt đầu kiểm tra và seed dữ liệu Firestore...');
    await seedFirestoreIfNeeded();
    console.log('Hoàn thành kiểm tra/seed dữ liệu Firestore.');
  } catch (err) {
    console.error('Lỗi khi seed dữ liệu Firestore:', err);
  }

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
      if (req.url.startsWith('/api')) {
        res.status(404).json({ error: 'Endpoint không tồn tại' });
        return;
      }
      if (req.url.startsWith('/uploads')) {
        return next();
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

if (!process.env.VERCEL) {
  startServer();
} else {
  // For Vercel Serverless, run the seed synchronously or let it run in background
  seedFirestoreIfNeeded().catch(console.error);
}

export default app;
