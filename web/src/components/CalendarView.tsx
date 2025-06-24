import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calendar, ChevronLeft, ChevronRight, Clock, User, AlertTriangle, Zap } from 'lucide-react'
import { getBookings } from '../services/api'

interface CalendarViewProps {
  selectedDate?: Date
  onDateSelect?: (date: Date) => void
}

export default function CalendarView({ selectedDate, onDateSelect }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(selectedDate || new Date())
  
  const { data: bookings = [] } = useQuery({
    queryKey: ['bookings'],
    queryFn: getBookings,
    refetchInterval: 30000,
  })

  // Generate calendar days
  const { days, monthName, year } = useMemo(() => {
    const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
    const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)
    const startDate = new Date(start)
    startDate.setDate(startDate.getDate() - start.getDay()) // Start from Sunday
    
    const days = []
    const currentDate = new Date(startDate)
    
    // Generate 42 days (6 weeks)
    for (let i = 0; i < 42; i++) {
      days.push(new Date(currentDate))
      currentDate.setDate(currentDate.getDate() + 1)
    }
    
    return {
      days,
      monthName: start.toLocaleDateString('en-US', { month: 'long' }),
      year: start.getFullYear()
    }
  }, [currentMonth])

  // Group bookings by date
  const bookingsByDate = useMemo(() => {
    const grouped: Record<string, any[]> = {}
    
    bookings.forEach(booking => {
      if (booking.preferred_date) {
        const dateKey = new Date(booking.preferred_date).toDateString()
        if (!grouped[dateKey]) {
          grouped[dateKey] = []
        }
        grouped[dateKey].push(booking)
      }
    })
    
    return grouped
  }, [bookings])

  const getPriorityLevel = (booking: any) => {
    const emergencyKeywords = ['emergency', 'urgent', 'immediate', 'asap', 'termite', 'rodent', 'infestation']
    const isEmergency = emergencyKeywords.some(keyword => 
      booking.service_type?.toLowerCase().includes(keyword) ||
      booking.notes?.toLowerCase().includes(keyword)
    )
    
    if (isEmergency) return 'emergency'
    return 'normal'
  }

  const getDayBookings = (date: Date) => {
    return bookingsByDate[date.toDateString()] || []
  }

  const isToday = (date: Date) => {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === currentMonth.getMonth()
  }

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newMonth = new Date(currentMonth)
    newMonth.setMonth(newMonth.getMonth() + (direction === 'next' ? 1 : -1))
    setCurrentMonth(newMonth)
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      {/* Calendar Header */}
      <div className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center space-x-2">
          <Calendar className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Calendar View</h2>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => navigateMonth('prev')}
              className="p-2 hover:bg-gray-100 rounded-md transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            
            <h3 className="text-lg font-medium text-gray-900 min-w-[180px] text-center">
              {monthName} {year}
            </h3>
            
            <button
              onClick={() => navigateMonth('next')}
              className="p-2 hover:bg-gray-100 rounded-md transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          
          <button
            onClick={() => setCurrentMonth(new Date())}
            className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors"
          >
            Today
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="p-6">
        {/* Day Headers */}
        <div className="grid grid-cols-7 gap-px mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="p-2 text-center text-sm font-medium text-gray-500">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
          {days.map((date, index) => {
            const dayBookings = getDayBookings(date)
            const hasBookings = dayBookings.length > 0
            const hasEmergency = dayBookings.some(b => getPriorityLevel(b) === 'emergency')
            const hasPending = dayBookings.some(b => b.status === 'pending')
            
            return (
              <div
                key={index}
                onClick={() => onDateSelect?.(date)}
                className={`
                  min-h-[100px] bg-white p-2 cursor-pointer hover:bg-gray-50 transition-colors
                  ${!isCurrentMonth(date) ? 'text-gray-400 bg-gray-50' : ''}
                  ${isToday(date) ? 'bg-blue-50 border-2 border-blue-200' : ''}
                  ${selectedDate?.toDateString() === date.toDateString() ? 'ring-2 ring-blue-500' : ''}
                `}
              >
                {/* Date Number */}
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-medium ${isToday(date) ? 'text-blue-600' : ''}`}>
                    {date.getDate()}
                  </span>
                  
                  {hasEmergency && (
                    <AlertTriangle className="h-3 w-3 text-red-500" />
                  )}
                </div>

                {/* Booking Indicators */}
                {hasBookings && (
                  <div className="space-y-1">
                    {dayBookings.slice(0, 3).map((booking, bookingIndex) => {
                      const priority = getPriorityLevel(booking) 
                      const isEmergencyBooking = priority === 'emergency'
                      
                      return (
                        <div
                          key={bookingIndex}
                          className={`
                            text-xs p-1 rounded truncate flex items-center space-x-1
                            ${booking.status === 'confirmed' 
                              ? 'bg-green-100 text-green-800' 
                              : booking.status === 'cancelled'
                              ? 'bg-red-100 text-red-800'
                              : isEmergencyBooking
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                            }
                          `}
                        >
                          {isEmergencyBooking ? (
                            <Zap className="h-2 w-2 flex-shrink-0" />
                          ) : (
                            <User className="h-2 w-2 flex-shrink-0" />
                          )}
                          <span className="truncate">
                            {booking.customer_name || 'Unknown'}
                          </span>
                        </div>
                      )
                    })}
                    
                    {dayBookings.length > 3 && (
                      <div className="text-xs text-gray-500 font-medium">
                        +{dayBookings.length - 3} more
                      </div>
                    )}
                  </div>
                )}

                {/* Empty State for Current Month Days */}
                {!hasBookings && isCurrentMonth(date) && !isToday(date) && (
                  <div className="text-xs text-gray-400 mt-2">
                    Available
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="px-6 pb-6">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-green-100 rounded"></div>
              <span>Confirmed</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-yellow-100 rounded"></div>
              <span>Pending</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-red-100 rounded"></div>
              <span>Emergency/Cancelled</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-2 text-gray-500">
            <AlertTriangle className="h-3 w-3" />
            <span>Emergency Service</span>
          </div>
        </div>
      </div>
    </div>
  )
}
