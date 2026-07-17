export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export interface Room {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: string;
  allowedUserIds?: string[];
  isPrivate?: boolean;
}

export interface Message {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  type: 'text' | 'image' | 'video';
  content: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: string;
  createdAt: string;
}

export interface ChatState {
  currentUser: User | null;
  token: string | null;
  rooms: Room[];
  currentRoomId: string | null;
  messages: Record<string, Message[]>; // roomId -> messages
  usersList: User[]; // for admin
}
