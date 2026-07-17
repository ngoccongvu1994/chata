import { useState, useEffect } from 'react';
import { User, Room } from './types';
import Login from './components/Login';
import ChatRoom from './components/ChatRoom';
import AdminPanel from './components/AdminPanel';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('chat_token'));
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [currentScreen, setCurrentScreen] = useState<'login' | 'chat' | 'admin'>('login');
  const [appLoading, setAppLoading] = useState(true);

  // Validate session on startup
  useEffect(() => {
    const validateSession = async () => {
      const storedToken = localStorage.getItem('chat_token');
      if (!storedToken) {
        setAppLoading(false);
        return;
      }

      try {
        const response = await fetch('/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${storedToken}`
          }
        });
        const data = await response.json();

        if (response.ok && data.user) {
          setCurrentUser(data.user);
          setToken(storedToken);
          setCurrentScreen('chat');
          // Fetch rooms
          await fetchRooms(storedToken);
        } else {
          // Clear invalid session
          handleLogout();
        }
      } catch (err) {
        console.error('Không thể kết nối đến máy chủ bảo mật:', err);
        // Fallback: trust local storage if offline or temporary backend reboot
        const storedUser = localStorage.getItem('chat_user');
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
          setCurrentUser(parsedUser);
          setCurrentScreen('chat');
          fetchRooms(storedToken);
        } else {
          handleLogout();
        }
      } finally {
        setAppLoading(false);
      }
    };

    validateSession();
  }, []);

  // Fetch rooms list
  const fetchRooms = async (authToken: string) => {
    try {
      const response = await fetch('/api/rooms', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      const data = await response.json();
      if (response.ok && Array.isArray(data)) {
        setRooms(data);
        if (data.length > 0 && !currentRoomId) {
          // Pick default room (General)
          const generalRoom = data.find((r: Room) => r.id === 'room-general');
          setCurrentRoomId(generalRoom ? generalRoom.id : data[0].id);
        }
      }
    } catch (err) {
      console.error('Lỗi tải danh sách phòng:', err);
    }
  };

  const handleLoginSuccess = async (newToken: string, user: User) => {
    localStorage.setItem('chat_token', newToken);
    localStorage.setItem('chat_user', JSON.stringify(user));
    setToken(newToken);
    setCurrentUser(user);
    setCurrentScreen('chat');
    await fetchRooms(newToken);
  };

  const handleLogout = async () => {
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      } catch (e) {
        // ignore
      }
    }
    localStorage.removeItem('chat_token');
    localStorage.removeItem('chat_user');
    setToken(null);
    setCurrentUser(null);
    setRooms([]);
    setCurrentRoomId(null);
    setCurrentScreen('login');
  };

  // Helper to refresh rooms from children
  const handleRefreshRooms = () => {
    if (token) {
      fetchRooms(token);
    }
  };

  // Render initial app loading screen
  if (appLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-[#F5F5F0] text-[#424235] p-6">
        <div className="relative flex items-center justify-center w-14 h-14 bg-[#5A5A40] rounded-2xl shadow-xl animate-pulse mb-4">
          <span className="text-white font-bold text-xl serif italic">S</span>
        </div>
        <p className="text-xs font-semibold text-[#5A5A40] tracking-widest uppercase opacity-80">Đang khởi động hệ thống bảo mật...</p>
      </div>
    );
  }

  return (
    <div className="chat-container max-w-md mx-auto md:max-w-none md:bg-[#E8E8E1] flex justify-center items-center">
      {/* 
        This wrapper mimics a native phone layout on desktop viewport sizes,
        giving the application an incredibly premium feels!
      */}
      <div className="w-full h-full md:max-w-[430px] md:h-[860px] md:rounded-[40px] md:shadow-2xl md:border-[10px] md:border-[#5A5A40] md:overflow-hidden bg-[#F5F5F0] relative flex flex-col">
        
        <AnimatePresence mode="wait">
          {currentScreen === 'login' && (
            <motion.div
              key="login-screen"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="w-full h-full"
            >
              <Login onLoginSuccess={handleLoginSuccess} />
            </motion.div>
          )}

          {currentScreen === 'chat' && currentUser && (
            <motion.div
              key="chat-screen"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25 }}
              className="w-full h-full"
            >
              <ChatRoom
                token={token!}
                currentUser={currentUser}
                onLogout={handleLogout}
                onOpenAdmin={() => setCurrentScreen('admin')}
                rooms={rooms}
                currentRoomId={currentRoomId}
                onSelectRoom={(roomId) => setCurrentRoomId(roomId)}
                onRefreshRooms={handleRefreshRooms}
              />
            </motion.div>
          )}

          {currentScreen === 'admin' && currentUser && currentUser.role === 'admin' && (
            <motion.div
              key="admin-screen"
              initial={{ opacity: 0, x: 200 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 200 }}
              transition={{ type: 'spring', damping: 24, stiffness: 220 }}
              className="w-full h-full"
            >
              <AdminPanel
                token={token!}
                onBack={() => setCurrentScreen('chat')}
                rooms={rooms}
                onRefreshRooms={handleRefreshRooms}
              />
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
