import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Phone, Calendar, Clock, TrendingUp, AlertTriangle, Star } from 'lucide-react'
import { getDashboardStats, getBookings } from '../services/api'
import CalendarView from './CalendarView'
import DayBookingDetails from './DayBookingDetails'

export default function Dashboard() {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showDayDetails, setShowDayDetails] = useState(false)
  
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
  })

  const { data: bookings = [] } = useQuery({
    queryKey: ['bookings'],
    queryFn: getBookings,
    refetchInterval: 30000,
  })

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date)
    const dayBookings = getDayBookings(date)
    if (dayBookings.length > 0) {
      setShowDayDetails(true)
    }
  }

  const getDayBookings = (date: Date) => {
    return bookings.filter(booking => {
      if (!booking.preferred_date) return false
      return new Date(booking.preferred_date).toDateString() === date.toDateString()
    })
  }

  const getEmergencyBookings = () => {
    const emergencyKeywords = ['emergency', 'urgent', 'immediate', 'asap', 'termite', 'rodent', 'infestation']
    return bookings.filter(booking => 
      emergencyKeywords.some(keyword => 
        booking.service_type?.toLowerCase().includes(keyword) ||
        booking.notes?.toLowerCase().includes(keyword)
      )
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <p className="text-red-700">Failed to load dashboard data. Please try again.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-3xl font-bold text-gray-900">Business Dashboard</h1>
          <div className="flex items-center space-x-2 bg-green-50 px-3 py-1 rounded-full">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs font-medium text-green-700">Live</span>
          </div>
        </div>
        <div className="text-sm text-gray-500">
          Last updated: {new Date().toLocaleTimeString()}
        </div>
      </div>

      {/* Enhanced Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <StatCard
          title="Total Calls"
          value={stats?.totalCalls || 0}
          icon={<Phone className="h-6 w-6" />}
          color="blue"
        />
        <StatCard
          title="Active Calls"
          value={stats?.activeCalls || 0}
          icon={<Clock className="h-6 w-6" />}
          color="green"
        />
        <StatCard
          title="Total Bookings"
          value={stats?.totalBookings || 0}
          icon={<Calendar className="h-6 w-6" />}
          color="purple"
        />
        <StatCard
          title="Pending Bookings"
          value={stats?.pendingBookings || 0}
          icon={<TrendingUp className="h-6 w-6" />}
          color="orange"
        />
        <StatCard
          title="Emergency Bookings"
          value={getEmergencyBookings().length}
          icon={<AlertTriangle className="h-6 w-6" />}
          color="red"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Calendar View - Takes 2/3 width */}
        <div className="xl:col-span-2">
          <CalendarView 
            selectedDate={selectedDate}
            onDateSelect={handleDateSelect}
          />
        </div>

        {/* Recent Activity Sidebar - Takes 1/3 width */}
        <div className="space-y-6">
          {/* Priority Bookings */}
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="px-6 py-4 border-b">
              <div className="flex items-center space-x-2">
                <Star className="h-5 w-5 text-orange-500" />
                <h2 className="text-lg font-semibold text-gray-900">Priority Bookings</h2>
              </div>
            </div>
            <div className="p-6">
              {getEmergencyBookings().length > 0 ? (
                <div className="space-y-3">
                  {getEmergencyBookings().slice(0, 3).map((booking: any) => (
                    <div key={booking.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                      <div className="flex items-center space-x-3">
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {booking.customer_name || 'Unknown'}
                          </p>
                          <p className="text-xs text-red-600 font-medium">{booking.service_type}</p>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">
                        {booking.preferred_date ? 
                          new Date(booking.preferred_date).toLocaleDateString() : 
                          'Date TBC'
                        }
                      </div>
                    </div>
                  ))}
                  {getEmergencyBookings().length > 3 && (
                    <div className="text-xs text-gray-500 text-center pt-2">
                      +{getEmergencyBookings().length - 3} more emergency bookings
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-6 text-sm">No emergency bookings</p>
              )}
            </div>
          </div>

          {/* Recent Calls */}
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Recent Calls</h2>
            </div>
            <div className="p-6">
              {stats?.recentCalls && stats.recentCalls.length > 0 ? (
                <div className="space-y-4">
                  {stats.recentCalls.slice(0, 5).map((call: any) => (
                    <div key={call.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="flex-shrink-0">
                          <div className={`w-3 h-3 rounded-full ${
                            call.status === 'completed' ? 'bg-green-400' :
                            call.status === 'in_progress' ? 'bg-blue-400' :
                            'bg-red-400'
                          }`}></div>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {call.caller_number || 'Unknown'}
                          </p>
                          <p className="text-xs text-gray-500 capitalize">{call.status}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">
                          {new Date(call.started_at).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-6 text-sm">No recent calls</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Day Details Modal */}
      {showDayDetails && selectedDate && (
        <DayBookingDetails
          date={selectedDate}
          bookings={getDayBookings(selectedDate)}
          onClose={() => setShowDayDetails(false)}
        />
      )}
    </div>
  )
}

interface StatCardProps {
  title: string
  value: number
  icon: React.ReactNode
  color: 'blue' | 'green' | 'purple' | 'orange' | 'red'
}

function StatCard({ title, value, icon, color }: StatCardProps) {
  const colorClasses = {
    blue: 'bg-blue-500 text-blue-600 bg-blue-50',
    green: 'bg-green-500 text-green-600 bg-green-50',
    purple: 'bg-purple-500 text-purple-600 bg-purple-50',
    orange: 'bg-orange-500 text-orange-600 bg-orange-50',
    red: 'bg-red-500 text-red-600 bg-red-50',
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`p-3 rounded-full ${colorClasses[color].split(' ')[2]}`}>
          <div className={`${colorClasses[color].split(' ')[1]}`}>
            {icon}
          </div>
        </div>
      </div>
    </div>
  )
}
