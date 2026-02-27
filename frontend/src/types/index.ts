export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'applicant' | 'admin' | 'agent';
  is_super_admin?: number;
  phone?: string | null;
  sms_opt_in?: number;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: 'applicant' | 'admin' | 'agent';
  suspended: number;
  is_super_admin: number;
  last_login_at: string | null;
  last_login_ip: string | null;
  created_at: string;
}

export interface Application {
  id: string;
  user_id: string;
  application_number: string;
  status: 'pending' | 'processing' | 'approved' | 'rejected';
  full_name: string;
  date_of_birth: string;
  nationality: string;
  gender: string;
  place_of_birth: string;
  address: string;
  phone: string;
  email: string;
  passport_type: 'regular' | 'official' | 'diplomatic';
  photo_path: string | null;
  id_document_path: string | null;
  admin_notes: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  passport_number: string | null;
  issued_at: string | null;
  expires_at: string | null;
  // Step 37: Express tier
  processing_tier?: 'standard' | 'express';
  tier_price?: number;
  payment_status?: 'pending' | 'paid';
  // Step 38: Agent
  agent_id?: string | null;
  agent_name?: string | null;
  // Step 40: Live support
  support_chat_open?: number;
}

export interface AdminStats {
  total: number;
  pending: number;
  processing: number;
  approved: number;
  rejected: number;
  flagged: number;
  express_count?: number;
  total_agents?: number;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Notification {
  id: string;
  user_id: string;
  message: string;
  type: 'info' | 'success' | 'error';
  read: number;
  application_id: string | null;
  created_at: string;
}
