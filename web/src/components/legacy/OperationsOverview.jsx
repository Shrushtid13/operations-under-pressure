// web/src/components/OperationsOverview.jsx
import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  FileCheck2,
  Filter,
  PlayCircle,
  RefreshCw,
  Search,
  Server,
  User,
  UserX,
  X
} from 'lucide-react';

const SEVERITY_CONFIG = {
  4: {
    label: 'P4',
    badge: 'bg-rose-50 text-rose-600 border-rose-200/80',
    dot: 'bg-rose-500'
  },
  3: {
    label: 'P3',
    badge: 'bg-amber-50 text-amber-600 border-amber-200/80',
    dot: 'bg-amber-500'
  },
  2: {
    label: 'P2',
    badge: 'bg-sky-50 text-sky-600 border-sky-200/80',
    dot: 'bg-sky-500'
  },
  1: {
    label: 'P1',
    badge: 'bg-slate-100 text-slate-600 border-slate-200',
    dot: 'bg-slate-400'
  }
};

const STATUS_CONFIG = {
  open: { label: 'Open', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  in_progress: { label: 'Investigating', color: 'bg-sky-50 text-sky-700 border-sky-200' },
  pending_approval: { label: 'Pending Approval', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  resolved: { label: 'Resolved', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  closed: { label: 'Closed', color: 'bg-slate-100 text-slate-500 border-slate-200' }
};

const KIND_NAMES = {
  incident: 'Incident',
  customer_issue: 'Customer Issue',
  payment: 'Payment',
  compliance: 'Compliance',
  task: 'Task'
};

export function OperationsOverview({
  summaryData,
  selectedTeamId,
  items,
  filters,
  onUpdateFilters,
  onResetFilters,
  onSelectItem,
  hasNextPage,
  onLoadMore,
  loadingMore,
  isLoading,
  isError,
  onRetry
}) {
  // Extract real metrics from /overview/summary
  const teamSummary = summaryData?.teams?.find((t) => String(t.team_id) === String(selectedTeamId));

  const stats = [
    {
      title: 'Open Incidents',
      count: teamSummary ? parseInt(teamSummary.open_count || 0, 10) : 0,
      icon: PlayCircle,
      accent: 'text-sky-600',
      active: filters.status === 'open',
      onClick: () => onUpdateFilters({ status: filters.status === 'open' ? '' : 'open' })
    },
    {
      title: 'Investigating',
      count: teamSummary ? parseInt(teamSummary.in_progress_count || 0, 10) : 0,
      icon: Clock,
      accent: 'text-indigo-600',
      active: filters.status === 'in_progress',
      onClick: () => onUpdateFilters({ status: filters.status === 'in_progress' ? '' : 'in_progress' })
    },
    {
      title: 'Pending Sign-Off',
      count: teamSummary ? parseInt(teamSummary.pending_approval_count || 0, 10) : 0,
      icon: FileCheck2,
      accent: 'text-purple-600',
      active: filters.status === 'pending_approval',
      onClick: () => onUpdateFilters({ status: filters.status === 'pending_approval' ? '' : 'pending_approval' })
    },
    {
      title: 'Unassigned',
      count: teamSummary ? parseInt(teamSummary.unassigned_count || 0, 10) : 0,
      icon: UserX,
      accent: 'text-amber-600',
      active: filters.assignee === 'none',
      onClick: () => onUpdateFilters({ assignee: filters.assignee === 'none' ? '' : 'none' })
    },
    {
      title: 'Overdue SLA',
      count: teamSummary ? parseInt(teamSummary.overdue_count || 0, 10) : 0,
      icon: AlertTriangle,
      accent: 'text-rose-600',
      active: filters.overdue === 'true',
      onClick: () => onUpdateFilters({ overdue: filters.overdue === 'true' ? '' : 'true' })
    },
    {
      title: 'Needs Attention',
      count: teamSummary ? parseInt(teamSummary.stale_count || 0, 10) : 0,
      icon: Clock,
      accent: 'text-slate-700',
      active: filters.needs_attention === 'true',
      onClick: () => onUpdateFilters({ needs_attention: filters.needs_attention === 'true' ? '' : 'true' })
    }
  ];

  const hasActiveFilters = Boolean(
    filters.status || filters.priority || filters.assignee || filters.overdue || filters.needs_attention || filters.q
  );

  return (
    <div className="space-y-6">
      {/* 1. Incident Workload Telemetry Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <button
              key={idx}
              onClick={stat.onClick}
              className={`p-4 bg-white rounded-2xl border transition text-left flex flex-col justify-between cursor-pointer shadow-sm ${
                stat.active
                  ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                  : 'border-slate-200/90 hover:border-slate-300 hover:shadow'
              }`}
            >
              <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold uppercase tracking-wider mb-2">
                <span>{stat.title}</span>
                <Icon className={`w-3.5 h-3.5 ${stat.accent}`} />
              </div>
              <div className={`text-2xl font-bold tracking-tight font-sans text-slate-900`}>
                {stat.count}
              </div>
            </button>
          );
        })}
      </div>

      {/* 2. Operational Filter & Sort Toolbar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm text-xs">
        {/* Left: Status and Severity Filters */}
        <div className="flex items-center space-x-2.5 flex-wrap gap-y-2">
          {/* Status Quick Pills */}
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs">
            {[
              { id: '', label: 'All Incidents' },
              { id: 'open', label: 'Open' },
              { id: 'in_progress', label: 'Investigating' },
              { id: 'pending_approval', label: 'Pending Approval' },
              { id: 'resolved', label: 'Resolved' }
            ].map((st) => (
              <button
                key={st.id || 'all'}
                onClick={() => onUpdateFilters({ status: st.id })}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer font-semibold text-xs ${
                  filters.status === st.id
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* Priority / Severity Selector */}
          <select
            value={filters.priority || ''}
            onChange={(e) => onUpdateFilters({ priority: e.target.value })}
            className="bg-white border border-slate-200 text-slate-700 font-medium text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-sm"
          >
            <option value="">All Severities</option>
            <option value="4">P4 — Critical</option>
            <option value="3">P3 — High</option>
            <option value="2">P2 — Medium</option>
            <option value="1">P1 — Low</option>
          </select>

          {/* Assignee Filter */}
          <select
            value={filters.assignee || ''}
            onChange={(e) => onUpdateFilters({ assignee: e.target.value })}
            className="bg-white border border-slate-200 text-slate-700 font-medium text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-sm"
          >
            <option value="">All Assignees</option>
            <option value="me">Assigned to Me</option>
            <option value="none">Unassigned Only</option>
          </select>

          {/* Overdue Checkbox */}
          <button
            onClick={() => onUpdateFilters({ overdue: filters.overdue === 'true' ? '' : 'true' })}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer ${
              filters.overdue === 'true'
                ? 'bg-rose-50 border-rose-300 text-rose-700 shadow-sm'
                : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 shadow-sm'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-rose-500" />
            <span>Overdue SLA</span>
          </button>

          {/* Reset Filters button */}
          {hasActiveFilters && (
            <button
              onClick={onResetFilters}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-2.5 py-1.5 flex items-center gap-1 cursor-pointer transition"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear filters</span>
            </button>
          )}
        </div>

        {/* Right: Sort selector */}
        <div className="flex items-center space-x-2 text-slate-500 text-xs font-medium">
          <ArrowUpDown className="w-3.5 h-3.5" />
          <span>Sort:</span>
          <select
            value={filters.sort || 'priority'}
            onChange={(e) => onUpdateFilters({ sort: e.target.value })}
            className="bg-white border border-slate-200 text-slate-700 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-sm"
          >
            <option value="priority">Priority, Updated (Default)</option>
            <option value="updated">Recently Updated</option>
          </select>
        </div>
      </div>

      {/* 3. Incident Data Table & List */}
      <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-sm">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-6 py-3.5 bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          <div className="col-span-2">Incident Key & Severity</div>
          <div className="col-span-5">Incident / Subject</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Owner</div>
          <div className="col-span-1 text-right">Updated</div>
        </div>

        {/* Content Rows */}
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-indigo-600" />
            <div className="text-xs font-medium">Loading operational items...</div>
          </div>
        ) : isError ? (
          <div className="p-12 text-center text-rose-600 space-y-3">
            <AlertCircle className="w-6 h-6 mx-auto text-rose-500" />
            <div className="text-xs font-semibold">Failed to retrieve operational work items</div>
            <button
              onClick={onRetry}
              className="px-3.5 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-medium transition cursor-pointer"
            >
              Retry Query
            </button>
          </div>
        ) : items?.length === 0 ? (
          <div className="p-16 text-center text-slate-500 space-y-2">
            <CheckCircle2 className="w-10 h-10 mx-auto text-slate-300" />
            <div className="text-sm font-bold text-slate-800">No active incidents found</div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              All operational work in this view has been resolved or no items match the query criteria.
            </p>
            {hasActiveFilters && (
              <button
                onClick={onResetFilters}
                className="mt-3 text-xs font-semibold text-indigo-600 hover:underline cursor-pointer"
              >
                Reset active filters
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((item) => {
              const severity = SEVERITY_CONFIG[item.priority] || SEVERITY_CONFIG[1];
              const status = STATUS_CONFIG[item.status] || STATUS_CONFIG.open;
              const isOverdue =
                item.due_at &&
                new Date(item.due_at) < new Date() &&
                ['open', 'in_progress', 'pending_approval'].includes(item.status);
              const isApproaching =
                item.due_at &&
                !isOverdue &&
                new Date(item.due_at) - new Date() <= 24 * 3600 * 1000 &&
                new Date(item.due_at) > new Date() &&
                ['open', 'in_progress', 'pending_approval'].includes(item.status);

              return (
                <div
                  key={item.id}
                  onClick={() => onSelectItem(item.id)}
                  className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-slate-50/70 transition cursor-pointer items-center text-xs group"
                >
                  {/* Key & Severity */}
                  <div className="col-span-2 flex items-center space-x-2">
                    <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 rounded-md">
                      {item.team_key}-{item.number}
                    </span>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded border ${severity.badge}`}>
                      <span>{severity.label}</span>
                    </span>
                  </div>

                  {/* Incident Subject & Description */}
                  <div className="col-span-5 min-w-0 pr-2">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-900 group-hover:text-indigo-600 transition truncate text-sm">
                        {item.title}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 truncate mt-0.5 flex items-center space-x-2">
                      <span>{KIND_NAMES[item.kind] || item.kind}</span>
                      {item.requires_approval && (
                        <span className="text-[10px] text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.2 rounded font-semibold">
                          Approval Required
                        </span>
                      )}
                      {item.description && <span className="truncate">· {item.description}</span>}
                    </div>
                  </div>

                  {/* Status */}
                  <div className="col-span-2">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${status.color}`}>
                      {status.label}
                    </span>
                  </div>

                  {/* Owner / Assignee */}
                  <div className="col-span-2">
                    {item.assignee_name ? (
                      <span className="text-slate-800 font-semibold flex items-center gap-2 truncate text-xs">
                        <span className="w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-bold">
                          {item.assignee_name[0]}
                        </span>
                        <span className="truncate">{item.assignee_name}</span>
                      </span>
                    ) : (
                      <span className="text-amber-600 text-xs font-semibold flex items-center gap-1 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full w-max">
                        <AlertCircle className="w-3 h-3" /> Unassigned
                      </span>
                    )}
                  </div>

                  {/* SLA / Updated */}
                  <div className="col-span-1 text-right text-xs">
                    {isOverdue ? (
                      <span className="text-rose-600 font-bold flex items-center justify-end gap-1">
                        <Clock className="w-3.5 h-3.5" /> Overdue
                      </span>
                    ) : isApproaching ? (
                      <span className="text-amber-600 font-bold flex items-center justify-end gap-1">
                        <Clock className="w-3.5 h-3.5" /> Due soon
                      </span>
                    ) : (
                      <span className="text-slate-400">{new Date(item.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Keyset Pagination Controls */}
        {hasNextPage && (
          <div className="p-4 border-t border-slate-100 text-center bg-slate-50/50">
            <button
              onClick={onLoadMore}
              disabled={loadingMore}
              className="px-5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {loadingMore ? 'Loading next page...' : 'Load more items (Keyset)'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
