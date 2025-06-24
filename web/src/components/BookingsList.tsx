import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Calendar, Phone, Mail, Clock, AlertTriangle, CheckCircle, XCircle, RotateCcw, User, Zap, Star } from 'lucide-react'
import { getBookings, updateBookingStatus, type Booking } from '../services/api'

export default function BookingsList() {
  const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed' | 'cancelled'>('all')
  const queryClient = useQueryClient()
  
  const { data: bookings, isLoading, error } = useQuery({
    queryKey: ['bookings'],
    queryFn: getBookings,
    refetchInterval: 30000, // Refresh every 30 seconds for real-time updates
  })

  const updateBookingMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => 
      updateBookingStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
  })

  const getPriorityLevel = (booking: Booking) => {
    const now = new Date()
    const preferredDate = booking.preferred_date ? new Date(booking.preferred_date) : null
    const createdAt = new Date(booking.created_at)
    const hoursSinceCreated = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60)
    
    // Emergency keywords in service type or notes
    const emergencyKeywords = ['emergency', 'urgent', 'immediate', 'asap', 'termite', 'rodent', 'infestation']
    const isEmergency = emergencyKeywords.some(keyword => 
      booking.service_type?.toLowerCase().includes(keyword) ||
      booking.notes?.toLowerCase().includes(keyword)
    )
    
    if (isEmergency) return 'emergency'
    if (preferredDate && preferredDate <= new Date(now.getTime() + 24 * 60 * 60 * 1000)) return 'high' // Within 24 hours
    if (hoursSinceCreated > 2 && booking.status === 'pending') return 'medium' // Pending for over 2 hours
    return 'low'
  }

  const getServiceIcon = (serviceType: string) => {
    const type = serviceType?.toLowerCase() || ''
    if (type.includes('termite') || type.includes('pest')) return <Zap className="h-4 w-4" />
    if (type.includes('emergency')) return <AlertTriangle className="h-4 w-4" />
    return <Calendar className="h-4 w-4" />
  }

  const filteredBookings = bookings?.filter(booking => 
    filter === 'all' ? true : booking.status === filter
  ) || []

  const sortedBookings = [...filteredBookings].sort((a, b) => {
    const priorityOrder = { emergency: 0, high: 1, medium: 2, low: 3 }
    const aPriority = getPriorityLevel(a)
    const bPriority = getPriorityLevel(b)
    
    if (aPriority !== bPriority) {
      return priorityOrder[aPriority] - priorityOrder[bPriority]
    }
    
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

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
        <p className="text-red-700">Failed to load bookings. Please try again.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Live Feed Indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-3xl font-bold text-gray-900">Live Booking Feed</h1>
          <div className="flex items-center space-x-2 bg-green-50 px-3 py-1 rounded-full">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs font-medium text-green-700">Real-time</span>
          </div>
        </div>
        <div className="text-sm text-gray-500">
          {sortedBookings.length} of {bookings?.length || 0} bookings
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
        {[
          { key: 'all', label: 'All', count: bookings?.length || 0 },
          { key: 'pending', label: 'Pending', count: bookings?.filter(b => b.status === 'pending').length || 0 },
          { key: 'confirmed', label: 'Confirmed', count: bookings?.filter(b => b.status === 'confirmed').length || 0 },
          { key: 'cancelled', label: 'Cancelled', count: bookings?.filter(b => b.status === 'cancelled').length || 0 },
        ].map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setFilter(key as any)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              filter === key
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      {sortedBookings && sortedBookings.length > 0 ? (
        <div className="space-y-4">
          {sortedBookings.map((booking: Booking) => {
            const priority = getPriorityLevel(booking)
            const priorityColors = {
              emergency: 'border-l-red-500 bg-red-50',
              high: 'border-l-orange-500 bg-orange-50',
              medium: 'border-l-yellow-500 bg-yellow-50',
              low: 'border-l-gray-300 bg-white'
            }
            
            return (
              <div
                key={booking.id}
                className={`border-l-4 ${priorityColors[priority]} bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow`}
              >
                {/* Priority Badge */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    {priority === 'emergency' && (
                      <div className="flex items-center space-x-1 bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-semibold">
                        <AlertTriangle className="h-3 w-3" />
                        <span>EMERGENCY</span>
                      </div>
                    )}
                    {priority === 'high' && (
                      <div className="flex items-center space-x-1 bg-orange-100 text-orange-700 px-2 py-1 rounded-full text-xs font-semibold">
                        <Star className="h-3 w-3" />
                        <span>HIGH PRIORITY</span>
                      </div>
                    )}
                    {priority === 'medium' && (
                      <div className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full text-xs font-medium">
                        WAITING
                      </div>
                    )}
                  </div>
                  
                  {/* Status Badge */}
                  <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${
                    booking.status === 'confirmed' 
                      ? 'bg-green-100 text-green-800'
                      : booking.status === 'cancelled'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {booking.status.toUpperCase()}
                  </span>
                </div>

                {/* Customer Info */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <User className="h-4 w-4 text-gray-400" />
                      <span className="font-semibold text-gray-900">
                        {booking.customer_name || 'Unknown Customer'}
                      </span>
                    </div>
                    
                    {booking.customer_phone && (
                      <div className="flex items-center space-x-2 text-sm text-gray-600">
                        <Phone className="h-4 w-4 text-gray-400" />
                        <span>{booking.customer_phone}</span>
                      </div>
                    )}
                    
                    {booking.customer_email && (
                      <div className="flex items-center space-x-2 text-sm text-gray-600">
                        <Mail className="h-4 w-4 text-gray-400" />
                        <span>{booking.customer_email}</span>
                      </div>
                    )}
                  </div>

                  {/* Service Info */}
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      {getServiceIcon(booking.service_type)}
                      <span className="font-medium text-gray-900 capitalize">
                        {booking.service_type || 'Service Not Specified'}
                      </span>
                    </div>
                    
                    <div className="space-y-1">
                      {booking.preferred_date ? (
                        <div className="flex items-center space-x-2 text-sm text-gray-600">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          <span>{new Date(booking.preferred_date).toLocaleDateString()}</span>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500">Date to be confirmed</div>
                      )}
                      
                      {booking.preferred_time ? (
                        <div className="flex items-center space-x-2 text-sm text-gray-600">
                          <Clock className="h-4 w-4 text-gray-400" />
                          <span>{booking.preferred_time}</span>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500">Time to be confirmed</div>
                      )}
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex flex-col space-y-2">
                    <div className="text-xs text-gray-500 mb-2">
                      Created: {new Date(booking.created_at).toLocaleString()}
                    </div>
                    
                    {booking.status === 'pending' && (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => updateBookingMutation.mutate({ id: booking.id, status: 'confirmed' })}
                          disabled={updateBookingMutation.isPending}
                          className="flex items-center space-x-1 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                          <CheckCircle className="h-4 w-4" />
                          <span>Confirm</span>
                        </button>
                        
                        <button
                          onClick={() => updateBookingMutation.mutate({ id: booking.id, status: 'cancelled' })}
                          disabled={updateBookingMutation.isPending}
                          className="flex items-center space-x-1 px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
                        >
                          <XCircle className="h-4 w-4" />
                          <span>Cancel</span>
                        </button>
                      </div>
                    )}
                    
                    {booking.status === 'confirmed' && (
                      <button
                        onClick={() => updateBookingMutation.mutate({ id: booking.id, status: 'pending' })}
                        disabled={updateBookingMutation.isPending}
                        className="flex items-center space-x-1 px-3 py-2 bg-yellow-600 text-white text-sm font-medium rounded-md hover:bg-yellow-700 disabled:opacity-50 transition-colors w-fit"
                      >
                        <RotateCcw className="h-4 w-4" />
                        <span>Reschedule</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
          <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {filter === 'all' ? 'No bookings yet' : `No ${filter} bookings`}
          </h3>
          <p className="text-gray-500">
            {filter === 'all' 
              ? "When customers make bookings through your AI receptionist, they'll appear here."
              : `Switch to "All" to see bookings with other statuses.`
            }
          </p>
        </div>
      )}
    </div>
  )
}
