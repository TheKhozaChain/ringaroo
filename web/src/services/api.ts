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

export interface Booking {
  id: string
  customer_name: string
  customer_phone: string
  customer_email?: string
  service_type: string
  preferred_date?: string
  preferred_time?: string
  status: 'pending' | 'confirmed' | 'cancelled'
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
  status: 'pending' | 'confirmed' | 'cancelled'
): Promise<Booking> => {
  const response = await api.patch(`/api/bookings/${bookingId}`, { status })
  return response.data
}