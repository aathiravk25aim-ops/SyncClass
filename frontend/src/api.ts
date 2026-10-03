import type { Activity, Attendance, Dashboard, LoginResponse, ScanResponse, Student } from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api';

export const apiBase = API_BASE;

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.detail ?? `Request failed: ${response.status}`);
  }
  return body as T;
}

export function login(username: string, password: string) {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export function getDashboard(token: string) {
  return request<Dashboard>('/dashboard', {}, token);
}

export function getStudents(token: string, q = '', className = '') {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (className) params.set('class_name', className);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return request<Student[]>(`/students${suffix}`, {}, token);
}

export function createStudent(token: string, payload: Omit<Student, 'id' | 'created_at'>) {
  return request<Student>('/students', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, token);
}

export function getActivity(token: string) {
  return request<Activity[]>('/activity?limit=50', {}, token);
}

export function scan(token: string, qrToken: string, action: string) {
  return request<ScanResponse>('/scan', {
    method: 'POST',
    body: JSON.stringify({ qr_token: qrToken, action, device: 'browser-camera' }),
  }, token);
}

export function getAttendance(token: string) {
  return request<Attendance[]>('/attendance', {}, token);
}

export function qrUrl(rollNumber: string) {
  return `${API_BASE}/students/${encodeURIComponent(rollNumber)}/qr`;
}
