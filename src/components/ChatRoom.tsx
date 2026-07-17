import React, { useState, useEffect, useRef } from 'react';
import {
  LogOut, Menu, Send, Image as ImageIcon, Film, X, Shield, RefreshCw, 
  Trash2, Plus, Sparkles, FolderArchive, ArrowLeft, Download, Maximize2,
  Settings, Lock, Unlock, Users, Globe
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Room, Message } from '../types';

interface ChatRoomProps {
  token: string;
  currentUser: User;
  onLogout: () => void;
  onOpenAdmin: () => void;
  rooms: Room[];
  currentRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
  onRefreshRooms: () => void;
}

export default function ChatRoom({
  token,
  currentUser,
  onLogout,
  onOpenAdmin,
  rooms,
  currentRoomId,
  onSelectRoom,
  onRefreshRooms
}: ChatRoomProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeMediaUrl, setActiveMediaUrl] = useState<string | null>(null);
  const [activeMediaType, setActiveMediaType] = useState<'image' | 'video' | null>(null);

  const [isRoomSettingsOpen, setIsRoomSettingsOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allowedUserIds, setAllowedUserIds] = useState<string[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);

  // Find active room detail
  const activeRoom = rooms.find(r => r.id === currentRoomId);

  // Fetch all users when settings opens
  const fetchAllUsers = async () => {
    try {
      const response = await fetch('/api/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setAllUsers(data);
      }
    } catch (err) {
      console.error('Lỗi khi tải danh sách người dùng:', err);
    }
  };

  // Toggle user allowed state
  const handleToggleUserAllowed = (userId: string) => {
    setAllowedUserIds(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };

  // Save allowed users list
  const handleSaveAllowedUsers = async () => {
    if (!activeRoom) return;
    setSavingSettings(true);
    setSettingsError(null);
    setSettingsSuccess(null);
    try {
      const response = await fetch(`/api/rooms/${activeRoom.id}/allowed-users`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ allowedUserIds, isPrivate })
      });

      if (response.ok) {
        onRefreshRooms();
        setSettingsSuccess('Đã cập nhật cấu hình kênh thành công!');
        setTimeout(() => {
          setIsRoomSettingsOpen(false);
        }, 1500);
      } else {
        const errData = await response.json();
        setSettingsError(errData.error || 'Lỗi lưu cấu hình thành viên');
      }
    } catch (err) {
      console.error('Lỗi lưu cấu hình thành viên:', err);
      setSettingsError('Không thể kết nối đến máy chủ.');
    } finally {
      setSavingSettings(false);
    }
  };

  // Delete current room
  const handleDeleteRoom = async () => {
    if (!activeRoom) return;
    if (activeRoom.id === 'room-general') {
      setSettingsError('Không thể xóa kênh trò chuyện mặc định.');
      return;
    }

    try {
      setSettingsError(null);
      const response = await fetch(`/api/rooms/${activeRoom.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setIsRoomSettingsOpen(false);
        onRefreshRooms();
        onSelectRoom('room-general'); // default back to General room
      } else {
        const errData = await response.json();
        setSettingsError(errData.error || 'Lỗi khi xóa kênh chat');
      }
    } catch (err) {
      console.error('Lỗi xóa kênh chat:', err);
      setSettingsError('Không thể kết nối đến máy chủ.');
    }
  };

  // Load allowed users whenever room changes or settings opens
  useEffect(() => {
    if (isRoomSettingsOpen) {
      fetchAllUsers();
      if (activeRoom) {
        setAllowedUserIds(activeRoom.allowedUserIds || []);
        setIsPrivate(activeRoom.isPrivate || false);
      }
      setDeleteConfirm(false);
      setSettingsError(null);
      setSettingsSuccess(null);
    }
  }, [isRoomSettingsOpen, currentRoomId, activeRoom]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<any>(null);

  // Load and poll messages
  const fetchMessages = async (silent = false) => {
    if (!currentRoomId) return;
    try {
      const response = await fetch(`/api/rooms/${currentRoomId}/messages`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (response.ok) {
        setMessages(data);
      }
    } catch (err) {
      console.error('Lỗi khi tải tin nhắn:', err);
    }
  };

  // Scroll to bottom
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    fetchMessages();
    // Scroll instantly on initial load of room
    setTimeout(() => scrollToBottom('auto'), 150);

    // Setup 2-second high-speed polling for live updates
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(() => {
      fetchMessages(true);
    }, 2000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [currentRoomId]);

  // Scroll to bottom when message list length changes
  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  // Handle send message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !currentRoomId) return;

    const textToSend = inputText.trim();
    setInputText('');

    try {
      const response = await fetch(`/api/rooms/${currentRoomId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ content: textToSend })
      });

      if (response.ok) {
        const newMsg = await response.json();
        setMessages(prev => [...prev, newMsg]);
        scrollToBottom();
      } else {
        const errData = await response.json();
        alert(errData.error || 'Lỗi gửi tin nhắn');
      }
    } catch (err) {
      console.error('Lỗi gửi tin nhắn:', err);
    }
  };

  // Handle High-Speed Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentRoomId) return;

    // Fast validate file size (e.g. 100MB)
    if (file.size > 100 * 1024 * 1024) {
      alert('Dung lượng file vượt quá giới hạn 100MB');
      return;
    }

    setUploading(true);
    setUploadProgress(10); // Start progress bar

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Simulate incremental upload progress for visual smoothness
      const progInterval = setInterval(() => {
        setUploadProgress(p => (p < 85 ? p + 15 : p));
      }, 100);

      const response = await fetch(`/api/rooms/${currentRoomId}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      clearInterval(progInterval);
      setUploadProgress(100);

      if (response.ok) {
        const newMsg = await response.json();
        setMessages(prev => [...prev, newMsg]);
        scrollToBottom();
      } else {
        const errData = await response.json();
        alert(errData.error || 'Lỗi tải lên tệp tin');
      }
    } catch (err) {
      console.error('Lỗi tải tệp tin:', err);
      alert('Không thể kết nối đến máy chủ để tải lên.');
    } finally {
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }, 400);
    }
  };

  // Handle Message Deletion (Admin Only)
  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa vĩnh viễn tin nhắn này khỏi máy chủ đám mây?')) {
      return;
    }

    try {
      const response = await fetch(`/api/messages/${messageId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setMessages(prev => prev.filter(m => m.id !== messageId));
      } else {
        const errData = await response.json();
        alert(errData.error || 'Không thể xóa tin nhắn');
      }
    } catch (err) {
      console.error('Lỗi xóa tin nhắn:', err);
    }
  };


  return (
    <div className="flex chat-container overflow-hidden bg-[#F5F5F0]">
      
      {/* 1. SIDEBAR (Collapsible Drawer for Mobile devices) */}
      <AnimatePresence>
        {(isSidebarOpen || window.innerWidth >= 1024) && (
          <motion.div
            initial={{ x: -280, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -280, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className={`fixed inset-y-0 left-0 w-[270px] bg-[#5A5A40] text-white flex flex-col z-30 shadow-2xl lg:relative lg:flex lg:translate-x-0 lg:shadow-none shrink-0`}
          >
            {/* Sidebar User Profile Info */}
            <div className="p-4 border-b border-[#4A4A34] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  currentUser.role === 'admin' ? 'bg-[#E8E8E1] text-[#5A5A40]' : 'bg-[#C7C7B5] text-[#5A5A40]'
                }`}>
                  {currentUser.role === 'admin' ? <Shield className="w-5 h-5" /> : <span className="font-bold text-sm">{currentUser.name.charAt(0)}</span>}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold leading-none text-white truncate">{currentUser.name}</p>
                  <span className="text-[10px] text-[#E8E8E1] font-medium flex items-center gap-0.5 mt-0.5">
                    {currentUser.role === 'admin' ? '★ Quản trị viên' : 'Thành viên'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="lg:hidden p-1 rounded-lg hover:bg-[#4A4A34] text-[#E8E8E1]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Channels / Rooms list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              <div className="flex items-center justify-between px-2 py-1.5 text-[11px] font-bold text-[#E8E8E1] uppercase tracking-wider opacity-90">
                <span>Phòng Trò Chuyện</span>
                <button onClick={onRefreshRooms} title="Cập nhật phòng" className="hover:text-white transition">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              {rooms.map((room) => {
                const isActive = room.id === currentRoomId;
                return (
                  <button
                    key={room.id}
                    onClick={() => {
                      onSelectRoom(room.id);
                      setIsSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-3 rounded-xl text-left text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-[#E8E8E1] text-[#5A5A40] shadow-md shadow-[#4A4A34]/20 font-bold'
                        : 'text-white/80 hover:bg-[#4A4A34]/60 active:bg-[#4A4A34]'
                    }`}
                  >
                    <span className="truncate">{room.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Sidebar bottom action control */}
            <div className="p-3 border-t border-[#4A4A34] space-y-2">
              {currentUser.role === 'admin' && (
                <button
                  onClick={() => {
                    setIsSidebarOpen(false);
                    onOpenAdmin();
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-[#E8E8E1] hover:bg-white text-[#5A5A40] text-xs font-bold py-2.5 px-4 rounded-xl transition shadow-md"
                >
                  <Shield className="w-4 h-4" /> Bảng Quản Trị Admin
                </button>
              )}

              <button
                onClick={onLogout}
                className="w-full flex items-center justify-center gap-2 bg-[#4A4A34] hover:bg-[#3E3E2B] active:bg-[#4A4A34] text-rose-300 text-xs font-semibold py-2.5 px-4 rounded-xl transition border border-[#3E3E2B]"
              >
                <LogOut className="w-4 h-4" /> Đăng xuất
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Backdrop for sidebar on mobile device */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-[#5A5A40]/40 backdrop-blur-sm z-20 lg:hidden"
        />
      )}

      {/* 2. MAIN CHAT VIEWPORT */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#F5F5F0]">
        
        {/* Chat Header */}
        <div className="bg-[#E8E8E1] border-b border-[#D9D9D2] px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-1.5 -ml-1 hover:bg-[#C7C7B5]/30 active:bg-[#C7C7B5]/60 rounded-lg text-[#5A5A40] transition"
            >
              <Menu className="w-5.5 h-5.5" />
            </button>

            <div className="min-w-0">
              <h2 className="font-bold text-[#5A5A40] font-serif text-sm md:text-base leading-tight truncate">
                {activeRoom ? activeRoom.name : 'Vui lòng chọn phòng'}
              </h2>
              <p className="text-[10px] text-[#424235] opacity-75 font-medium truncate mt-0.5">
                {activeRoom ? activeRoom.description || 'Chưa có mô tả' : 'Chọn kênh từ menu'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Room Settings (Show if user is Admin OR Room Creator) */}
            {activeRoom && (currentUser.role === 'admin' || activeRoom.createdBy === currentUser.id) && (
              <button
                onClick={() => setIsRoomSettingsOpen(true)}
                className="p-1.5 rounded-lg hover:bg-[#C7C7B5]/30 text-[#5A5A40] transition active:scale-95"
                title="Cài đặt kênh trò chuyện"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}

            {/* Quick manual refresh */}
            <button
              onClick={() => fetchMessages()}
              className="p-1.5 rounded-lg hover:bg-[#C7C7B5]/30 text-[#5A5A40] transition active:scale-95"
              title="Tải lại tin nhắn"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messaging Timeline area */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#F5F5F0] space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <div className="w-12 h-12 rounded-2xl bg-[#E8E8E1] flex items-center justify-center text-[#5A5A40] mb-3">
                <Sparkles className="w-6 h-6 animate-pulse" />
              </div>
              <p className="text-xs font-bold text-[#5A5A40]">Chưa có tin nhắn nào</p>
              <p className="text-[10px] text-[#424235] opacity-75 max-w-[200px] mt-1 leading-normal">
                Hãy là người đầu tiên bắt đầu cuộc trò chuyện. Bạn có thể gửi ảnh, video tốc độ cao!
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.senderId === currentUser.id;
              const isAdminMsg = msg.senderRole === 'admin';

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-full group`}
                >
                  {/* Sender Name & Role Info */}
                  <div className="flex items-center gap-1 mb-1 px-1">
                    <span className="text-[10px] font-bold text-[#5A5A40]/80">
                      {isMe ? 'Bạn' : msg.senderName}
                    </span>
                    {isAdminMsg && (
                      <span className="text-[8px] bg-[#5A5A40]/10 text-[#5A5A40] border border-[#5A5A40]/20 px-1 py-0.2 rounded font-extrabold flex items-center gap-0.5 scale-90">
                        ★ ADMIN
                      </span>
                    )}
                  </div>

                  {/* Bubble Container */}
                  <div className="flex items-end gap-1.5 max-w-[85%] md:max-w-[70%]">
                    {/* Admin Message Delete Trigger (Admin Only) */}
                    {currentUser.role === 'admin' && (
                      <button
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="opacity-0 group-hover:opacity-100 active:opacity-100 p-1 rounded bg-white hover:bg-rose-50 border border-[#D9D9D2] text-[#A3A395] hover:text-rose-500 transition mr-1 shrink-0"
                        title="Xóa tin nhắn đám mây"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Chat Bubble Body */}
                    <div
                      className={`rounded-2xl px-3.5 py-2 text-xs leading-relaxed shadow-sm break-words ${
                        isMe
                          ? 'bg-[#5A5A40] text-white rounded-br-none'
                          : isAdminMsg
                            ? 'bg-[#E8E8E1] text-[#424235] border border-[#D9D9D2] rounded-bl-none'
                            : 'bg-white/80 text-[#424235] border border-[#D9D9D2] rounded-bl-none'
                      }`}
                    >
                      {/* Multimedia rendering */}
                      {msg.type === 'image' && msg.fileUrl && (
                        <div className="mb-2 relative rounded-xl overflow-hidden bg-[#E8E8E1] group/media">
                          <img
                            src={msg.fileUrl}
                            alt={msg.fileName || 'Hình ảnh'}
                            className="max-h-[180px] w-auto max-w-full object-contain cursor-zoom-in active:scale-98 transition rounded-xl"
                            referrerPolicy="no-referrer"
                            onClick={() => {
                              setActiveMediaUrl(msg.fileUrl!);
                              setActiveMediaType('image');
                            }}
                          />
                          <button
                            onClick={() => {
                              setActiveMediaUrl(msg.fileUrl!);
                              setActiveMediaType('image');
                            }}
                            className="absolute bottom-2 right-2 bg-slate-900/60 hover:bg-slate-900/80 p-1.5 rounded-lg text-white opacity-0 group-hover/media:opacity-100 transition"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {msg.type === 'video' && msg.fileUrl && (
                        <div className="mb-2 relative rounded-xl overflow-hidden bg-slate-900 max-w-[260px]">
                          <video
                            src={msg.fileUrl}
                            controls
                            playsInline
                            preload="metadata"
                            className="max-h-[180px] w-full rounded-xl"
                          />
                        </div>
                      )}

                      {/* Text content or fallback */}
                      {msg.type === 'text' ? (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <div className="flex items-center gap-1.5 mt-1 font-semibold text-[10px] opacity-80 border-t border-black/5 pt-1">
                          {msg.type === 'image' ? <ImageIcon className="w-3 h-3" /> : <Film className="w-3 h-3" />}
                          <span className="truncate max-w-[120px]">{msg.fileName}</span>
                          <span>({msg.fileSize})</span>
                        </div>
                      )}

                      {/* Msg Timestamp */}
                      <div className={`text-[9px] text-right mt-1.5 leading-none opacity-60`}>
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* HIGH-SPEED UPLOADING PROGRESS INDICATOR */}
        {uploading && (
          <div className="bg-[#E8E8E1] border-y border-[#D9D9D2] px-4 py-2 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="inline-block w-3.5 h-3.5 border-2 border-[#5A5A40] border-t-transparent rounded-full animate-spin"></span>
              <span className="text-[10px] font-bold text-[#5A5A40]">Đang đồng bộ tệp chất lượng cao lên mây... ({uploadProgress}%)</span>
            </div>
            <div className="w-24 bg-[#D9D9D2] h-1.5 rounded-full overflow-hidden">
              <div className="bg-[#5A5A40] h-full transition-all duration-100" style={{ width: `${uploadProgress}%` }}></div>
            </div>
          </div>
        )}

        {/* Input Form Box */}
        <div className="bg-[#E8E8E1] border-t border-[#D9D9D2] p-2.5 shrink-0">
          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            
            {/* High-speed Multimedia Clip Button */}
            <button
              type="button"
              disabled={uploading || !currentRoomId}
              onClick={() => fileInputRef.current?.click()}
              className="p-3 bg-white/50 hover:bg-white active:bg-[#C7C7B5] text-[#5A5A40] hover:text-[#4A4A34] rounded-2xl transition shrink-0 border border-[#D9D9D2]"
              title="Gửi hình ảnh/video tốc độ cao"
            >
              <ImageIcon className="w-5 h-5" />
            </button>

            {/* Hidden Input File for high speed camera/clip */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*,video/*"
              className="hidden"
            />

            {/* Main Text Area */}
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={!currentRoomId}
              placeholder={currentRoomId ? "Nhập tin nhắn bảo mật..." : "Chọn kênh chat..."}
              className="flex-1 bg-white/70 border border-[#D9D9D2] rounded-2xl py-3 px-4 text-xs text-[#424235] placeholder-[#A3A395] focus:outline-none focus:border-[#5A5A40] focus:bg-white transition"
            />

            {/* Send Text Button */}
            <button
              type="submit"
              disabled={!inputText.trim() || !currentRoomId}
              className="p-3 bg-[#5A5A40] hover:bg-[#4A4A34] text-white rounded-2xl transition disabled:bg-[#C7C7B5]/50 shrink-0 shadow-md shadow-[#5A5A40]/10"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>

        {/* ROOM SETTINGS OVERLAY SLIDE-OUT PANEL */}
        <AnimatePresence>
          {isRoomSettingsOpen && activeRoom && (
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              className="absolute inset-0 bg-[#F5F5F0] z-20 flex flex-col h-full overflow-hidden"
            >
              {/* Header */}
              <div className="bg-[#E8E8E1] border-b border-[#D9D9D2] px-4 py-3.5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    onClick={() => setIsRoomSettingsOpen(false)}
                    className="p-1.5 hover:bg-[#C7C7B5]/40 active:bg-[#C7C7B5] rounded-lg text-[#5A5A40] transition"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div className="min-w-0">
                    <h1 className="font-bold text-[#5A5A40] font-serif text-sm md:text-base leading-tight">Cài Đặt Kênh Chat</h1>
                    <p className="text-[10px] text-[#424235] opacity-75 font-medium truncate max-w-[200px] md:max-w-[300px]">Cấu hình & Phân quyền kênh: {activeRoom.name}</p>
                  </div>
                </div>
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#5A5A40] text-white">
                  <Settings className="w-4 h-4" />
                </div>
              </div>

              {/* Settings Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {settingsError && (
                  <div className="bg-rose-100 border border-rose-300 text-rose-800 text-[11px] font-bold p-3 rounded-xl flex items-center justify-between">
                    <span>{settingsError}</span>
                    <button type="button" onClick={() => setSettingsError(null)} className="text-rose-900 font-bold ml-2">X</button>
                  </div>
                )}
                {settingsSuccess && (
                  <div className="bg-emerald-100 border border-emerald-300 text-emerald-800 text-[11px] font-bold p-3 rounded-xl flex items-center justify-between animate-pulse">
                    <span>{settingsSuccess}</span>
                    <button type="button" onClick={() => setSettingsSuccess(null)} className="text-emerald-900 font-bold ml-2">X</button>
                  </div>
                )}
                {/* General Info */}
                <div className="bg-white/80 rounded-2xl p-4 border border-[#D9D9D2] shadow-sm glass space-y-2">
                  <span className="text-[10px] uppercase tracking-widest text-[#5A5A40] font-bold">Thông tin kênh</span>
                  <h3 className="text-sm font-bold text-[#424235] font-serif">{activeRoom.name}</h3>
                  <p className="text-xs text-[#424235]/80">{activeRoom.description || 'Kênh này chưa có mô tả chi tiết.'}</p>
                  <p className="text-[10px] text-[#424235]/60">Khởi tạo lúc: {new Date(activeRoom.createdAt).toLocaleString('vi-VN')}</p>
                </div>

                {/* Privacy settings: Private vs Public */}
                {activeRoom.id === 'room-general' ? (
                  <div className="bg-amber-50/50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-800 space-y-1">
                    <p className="font-bold">Kênh trò chuyện chung (mặc định)</p>
                    <p className="opacity-90">Kênh này mở cho tất cả thành viên trong hệ thống và không thể xóa hoặc giới hạn quyền truy cập.</p>
                  </div>
                ) : (
                  <>
                    {/* Security settings list of users */}
                    <div className="bg-white/80 rounded-2xl p-4 border border-[#D9D9D2] shadow-sm glass space-y-4">
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-widest text-[#5A5A40] font-bold">Chế độ bảo mật kênh</span>
                        <p className="text-[10px] text-[#424235]/70">Lựa chọn kiểu kênh và thêm/xóa thành viên có quyền truy cập</p>
                      </div>

                      {/* Segment selector for Public/Private */}
                      <div className="flex bg-[#E8E8E1]/60 p-1 rounded-xl gap-1 border border-[#D9D9D2]">
                        <button
                          type="button"
                          onClick={() => {
                            setIsPrivate(false);
                          }}
                          className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                            !isPrivate
                              ? 'bg-[#5A5A40] text-white shadow-sm scale-[1.01]'
                              : 'text-[#5A5A40] hover:bg-[#C7C7B5]/30'
                          }`}
                        >
                          <Globe className="w-3.5 h-3.5" />
                          Công khai
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsPrivate(true);
                          }}
                          className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                            isPrivate
                              ? 'bg-[#5A5A40] text-white shadow-sm scale-[1.01]'
                              : 'text-[#5A5A40] hover:bg-[#C7C7B5]/30'
                          }`}
                        >
                          <Lock className="w-3.5 h-3.5" />
                          Riêng tư
                        </button>
                      </div>

                      {isPrivate ? (
                        <div className="space-y-3">
                          <div className="flex justify-between items-center px-1 pt-1 border-t border-[#D9D9D2]/40">
                            <span className="text-[10px] text-[#424235]/70 font-semibold uppercase tracking-wider">Thành viên kênh:</span>
                            <div className="flex gap-2.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const allIds = allUsers.map(u => u.id);
                                  setAllowedUserIds(allIds);
                                }}
                                className="text-[10px] text-[#5A5A40] hover:underline font-bold"
                              >
                                Thêm tất cả
                              </button>
                              <span className="text-[10px] text-[#424235]/40">|</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setAllowedUserIds([]);
                                }}
                                className="text-[10px] text-rose-700 hover:underline font-bold"
                              >
                                Xóa tất cả
                              </button>
                            </div>
                          </div>

                          {/* Search/filter user if needed or simple list */}
                          <div className="border border-[#D9D9D2] rounded-xl max-h-[200px] overflow-y-auto divide-y divide-[#D9D9D2] bg-white">
                            {allUsers.length === 0 ? (
                              <p className="text-center text-xs text-[#424235]/60 py-4">Đang tải danh sách tài khoản...</p>
                            ) : (
                              allUsers.map(user => {
                                const isCreator = user.id === activeRoom.createdBy;
                                const isUserAdmin = user.role === 'admin';
                                const isAllowed = allowedUserIds.includes(user.id) || isCreator || isUserAdmin;
                                const isDisabled = isCreator || isUserAdmin; // Can't remove creator or admins from access

                                return (
                                  <label
                                    key={user.id}
                                    className={`flex items-center justify-between p-3 text-xs cursor-pointer hover:bg-[#E8E8E1]/20 transition ${isDisabled ? 'opacity-75 bg-[#E8E8E1]/5' : ''}`}
                                  >
                                    <div className="flex items-center gap-2.5">
                                      <div className="w-6.5 h-6.5 rounded-full bg-[#C7C7B5] text-[#5A5A40] font-bold text-[10px] flex items-center justify-center shrink-0">
                                        {user.name.charAt(0)}
                                      </div>
                                      <div className="min-w-0">
                                        <p className="font-bold text-[#424235] truncate">{user.name}</p>
                                        <p className="text-[9px] text-[#424235]/70">
                                          @{user.username} {isCreator && <span className="text-amber-700 font-semibold">(Người tạo)</span>} {isUserAdmin && <span className="text-blue-700 font-semibold">(Admin)</span>}
                                        </p>
                                      </div>
                                    </div>
                                    <input
                                      type="checkbox"
                                      checked={isAllowed}
                                      disabled={isDisabled}
                                      onChange={() => handleToggleUserAllowed(user.id)}
                                      className="w-4 h-4 rounded text-[#5A5A40] focus:ring-[#5A5A40] border-[#D9D9D2]"
                                    />
                                  </label>
                                );
                              })
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="bg-[#E8E8E1]/30 border border-[#D9D9D2] rounded-xl p-3.5 text-center space-y-2">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#5A5A40]/10 text-[#5A5A40] mx-auto">
                            <Globe className="w-4 h-4" />
                          </span>
                          <p className="text-[11px] font-bold text-[#5A5A40]">Kênh đang ở chế độ Công khai</p>
                          <p className="text-[10px] text-[#424235]/80 leading-relaxed">
                            Mọi người trong hệ thống đều có quyền truy cập, đọc lịch sử và gửi tin nhắn trong kênh này. Hãy chuyển sang chế độ <strong>Riêng tư</strong> để bắt đầu phân quyền thêm hoặc xóa thành viên.
                          </p>
                        </div>
                      )}

                      <button
                        onClick={handleSaveAllowedUsers}
                        disabled={savingSettings}
                        className="w-full bg-[#5A5A40] hover:bg-[#4A4A34] text-white text-xs font-bold py-3 px-4 rounded-xl shadow-sm transition active:scale-[0.99] flex items-center justify-center gap-2 mt-2"
                      >
                        {savingSettings ? 'Đang lưu cài đặt...' : 'Cập nhật cài đặt kênh'}
                      </button>
                    </div>

                    {/* Dangerous zone: delete channel */}
                    <div className="bg-rose-50/50 border border-rose-200 rounded-2xl p-4 shadow-sm space-y-3">
                      <div>
                        <h4 className="text-xs font-bold text-rose-800 uppercase tracking-wider">Khu vực nguy hiểm</h4>
                        <p className="text-[10px] text-rose-700">Xóa vĩnh viễn kênh trò chuyện này và toàn bộ lịch sử tin nhắn đính kèm trên đám mây.</p>
                      </div>
                      
                      {!deleteConfirm ? (
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm(true)}
                          className="w-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold py-3 px-4 rounded-xl transition shadow-sm flex items-center justify-center gap-1.5 active:scale-95"
                        >
                          <Trash2 className="w-4 h-4" /> Xóa kênh trò chuyện này
                        </button>
                      ) : (
                        <div className="space-y-2 bg-white/90 p-3 rounded-xl border border-rose-300">
                          <p className="text-[10px] font-bold text-rose-800 leading-normal">
                            ⚠️ Bạn có chắc chắn muốn xóa vĩnh viễn kênh này cùng toàn bộ tin nhắn liên quan? Thao tác này KHÔNG THỂ HOÀN TÁC.
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={handleDeleteRoom}
                              className="flex-1 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold py-2 px-3 rounded-lg transition"
                            >
                              Tôi chắc chắn, xóa kênh
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirm(false)}
                              className="flex-1 bg-[#E8E8E1] hover:bg-[#C7C7B5]/40 text-[#5A5A40] text-[10px] font-bold py-2 px-3 rounded-lg transition"
                            >
                              Hủy bỏ
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 3. LIGHTBOX FOR HIGH-RESOLUTION IMAGE/VIDEO PREVIEW */}
      <AnimatePresence>
        {activeMediaUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 z-50 flex flex-col justify-between p-4"
          >
            {/* Top Bar */}
            <div className="flex items-center justify-between text-white">
              <span className="text-xs font-semibold">Bản Xem Chi Tiết Tốc Độ Cao</span>
              <button
                onClick={() => {
                  setActiveMediaUrl(null);
                  setActiveMediaType(null);
                }}
                className="p-2 bg-white/10 hover:bg-white/20 active:scale-95 rounded-full text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Media Content */}
            <div className="flex-1 flex items-center justify-center p-2">
              {activeMediaType === 'image' ? (
                <img
                  src={activeMediaUrl}
                  alt="High-resolution Preview"
                  className="max-h-[80vh] max-w-full object-contain rounded-xl"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <video
                  src={activeMediaUrl}
                  controls
                  autoPlay
                  className="max-h-[80vh] max-w-full rounded-xl"
                />
              )}
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-center gap-4 text-white">
              <a
                href={activeMediaUrl}
                download
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 active:scale-95 px-5 py-2.5 rounded-xl text-xs font-bold transition border border-white/10"
              >
                <Download className="w-4 h-4" /> Tải Xuống Bản Gốc
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
