// web/src/components/OverviewView.jsx
import React from 'react';
import { WorkItemRow } from './WorkItemRow.jsx';
import {
  AlertCircle,
  AlertTriangle,
  Clock,
  FileCheck,
  Moon,
  PlayCircle,
  RefreshCw,
  UserX
} from 'lucide-react';

export function OverviewView({
  user,
  summaryData,
  attentionItems = [],
  isLoadingAttention,
  onSelectItem,
  onFilterStatus,
  onFilterNeedsAttention
}) {
  // Aggregate summary counts across user's visible teams
  const teams = summaryData?.teams || [];

  const counts = teams.reduce(
    (acc, t) => ({
      open: acc.open + parseInt(t.open_count || 0, 10),
      in_progress: acc.in_progress + parseInt(t.in_progress_count || 0, 10),
      pending_approval: acc.pending_approval + parseInt(t.pending_approval_count || 0, 10),
      unassigned: acc.unassigned + parseInt(t.unassigned_count || 0, 10),
      overdue: acc.overdue + parseInt(t.overdue_count || 0, 10),
      stale: acc.stale + parseInt(t.stale_count || 0, 10)
    }),
    { open: 0, in_progress: 0, pending_approval: 0, unassigned: 0, overdue: 0, stale: 0 }
  );

  // Six summary count tiles per spec:
  // need attention, in progress, pending approval, overdue, unassigned, gone quiet
  const tiles = [
    {
      id: 'needs_attention',
      title: 'Need attention',
      count: counts.overdue + counts.unassigned + counts.stale,
      color: 'text-amber-600',
      border: 'hover:border-amber-400',
      onClick: () => onFilterNeedsAttention()
    },
    {
      id: 'in_progress',
      title: 'In progress',
      count: counts.in_progress,
      color: 'text-blue-600',
      border: 'hover:border-blue-400',
      onClick: () => onFilterStatus('in_progress')
    },
    {
      id: 'pending_approval',
      title: 'Pending approval',
      count: counts.pending_approval,
      color: 'text-amber-600',
      border: 'hover:border-amber-400',
      onClick: () => onFilterStatus('pending_approval')
    },
    {
      id: 'overdue',
      title: 'Overdue',
      count: counts.overdue,
      color: 'text-rose-600',
      border: 'hover:border-rose-400',
      onClick: () => onFilterNeedsAttention()
    },
    {
      id: 'unassigned',
      title: 'Unassigned',
      count: counts.unassigned,
      color: 'text-slate-700',
      border: 'hover:border-slate-400',
      onClick: () => onFilterStatus('open')
    },
    {
      id: 'stale',
      title: 'Gone quiet',
      count: counts.stale,
      color: 'text-slate-500',
      border: 'hover:border-slate-400',
      onClick: () => onFilterNeedsAttention()
    }
  ];

  return (
    <div className="space-y-8">
      {/* Greeting Header */}
      <div>
        <h1 className="text-[32px] font-bold text-slate-900 tracking-tight leading-none">
          Good day, {user?.name?.split(' ')[0] || 'Operator'}
        </h1>
        <p className="text-base text-slate-500 mt-2.5">
          Live operational workload and triage status across active incident streams.
        </p>
      </div>

      {/* Six Count Tiles (white cards with #e2e8f0 borders, tabular numbers) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {tiles.map((tile) => (
          <button
            key={tile.id}
            onClick={tile.onClick}
            className={`p-5 bg-white border border-[#e2e8f0] ${tile.border} rounded-2xl text-left transition shadow-xs cursor-pointer group hover:shadow-sm`}
          >
            <div className="text-sm font-medium text-slate-500 truncate group-hover:text-slate-800">
              {tile.title}
            </div>
            <div className={`text-3xl font-bold mt-2 tabular-nums ${tile.color}`}>
              {tile.count}
            </div>
          </button>
        ))}
      </div>

      {/* Needs Attention Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">
            Needs attention
          </h2>
          <span className="text-sm text-slate-500">
            Urgent, overdue, unassigned, or stale items
          </span>
        </div>

        <div className="bg-white border border-[#e2e8f0] rounded-2xl overflow-hidden shadow-xs">
          {isLoadingAttention && (
            <div className="divide-y divide-[#e3e8ee]">
              {[1, 2, 3].map((n) => (
                <div key={n} className="py-4 px-4 flex items-center justify-between animate-pulse">
                  <div className="space-y-2 flex-1 pr-6">
                    <div className="h-4 bg-slate-200 rounded w-2/5"></div>
                    <div className="h-3 bg-slate-100 rounded w-1/4"></div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-slate-200 shrink-0"></div>
                </div>
              ))}
            </div>
          )}

          {!isLoadingAttention && attentionItems.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-500">
              No items currently require immediate attention.
            </div>
          )}

          {!isLoadingAttention && attentionItems.length > 0 && (
            <div>
              {attentionItems.slice(0, 10).map((item) => (
                <WorkItemRow
                  key={item.id}
                  item={item}
                  onClick={() => onSelectItem(item.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
