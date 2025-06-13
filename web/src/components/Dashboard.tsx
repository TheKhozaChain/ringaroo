import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Phone, Calendar, Clock, TrendingUp } from 'lucide-react'
import { getDashboardStats } from '../services/api'

export default function Dashboard() {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
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
        <p className="text-red-700">Failed to load dashboard data. Please try again.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <div className="text-sm text-gray-500">
          Last updated: {new Date().toLocaleTimeString()}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Recent Calls</h2>
        </div>
        <div className="p-6">
          {stats?.recentCalls && stats.recentCalls.length > 0 ? (
            <div className="space-y-4">
              {stats.recentCalls.map((call: any) => (
                <div key={call.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
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
                        {call.caller_number || 'Unknown Number'}
                      </p>
                      <p className="text-sm text-gray-500 capitalize">{call.status}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-900">
                      {new Date(call.started_at).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-gray-500">
                      {new Date(call.started_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No recent calls</p>
          )}
        </div>
      </div>
    </div>
  )
}

interface StatCardProps {
  title: string
  value: number
  icon: React.ReactNode
  color: 'blue' | 'green' | 'purple' | 'orange'
}

function StatCard({ title, value, icon, color }: StatCardProps) {
  const colorClasses = {
    blue: 'bg-blue-500 text-blue-600 bg-blue-50',
    green: 'bg-green-500 text-green-600 bg-green-50',
    purple: 'bg-purple-500 text-purple-600 bg-purple-50',
    orange: 'bg-orange-500 text-orange-600 bg-orange-50',
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