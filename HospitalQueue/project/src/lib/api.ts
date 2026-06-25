import { Appointment, AppointmentNotification, CategoryAverages, Doctor, Profile, QueueState } from './types';

const API_BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '/api' : 'http://localhost:4000/api');
const TOKEN_KEY = 'hospital_queue_token';

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

function qs(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const api = {
  login(email: string, password: string) {
    return request<{ token: string; user: { id: string; email: string }; profile: Profile }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  me() {
    return request<{ user: { id: string; email: string }; profile: Profile }>('/auth/me');
  },
  logout() {
    return request<void>('/auth/logout', { method: 'POST' });
  },
  profiles(role?: string) {
    return request<Profile[]>(`/profiles${qs({ role })}`);
  },
  addReceptionist(input: { name: string; email: string; password: string }) {
    return request<Profile>('/profiles/receptionists', { method: 'POST', body: JSON.stringify(input) });
  },
  updateProfile(id: string, input: Partial<Profile>) {
    return request<Profile>(`/profiles/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
  },
  resetProfilePassword(id: string, password: string) {
    return request<void>(`/profiles/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) });
  },
  doctors(active?: boolean) {
    return request<Doctor[]>(`/doctors${qs({ active })}`);
  },
  addDoctor(input: Pick<Doctor, 'name' | 'specialty' | 'room'>) {
    return request<Doctor>('/doctors', { method: 'POST', body: JSON.stringify(input) });
  },
  updateDoctor(id: string, input: Partial<Doctor>) {
    return request<Doctor>(`/doctors/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
  },
  queueStates() {
    return request<QueueState[]>('/queue-state');
  },
  queueState(doctorId: string) {
    return request<QueueState | null>(`/queue-state/${doctorId}`);
  },
  updateQueueState(doctorId: string, input: Partial<QueueState>) {
    return request<QueueState>(`/queue-state/${doctorId}`, { method: 'PATCH', body: JSON.stringify(input) });
  },
  appointments(params: { doctorId?: string; date?: string; status?: string; tokenNumber?: number; sort?: string; asc?: boolean }) {
    return request<Appointment[]>(`/appointments${qs(params)}`);
  },
  tracking(doctorId: string, tokenNumber: number, date: string) {
    return request<{ expired: boolean; appointment: Appointment | null }>(`/tracking/${doctorId}/${tokenNumber}/${date}`);
  },
  createAppointment(input: Partial<Appointment> & { source?: 'patient' | 'receptionist' }) {
    return request<Appointment & { notification?: AppointmentNotification }>('/appointments', { method: 'POST', body: JSON.stringify(input) });
  },
  updateAppointment(id: string, input: Partial<Appointment>) {
    return request<Appointment>(`/appointments/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
  },
  deleteAppointment(id: string) {
    return request<void>(`/appointments/${id}`, { method: 'DELETE' });
  },
  approveAppointment(id: string) {
    return request<{ appointment: Appointment } & AppointmentNotification>(`/appointments/${id}/approve`, { method: 'POST' });
  },
  categoryAverages(doctorId: string) {
    return request<CategoryAverages>(`/category-averages/${doctorId}`);
  },
  addConsultationHistory(input: { doctor_id: string; visit_category: string; duration_minutes: number }) {
    return request<void>('/consultation-history', { method: 'POST', body: JSON.stringify(input) });
  },
};
