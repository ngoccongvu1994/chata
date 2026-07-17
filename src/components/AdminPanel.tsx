import React, { useState, useEffect } from 'react';
import { User as UserIcon, Plus, Trash2, Key, Users, Settings, ArrowLeft, MessageSquare, Shield, HelpCircle, KeyRound } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Room } from '../types';

interface AdminPanelProps {
  token: string;
  onBack: () => void;
  rooms: Room[];
  onRefreshRooms: () => void;
}

export default function AdminPanel({ token, onBack, rooms, onRefreshRooms }: AdminPanelProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState<'users' | 'rooms'>('users');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // New user form state
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');

  // Change password form state
  const [selectedUserIdForPassword, setSelectedUserIdForPassword] = useState<string | null>(null);
  const [changePasswordVal, setChangePasswordVal] = useState('');

  // New room form state
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDesc, setNewRoomDesc] = useState('');
  const [newRoomIsPrivate, setNewRoomIsPrivate] = useState(false);
  const [roomToDelete, setRoomToDelete] = useState<string | null>(null);

  // Fetch users list
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không thể tải danh sách tài khoản');
      setUsers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [token]);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  // Handle user creation
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim() || !newName.trim()) {
      setError('Vui lòng điền đầy đủ các thông tin của tài khoản mới');
      return;
    }

    try {
      setError(null);
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          name: newName.trim(),
          role: newRole
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Lỗi khi tạo tài khoản');

      setUsers([...users, data]);
      // Clear inputs
      setNewUsername('');
      setNewPassword('');
      setNewName('');
      setNewRole('user');
      showSuccess(`Đã cấp tài khoản thành công cho: ${data.name}`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Handle user deletion
  const handleDeleteUser = async (userId: string, userName: string) => {
    if (userId === 'admin-id') {
      setError('Không thể xóa tài khoản Admin mặc định');
      return;
    }
    if (!confirm(`Bạn có chắc chắn muốn xóa tài khoản "${userName}"?`)) {
      return;
    }

    try {
      setError(null);
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Lỗi khi xóa người dùng');

      setUsers(users.filter(u => u.id !== userId));
      showSuccess('Đã xóa tài khoản thành công');
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Handle password change
  const handleChangePassword = async (userId: string) => {
    if (!changePasswordVal || changePasswordVal.length < 4) {
      setError('Mật khẩu mới phải từ 4 ký tự trở lên');
      return;
    }

    try {
      setError(null);
      const response = await fetch(`/api/users/${userId}/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ newPassword: changePasswordVal })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Lỗi khi đổi mật khẩu');

      setChangePasswordVal('');
      setSelectedUserIdForPassword(null);
      showSuccess('Đã đổi mật khẩu tài khoản thành công');
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Handle room creation
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) {
      setError('Tên phòng không được để trống');
      return;
    }

    try {
      setError(null);
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newRoomName.trim(),
          description: newRoomDesc.trim(),
          isPrivate: newRoomIsPrivate
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Lỗi khi tạo phòng');

      onRefreshRooms();
      setNewRoomName('');
      setNewRoomDesc('');
      setNewRoomIsPrivate(false);
      showSuccess(`Đã tạo phòng: ${data.name}`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Handle room deletion
  const handleDeleteRoom = async (roomId: string) => {
    if (roomId === 'room-general') {
      setError('Không thể xóa phòng chung mặc định');
      return;
    }

    try {
      setError(null);
      const response = await fetch(`/api/rooms/${roomId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Lỗi khi xóa phòng');

      onRefreshRooms();
      showSuccess('Đã xóa phòng thành công');
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-[#F5F5F0]">
      {/* Header */}
      <div className="bg-[#E8E8E1] border-b border-[#D9D9D2] px-4 py-3 flex items-center justify-between sticky top-0 z-10 shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            className="p-1.5 hover:bg-[#C7C7B5]/40 active:bg-[#C7C7B5] rounded-lg text-[#5A5A40] transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-bold text-[#5A5A40] font-serif text-base leading-tight">Quản Trị Hệ Thống</h1>
            <p className="text-[10px] text-[#424235] opacity-75 font-medium tracking-wide">Bảng điều khiển và phân quyền</p>
          </div>
        </div>
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#5A5A40] text-white">
          <Settings className="w-4 h-4 animate-spin-slow" />
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-[#E8E8E1]/80 border-b border-[#D9D9D2] flex p-1.5 gap-1.5 shrink-0">
        <button
          onClick={() => { setActiveTab('users'); setError(null); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-xl transition-all ${
            activeTab === 'users'
              ? 'bg-[#5A5A40] text-white shadow-sm shadow-[#5A5A40]/15'
              : 'text-[#424235] opacity-80 hover:bg-[#F5F5F0]/50'
          }`}
        >
          <Users className="w-4 h-4" /> Cấp Tài Khoản
        </button>
        <button
          onClick={() => { setActiveTab('rooms'); setError(null); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-xl transition-all ${
            activeTab === 'rooms'
              ? 'bg-[#5A5A40] text-white shadow-sm shadow-[#5A5A40]/15'
              : 'text-[#424235] opacity-80 hover:bg-[#F5F5F0]/50'
          }`}
        >
          <MessageSquare className="w-4 h-4" /> Kênh Trò Chuyện
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Messages and Notifications */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-rose-50 border border-rose-100 text-rose-600 rounded-xl p-3 text-xs font-medium"
            >
              {error}
            </motion.div>
          )}

          {successMsg && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl p-3 text-xs font-medium"
            >
              {successMsg}
            </motion.div>
          )}
        </AnimatePresence>

        {activeTab === 'users' ? (
          <div className="space-y-4">
            {/* Form: Create User */}
            <div className="bg-white/70 rounded-2xl p-4 border border-[#D9D9D2] shadow-sm glass">
              <div className="flex items-center gap-2 mb-3">
                <Plus className="w-4 h-4 text-[#5A5A40]" />
                <h2 className="text-xs font-bold text-[#5A5A40] uppercase tracking-wider font-serif">Cấp Mới Tài Khoản</h2>
              </div>

              <form onSubmit={handleCreateUser} className="space-y-3">
                <div>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Tên đầy đủ (ví dụ: Nguyễn Văn A)"
                    className="w-full bg-white/50 border border-[#D9D9D2] rounded-xl px-3.5 py-2.5 text-xs text-[#424235] focus:outline-none focus:border-[#5A5A40] focus:bg-white transition"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="Tên đăng nhập (e.g. user3)"
                    className="w-full bg-white/50 border border-[#D9D9D2] rounded-xl px-3.5 py-2.5 text-xs text-[#424235] focus:outline-none focus:border-[#5A5A40] focus:bg-white transition"
                    required
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mật khẩu"
                    className="w-full bg-white/50 border border-[#D9D9D2] rounded-xl px-3.5 py-2.5 text-xs text-[#424235] focus:outline-none focus:border-[#5A5A40] focus:bg-white transition"
                    required
                  />
                </div>

                <div className="flex items-center gap-4 py-1">
                  <span className="text-xs text-[#5A5A40] font-semibold">Vai trò:</span>
                  <label className="flex items-center gap-1.5 text-xs text-[#424235] cursor-pointer">
                    <input
                      type="radio"
                      checked={newRole === 'user'}
                      onChange={() => setNewRole('user')}
                      className="text-[#5A5A40] focus:ring-[#5A5A40] w-3.5 h-3.5"
                    />
                    Người Dùng (User)
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-[#424235] cursor-pointer">
                    <input
                      type="radio"
                      checked={newRole === 'admin'}
                      onChange={() => setNewRole('admin')}
                      className="text-[#5A5A40] focus:ring-[#5A5A40] w-3.5 h-3.5"
                    />
                    Quản Trị (Admin)
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full bg-[#5A5A40] hover:bg-[#4A4A34] text-white font-semibold text-xs py-2.5 px-4 rounded-xl shadow-sm transition active:scale-[0.99]"
                >
                  Tạo & Cấp Tài Khoản
                </button>
              </form>
            </div>

            {/* List: Users */}
            <div className="bg-white/70 rounded-2xl border border-[#D9D9D2] shadow-sm overflow-hidden glass">
              <div className="p-4 border-b border-[#D9D9D2] flex justify-between items-center bg-[#E8E8E1]/40">
                <span className="text-xs font-bold text-[#5A5A40] uppercase tracking-wider font-serif">Danh Sách Thành Viên ({users.length})</span>
                <button
                  onClick={fetchUsers}
                  className="text-[10px] font-semibold text-[#5A5A40] hover:underline"
                >
                  Làm mới
                </button>
              </div>

              <div className="divide-y divide-[#D9D9D2] max-h-[300px] overflow-y-auto">
                {users.map((user) => (
                  <div key={user.id} className="p-3.5 flex flex-col gap-2 transition hover:bg-[#E8E8E1]/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          user.role === 'admin' ? 'bg-[#5A5A40] text-white' : 'bg-[#C7C7B5] text-[#5A5A40]'
                        }`}>
                          {user.role === 'admin' ? <Shield className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-[#424235] flex items-center gap-1">
                            {user.name}
                            {user.role === 'admin' && (
                              <span className="text-[9px] bg-[#5A5A40]/10 text-[#5A5A40] px-1.5 py-0.5 rounded-full font-semibold uppercase">Admin</span>
                            )}
                          </p>
                          <p className="text-[10px] text-[#424235] opacity-70 font-medium">Username: @{user.username}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedUserIdForPassword(selectedUserIdForPassword === user.id ? null : user.id);
                            setChangePasswordVal('');
                          }}
                          title="Đổi mật khẩu"
                          className="p-1.5 rounded-lg text-[#5A5A40] hover:bg-[#C7C7B5]/30 transition"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>

                        {user.id !== 'admin-id' && (
                          <button
                            onClick={() => handleDeleteUser(user.id, user.name)}
                            title="Xóa tài khoản"
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Collapsible Change Password Box */}
                    {selectedUserIdForPassword === user.id && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="bg-[#E8E8E1]/40 p-2.5 rounded-xl border border-[#D9D9D2] flex gap-2 items-center"
                      >
                        <input
                          type="text"
                          value={changePasswordVal}
                          onChange={(e) => setChangePasswordVal(e.target.value)}
                          placeholder="Mật khẩu mới..."
                          className="flex-1 bg-white border border-[#D9D9D2] rounded-lg px-2.5 py-1.5 text-xs text-[#424235] focus:outline-none focus:border-[#5A5A40]"
                        />
                        <button
                          onClick={() => handleChangePassword(user.id)}
                          className="bg-[#5A5A40] text-white font-semibold text-xs px-3 py-1.5 rounded-lg hover:bg-[#4A4A34]"
                        >
                          Lưu
                        </button>
                      </motion.div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Form: Create Room */}
            <div className="bg-white/70 rounded-2xl p-4 border border-[#D9D9D2] shadow-sm glass">
              <div className="flex items-center gap-2 mb-3">
                <Plus className="w-4 h-4 text-[#5A5A40]" />
                <h2 className="text-xs font-bold text-[#5A5A40] uppercase tracking-wider font-serif">Tạo Phòng Trò Chuyện</h2>
              </div>

              <form onSubmit={handleCreateRoom} className="space-y-3">
                <div>
                  <input
                    type="text"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="Tên phòng (ví dụ: 🚀 Phòng Marketing)"
                    className="w-full bg-white/50 border border-[#D9D9D2] rounded-xl px-3.5 py-2.5 text-xs text-[#424235] focus:outline-none focus:border-[#5A5A40] focus:bg-white transition"
                    required
                  />
                </div>
                <div>
                  <textarea
                    value={newRoomDesc}
                    onChange={(e) => setNewRoomDesc(e.target.value)}
                    placeholder="Mô tả mục đích sử dụng của phòng..."
                    rows={2}
                    className="w-full bg-white/50 border border-[#D9D9D2] rounded-xl px-3.5 py-2.5 text-xs text-[#424235] focus:outline-none focus:border-[#5A5A40] focus:bg-white transition"
                  />
                </div>

                <div className="flex items-center gap-2 px-1 py-1">
                  <input
                    type="checkbox"
                    id="newRoomIsPrivate"
                    checked={newRoomIsPrivate}
                    onChange={(e) => setNewRoomIsPrivate(e.target.checked)}
                    className="w-4 h-4 rounded text-[#5A5A40] focus:ring-[#5A5A40] border-[#D9D9D2] cursor-pointer"
                  />
                  <label htmlFor="newRoomIsPrivate" className="text-[11px] text-[#424235] font-semibold cursor-pointer select-none">
                    Kênh riêng tư (Chỉ thành viên được chỉ định mới có thể xem)
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full bg-[#5A5A40] hover:bg-[#4A4A34] text-white font-semibold text-xs py-2.5 px-4 rounded-xl shadow-sm transition active:scale-[0.99]"
                >
                  Tạo Kênh Mới
                </button>
              </form>
            </div>

            {/* List: Rooms */}
            <div className="bg-white/70 rounded-2xl border border-[#D9D9D2] shadow-sm overflow-hidden glass">
              <div className="p-4 border-b border-[#D9D9D2] bg-[#E8E8E1]/40">
                <span className="text-xs font-bold text-[#5A5A40] uppercase tracking-wider font-serif">Danh Sách Kênh ({rooms.length})</span>
              </div>

              <div className="divide-y divide-[#D9D9D2] max-h-[350px] overflow-y-auto">
                {rooms.map((room) => (
                  <div key={room.id} className="p-3.5 flex justify-between items-center transition hover:bg-[#E8E8E1]/20">
                    <div className="flex-1 pr-4">
                      <p className="text-xs font-bold text-[#424235] flex items-center gap-1">
                        {room.name}
                        {room.id === 'room-general' && (
                          <span className="text-[9px] bg-[#C7C7B5] text-[#5A5A40] px-1.5 py-0.5 rounded-full font-semibold uppercase">Mặc định</span>
                        )}
                      </p>
                      <p className="text-[10px] text-[#424235] opacity-70 mt-0.5 line-clamp-1">{room.description || 'Không có mô tả'}</p>
                    </div>

                    {room.id !== 'room-general' && (
                      <div className="flex items-center gap-1">
                        {roomToDelete === room.id ? (
                          <div className="flex items-center gap-1 bg-rose-50 p-1 rounded-lg border border-rose-200">
                            <span className="text-[9px] font-bold text-rose-700 px-1">Xóa?</span>
                            <button
                              type="button"
                              onClick={() => {
                                handleDeleteRoom(room.id);
                                setRoomToDelete(null);
                              }}
                              className="text-[9px] bg-rose-600 hover:bg-rose-700 text-white font-bold px-2 py-1 rounded"
                            >
                              Có
                            </button>
                            <button
                              type="button"
                              onClick={() => setRoomToDelete(null)}
                              className="text-[9px] bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold px-2 py-1 rounded"
                            >
                              Hủy
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setRoomToDelete(room.id)}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
