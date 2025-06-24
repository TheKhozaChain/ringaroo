import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
})

export interface DashboardStats {
  totalCalls: number
  activeCalls: number
  totalBookings: number
  pendingBookings: number
  recentCalls: Array<{
    id: string
    caller_number: string
    status: string
    started_at: string
  }>
}

export interface Technician {
  id: string
  name: string
  email?: string
  phone?: string
  specialties: string[]
  availability: Record<string, { start: string; end: string }>
  maxDailyBookings: number
  isActive: boolean
  emergencyContact: boolean
  bookingsCount?: number
  bookings?: Booking[]
}

export interface Booking {
  id: string
  customer_name: string
  customer_phone: string
  customer_email?: string
  service_type: string
  preferred_date?: string
  preferred_time?: string
  technician_id?: string
  estimated_duration: number
  priority_level: 'low' | 'normal' | 'high' | 'emergency'
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled'
  assigned_at?: string
  confirmed_at?: string
  completed_at?: string
  created_at: string
  updated_at: string
}

export const getDashboardStats = async (): Promise<DashboardStats> => {
  const response = await api.get('/api/dashboard')
  return response.data
}

export const getBookings = async (): Promise<Booking[]> => {
  const response = await api.get('/api/bookings')
  return response.data
}

export const updateBookingStatus = async (
  bookingId: string, 
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled'
): Promise<Booking> => {
  const response = await api.patch(`/api/bookings/${bookingId}`, { status })
  return response.data
}

export const assignTechnician = async (
  bookingId: string,
  technicianId: string | null
): Promise<Booking> => {
  const response = await api.patch(`/api/bookings/${bookingId}`, { technicianId })
  return response.data
}

export const getTechnicians = async (): Promise<Technician[]> => {
  const response = await api.get('/api/technicians')
  return response.data
}

export const getTechnicianAvailability = async (date: string): Promise<Technician[]> => {
  const response = await api.get(`/api/technicians/availability/${date}`)
  return response.data
}

export const getRecommendedTechnicians = async (
  serviceType?: string,
  isEmergency?: boolean
): Promise<Technician[]> => {
  const response = await api.post('/api/technicians/recommend', {
    serviceType,
    isEmergency
  })
  return response.data
}
