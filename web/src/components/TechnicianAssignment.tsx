import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { User, Clock, MapPin, Phone, Mail, Star, AlertTriangle, CheckCircle, XCircle, Zap, Wrench } from 'lucide-react'
import { getTechnicians, getRecommendedTechnicians, assignTechnician, type Technician, type Booking } from '../services/api'

interface TechnicianAssignmentProps {
  booking: Booking
  onClose: () => void
  onAssigned?: () => void
}

export default function TechnicianAssignment({ booking, onClose, onAssigned }: TechnicianAssignmentProps) {
  const [selectedTechnician, setSelectedTechnician] = useState<string | null>(booking.technician_id || null)
  const [showRecommendations, setShowRecommendations] = useState(true)
  const queryClient = useQueryClient()

  const { data: allTechnicians = [] } = useQuery({
    queryKey: ['technicians'],
    queryFn: getTechnicians,
  })

  const { data: recommendedTechnicians = [] } = useQuery({
    queryKey: ['recommended-technicians', booking.service_type, booking.priority_level],
    queryFn: () => getRecommendedTechnicians(
      booking.service_type,
      booking.priority_level === 'emergency'
    ),
    enabled: showRecommendations,
  })

  const assignMutation = useMutation({
    mutationFn: (technicianId: string | null) => assignTechnician(booking.id, technicianId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      onAssigned?.()
    },
  })

  const handleAssign = () => {
    assignMutation.mutate(selectedTechnician)
  }

  const handleUnassign = () => {
    assignMutation.mutate(null)
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'emergency': return 'text-red-600 bg-red-50'
      case 'high': return 'text-orange-600 bg-orange-50'
      case 'medium': return 'text-yellow-600 bg-yellow-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  const getServiceIcon = (serviceType: string) => {
    const type = serviceType?.toLowerCase() || ''
    if (type.includes('termite') || type.includes('pest')) return <Zap className="h-4 w-4" />
    if (type.includes('emergency')) return <AlertTriangle className="h-4 w-4" />
    return <Wrench className="h-4 w-4" />
  }

  const isEmergency = booking.priority_level === 'emergency'
  const techniciansToShow = showRecommendations ? recommendedTechnicians : allTechnicians
  const currentlyAssigned = allTechnicians.find(t => t.id === booking.technician_id)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-4 text-white ${isEmergency ? 'bg-red-600' : 'bg-blue-600'}`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold flex items-center space-x-2">
                <User className="h-5 w-5" />
                <span>Assign Technician</span>
                {isEmergency && <AlertTriangle className="h-5 w-5 text-red-200" />}
              </h2>
              <p className="text-blue-100 mt-1">
                {booking.customer_name} - {booking.service_type}
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
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Booking Summary */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center space-x-2">
                {getServiceIcon(booking.service_type)}
                <span className="font-medium">{booking.service_type}</span>
              </div>
              
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-gray-400" />
                <span>
                  {booking.preferred_date ? 
                    new Date(booking.preferred_date).toLocaleDateString() : 
                    'Date TBC'
                  } 
                  {booking.preferred_time && ` at ${booking.preferred_time}`}
                </span>
              </div>
              
              <div className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${getPriorityColor(booking.priority_level)}`}>
                {booking.priority_level.toUpperCase()} PRIORITY
              </div>
            </div>
          </div>

          {/* Currently Assigned */}
          {currentlyAssigned && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <h4 className="font-medium text-green-900">Currently Assigned</h4>
                    <p className="text-green-700">{currentlyAssigned.name}</p>
                  </div>
                </div>
                
                <button
                  onClick={handleUnassign}
                  disabled={assignMutation.isPending}
                  className="px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  Unassign
                </button>
              </div>
            </div>
          )}

          {/* Filter Toggle */}
          <div className="flex items-center space-x-4 mb-6">
            <button
              onClick={() => setShowRecommendations(true)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                showRecommendations
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Recommended ({recommendedTechnicians.length})
            </button>
            
            <button
              onClick={() => setShowRecommendations(false)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                !showRecommendations
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All Technicians ({allTechnicians.length})
            </button>
          </div>

          {/* Technician List */}
          <div className="space-y-4">
            {techniciansToShow.length === 0 ? (
              <div className="text-center py-8">
                <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {showRecommendations ? 'No recommended technicians' : 'No technicians available'}
                </h3>
                <p className="text-gray-500">
                  {showRecommendations 
                    ? 'Try viewing all technicians or check availability requirements.'
                    : 'No technicians are currently active.'
                  }
                </p>
              </div>
            ) : (
              techniciansToShow.map((technician) => (
                <div
                  key={technician.id}
                  className={`
                    border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md
                    ${selectedTechnician === technician.id 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300'
                    }
                    ${technician.emergencyContact && isEmergency ? 'ring-2 ring-orange-200' : ''}
                  `}
                  onClick={() => setSelectedTechnician(technician.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className={`
                        w-12 h-12 rounded-full flex items-center justify-center font-semibold text-white
                        ${technician.emergencyContact ? 'bg-orange-500' : 'bg-blue-500'}
                      `}>
                        {technician.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h3 className="font-semibold text-gray-900">{technician.name}</h3>
                          {technician.emergencyContact && (
                            <div className="flex items-center space-x-1 bg-orange-100 text-orange-700 px-2 py-1 rounded-full text-xs font-medium">
                              <Star className="h-3 w-3" />
                              <span>Emergency</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center space-x-4 mt-1 text-sm text-gray-600">
                          {technician.phone && (
                            <div className="flex items-center space-x-1">
                              <Phone className="h-3 w-3" />
                              <span>{technician.phone}</span>
                            </div>
                          )}
                          
                          {technician.email && (
                            <div className="flex items-center space-x-1">
                              <Mail className="h-3 w-3" />
                              <span>{technician.email}</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="mt-2">
                          <div className="flex flex-wrap gap-1">
                            {technician.specialties.slice(0, 3).map((specialty, index) => (
                              <span
                                key={index}
                                className="inline-flex px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-md"
                              >
                                {specialty}
                              </span>
                            ))}
                            {technician.specialties.length > 3 && (
                              <span className="text-xs text-gray-500">
                                +{technician.specialties.length - 3} more
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      {technician.bookingsCount !== undefined && (
                        <div className="text-sm text-gray-600">
                          <span className="font-medium">{technician.bookingsCount}</span>
                          <span className="text-gray-400"> / {technician.maxDailyBookings}</span>
                          <div className="text-xs text-gray-500">bookings today</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {selectedTechnician ? (
              `Selected: ${techniciansToShow.find(t => t.id === selectedTechnician)?.name || 'Unknown'}`
            ) : (
              'Select a technician to assign'
            )}
          </div>
          
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            
            <button
              onClick={handleAssign}
              disabled={!selectedTechnician || assignMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {assignMutation.isPending ? 'Assigning...' : 'Assign Technician'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
