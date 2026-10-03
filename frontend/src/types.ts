export type Role = 'admin' | 'faculty';

export type LoginResponse = {
  access_token: string;
  token_type: string;
  expires_in_minutes: number;
  username: string;
  role: Role;
};

export type Student = {
  id: number;
  roll_number: string;
  name: string;
  department: string;
  class_name: string;
  year: number;
  email: string;
  phone: string;
  created_at: string;
};

export type Activity = {
  id: number;
  roll_number: string;
  student_name: string;
  action: 'identify' | 'checkin' | 'checkout';
  device: string;
  scanned_at: string;
};

export type Dashboard = {
  total_students: number;
  scans_today: number;
  checkins_today: number;
  checkouts_today: number;
  identified_today: number;
  active_students_estimate: number;
  present_today: number;
  late_today: number;
  absent_today: number;
  attendance_rate: number;
};

export type ScanResponse = {
  success: boolean;
  message: string;
  action: string;
  student: Student | null;
  scanned_at: string | null;
};

export type Attendance = {
  roll_number: string;
  student_name: string;
  department: string;
  class_name: string;
  status: 'Present' | 'Late' | 'Absent';
  checkin_time: string | null;
  checkout_time: string | null;
};
