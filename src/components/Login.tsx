import React, { useState } from 'react';
import { Shield, User, Lock, MessageSquare, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';

interface LoginProps {
  onLoginSuccess: (token: string, user: any) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Vui lòng nhập đầy đủ tài khoản và mật khẩu.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username.trim(),
          password: password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Đăng nhập thất bại.');
      }

      onLoginSuccess(data.token, data.user);
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra trong quá trình đăng nhập.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (user: string, pass: string) => {
    setUsername(user);
    setPassword(pass);
    setError(null);
  };

  return (
    <div id="login-container" className="flex flex-col justify-between min-h-[100dvh] bg-[#F5F5F0] px-6 py-8">
      {/* Top Brand Hero */}
      <div className="flex flex-col items-center justify-center pt-8 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, type: 'spring' }}
          className="flex items-center justify-center w-16 h-16 bg-[#5A5A40] text-white rounded-2xl shadow-lg shadow-[#5A5A40]/20 mb-4"
        >
          <MessageSquare className="w-8 h-8" />
        </motion.div>
        <motion.h1
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="text-3xl font-semibold text-[#5A5A40] tracking-tight font-serif italic"
        >
          Chata
        </motion.h1>
      </div>

      {/* Main Login Form */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="w-full max-w-sm mx-auto bg-white/75 rounded-3xl border border-[#D9D9D2] p-6 natural-shadow mt-6 glass"
      >
        <h2 className="text-lg font-bold text-[#5A5A40] font-serif mb-4">Đăng Nhập</h2>
        
        {error && (
          <div className="bg-rose-50 text-rose-600 text-xs px-3 py-2.5 rounded-xl border border-rose-100 mb-4 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#5A5A40] uppercase tracking-wider mb-1.5 ml-1">
              Tài khoản
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                <User className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Nhập tên đăng nhập..."
                className="w-full bg-white/50 border border-[#D9D9D2] rounded-xl py-3 pl-10 pr-4 text-sm text-[#424235] placeholder-[#A3A395] focus:outline-none focus:border-[#5A5A40] focus:bg-white transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#5A5A40] uppercase tracking-wider mb-1.5 ml-1">
              Mật khẩu
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu..."
                className="w-full bg-white/50 border border-[#D9D9D2] rounded-xl py-3 pl-10 pr-4 text-sm text-[#424235] placeholder-[#A3A395] focus:outline-none focus:border-[#5A5A40] focus:bg-white transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#5A5A40] hover:bg-[#4A4A34] active:scale-[0.99] text-white font-medium text-sm py-3 px-4 rounded-xl shadow-md shadow-[#5A5A40]/10 flex items-center justify-center gap-2 transition disabled:bg-[#C7C7B5] disabled:shadow-none"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <>
                Vào Phòng Chat <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </motion.div>

      {/* Spacing alignment */}
      <div className="h-4"></div>
    </div>
  );
}
