export type VisitCategory = 'New Consultation' | 'Follow-up' | 'Report Review' | 'Emergency';

export type AppointmentStatus = 'pending' | 'waiting' | 'consulting' | 'completed' | 'skipped';

export type UserRole = 'admin' | 'receptionist';

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  room: string;
  is_active: boolean;
  created_at: string;
}

export interface QueueState {
  doctor_id: string;
  is_paused: boolean;
  pause_delay_minutes: number;
  break_started_at: string | null;
  is_on_leave: boolean;
  leave_from: string | null;
  leave_until: string | null;
  leave_note: string;
  updated_at: string;
}

export interface Appointment {
  id: string;
  doctor_id: string;
  token_number: number;
  patient_name: string;
  patient_age: number;
  patient_phone: string;
  visit_category: VisitCategory;
  status: AppointmentStatus;
  queue_position: number;
  consultation_start_at: string | null;
  consultation_end_at: string | null;
  consultation_recorded_at?: string | null;
  eta_minutes?: number | null;
  ready_sms_sent_at?: string | null;
  qr_sent_at?: string | null;
  appointment_date: string;
  created_at: string;
  source?: 'patient' | 'receptionist';
}

export interface ConsultationHistory {
  id: string;
  doctor_id: string;
  visit_category: VisitCategory;
  duration_minutes: number;
  completed_at: string;
}

export interface CategoryAverages {
  'New Consultation': number;
  'Follow-up': number;
  'Report Review': number;
  'Emergency': number;
}

export interface AppointmentNotification {
  whatsappSent: boolean;
  whatsappError: string | null;
  whatsappUrl: string;
  trackingUrl: string;
  qrCodeUrl: string;
}
