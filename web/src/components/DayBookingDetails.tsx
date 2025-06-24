import React, { useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { Calendar, Clock, User, Phone, Mail, AlertTriangle, CheckCircle, XCircle, RotateCcw, Zap, UserPlus } from 'lucide-react'
import { updateBookingStatus, getTechnicians } from '../services/api'
import TechnicianAssignment from './TechnicianAssignment'

interface DayBookingDetailsProps {
  date: Date
  bookings: any[]
  onClose: () => void
}

export default function DayBookingDetails({ date, bookings, onClose }: DayBookingDetailsProps) {
  const [selectedBookingForAssignment, setSelectedBookingForAssignment] = useState<any | null>(null)
  const queryClient = useQueryClient()
  
  const { data: technicians = [] } = useQuery({
    queryKey: ['technicians'],
    queryFn: getTechnicians,
  })
  
  const updateBookingMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => 
      updateBookingStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
  })

  const getPriorityLevel = (booking: any) => {
    const emergencyKeywords = ['emergency', 'urgent', 'immediate', 'asap', 'termite', 'rodent', 'infestation']
    const isEmergency = emergencyKeywords.some(keyword => 
      booking.service_type?.toLowerCase().includes(keyword) ||
      booking.notes?.toLowerCase().includes(keyword)
    )
    
    if (isEmergency) return 'emergency'
    return 'normal'
  }

  const getServiceIcon = (serviceType: string) => {
    const type = serviceType?.toLowerCase() || ''
    if (type.includes('termite') || type.includes('pest')) return <Zap className="h-4 w-4" />
    if (type.includes('emergency')) return <AlertTriangle className="h-4 w-4" />
    return <Calendar className="h-4 w-4" />
  }

  const sortedBookings = [...bookings].sort((a, b) => {
    const aPriority = getPriorityLevel(a) === 'emergency' ? 0 : 1
    const bPriority = getPriorityLevel(b) === 'emergency' ? 0 : 1
    
    if (aPriority !== bPriority) return aPriority - bPriority
    
    if (a.preferred_time && b.preferred_time) {
      return a.preferred_time.localeCompare(b.preferred_time)
    }
    
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })

  const isToday = date.toDateString() === new Date().toDateString()
  const isPast = date < new Date(new Date().setHours(0, 0, 0, 0))

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">
                {isToday ? 'Today' : isPast ? 'Past Date' : 'Upcoming'} - {date.toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </h2>
              <p className="text-blue-100 mt-1">
                {bookings.length} {bookings.length === 1 ? 'booking' : 'bookings'} scheduled
              </p>
            </div>
            
            <button
              onClick={onClose}
              className="text-white hover:text-blue-200 transition-colors p-2"
            >
              <XCircle className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {bookings.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No bookings scheduled</h3>
              <p className="text-gray-500">This date is available for new bookings.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{bookings.length}</div>
                  <div className="text-sm text-blue-600">Total Bookings</div>
                </div>
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">
                    {bookings.filter(b => b.status === 'pending').length}
                  </div>
                  <div className="text-sm text-yellow-600">Pending</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {bookings.filter(b => b.status === 'confirmed').length}
                  </div>
                  <div className="text-sm text-green-600">Confirmed</div>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">
                    {bookings.filter(b => getPriorityLevel(b) === 'emergency').length}
                  </div>
                  <div className="text-sm text-red-600">Emergency</div>
                </div>
              </div>

              {/* Booking List */}
              <div className="space-y-4">
                {sortedBookings.map((booking) => {
                  const priority = getPriorityLevel(booking)
                  const isEmergency = priority === 'emergency'
                  
                  return (
                    <div
                      key={booking.id}
                      className={`
                        border-l-4 rounded-lg p-6 shadow-sm transition-shadow hover:shadow-md
                        ${isEmergency 
                          ? 'border-l-red-500 bg-red-50' 
                          : 'border-l-blue-500 bg-white border border-gray-200'
                        }
                      `}
                    >
                      {/* Booking Header */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          {isEmergency && (
                            <div className="flex items-center space-x-1 bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-semibold">
                              <AlertTriangle className="h-3 w-3" />
                              <span>EMERGENCY</span>
                            </div>
                          )}
                          
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
                        
                        <div className="text-xs text-gray-500">
                          ID: {booking.id.substring(0, 8)}...
                        </div>
                      </div>

                      {/* Booking Details Grid */}
                      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        {/* Customer Info */}
                        <div className="space-y-3">
                          <h4 className="font-medium text-gray-900 flex items-center space-x-2">
                            <User className="h-4 w-4 text-gray-400" />
                            <span>Customer</span>
                          </h4>
                          
                          <div className="space-y-2 text-sm">
                            <div className="font-medium">
                              {booking.customer_name || 'Unknown Customer'}
                            </div>
                            
                            {booking.customer_phone && (
                              <div className="flex items-center space-x-2 text-gray-600">
                                <Phone className="h-3 w-3" />
                                <span>{booking.customer_phone}</span>
                              </div>
                            )}
                            
                            {booking.customer_email && (
                              <div className="flex items-center space-x-2 text-gray-600">
                                <Mail className="h-3 w-3" />
                                <span>{booking.customer_email}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Service Info */}
                        <div className="space-y-3">
                          <h4 className="font-medium text-gray-900 flex items-center space-x-2">
                            {getServiceIcon(booking.service_type)}
                            <span>Service</span>
                          </h4>
                          
                          <div className="space-y-2 text-sm">
                            <div className="font-medium capitalize">
                              {booking.service_type || 'Service Not Specified'}
                            </div>
                            
                            <div className="flex items-center space-x-2 text-gray-600">
                              <Clock className="h-3 w-3" />
                              <span>
                                {booking.preferred_time || 'Time TBC'}
                              </span>
                            </div>
                            
                            <div className="text-xs text-gray-500">
                              Booked: {new Date(booking.created_at).toLocaleString()}
                            </div>
                          </div>
                        </div>

                        {/* Technician Assignment */}
                        <div className="space-y-3">
                          <h4 className="font-medium text-gray-900 flex items-center space-x-2">
                            <User className="h-4 w-4 text-gray-400" />
                            <span>Technician</span>
                          </h4>
                          
                          <div className="space-y-2">
                            {booking.technician_id ? (
                              <div className="text-sm">
                                <div className="font-medium text-green-700">
                                  {technicians.find(t => t.id === booking.technician_id)?.name || 'Unknown Technician'}
                                </div>
                                <div className="text-xs text-gray-500">
                                  Assigned {booking.assigned_at ? new Date(booking.assigned_at).toLocaleString() : 'recently'}
                                </div>
                              </div>
                            ) : (
                              <div className="text-sm text-gray-500">
                                Not assigned
                              </div>
                            )}
                            
                            <button
                              onClick={() => setSelectedBookingForAssignment(booking)}
                              className="flex items-center space-x-1 px-3 py-2 bg-blue-100 text-blue-700 text-sm font-medium rounded-md hover:bg-blue-200 transition-colors"
                            >
                              <UserPlus className="h-4 w-4" />
                              <span>{booking.technician_id ? 'Reassign' : 'Assign'}</span>
                            </button>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="space-y-3">
                          <h4 className="font-medium text-gray-900">Actions</h4>
                          
                          {booking.status === 'pending' && (
                            <div className="flex flex-col space-y-2">
                              <button
                                onClick={() => updateBookingMutation.mutate({ id: booking.id, status: 'confirmed' })}
                                disabled={updateBookingMutation.isPending}
                                className="flex items-center justify-center space-x-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
                              >
                                <CheckCircle className="h-4 w-4" />
                                <span>Confirm Booking</span>
                              </button>
                              
                              <button
                                onClick={() => updateBookingMutation.mutate({ id: booking.id, status: 'cancelled' })}
                                disabled={updateBookingMutation.isPending}
                                className="flex items-center justify-center space-x-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
                              >
                                <XCircle className="h-4 w-4" />
                                <span>Cancel Booking</span>
                              </button>
                            </div>
                          )}
                          
                          {booking.status === 'confirmed' && (
                            <div className="flex flex-col space-y-2">
                              <button
                                onClick={() => updateBookingMutation.mutate({ id: booking.id, status: 'pending' })}
                                disabled={updateBookingMutation.isPending}
                                className="flex items-center justify-center space-x-2 px-4 py-2 bg-yellow-600 text-white text-sm font-medium rounded-md hover:bg-yellow-700 disabled:opacity-50 transition-colors"
                              >
                                <RotateCcw className="h-4 w-4" />
                                <span>Reschedule</span>
                              </button>
                              
                              <button
                                onClick={() => updateBookingMutation.mutate({ id: booking.id, status: 'cancelled' })}
                                disabled={updateBookingMutation.isPending}
                                className="flex items-center justify-center space-x-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
                              >
                                <XCircle className="h-4 w-4" />
                                <span>Cancel</span>
                              </button>
                            </div>
                          )}
                          
                          {booking.status === 'cancelled' && (
                            <div className="text-sm text-gray-500 italic">
                              Booking cancelled
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        
        {/* Technician Assignment Modal */}
        {selectedBookingForAssignment && (
          <TechnicianAssignment
            booking={selectedBookingForAssignment}
            onClose={() => setSelectedBookingForAssignment(null)}
            onAssigned={() => setSelectedBookingForAssignment(null)}
          />
        )}
      </div>
    </div>
  )
}