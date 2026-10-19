// web/src/components/WorkItemList.jsx
import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  FileCheck2,
  Filter,
  Plus,
  Search,
  User,
  X
} from 'lucide-react';

const PRIORITY_LABELS = {
  4: { label: 'P4 Urgent', color: 'text-red-400 bg-red-950/60 border-red-800/60' },
  3: { label: 'P3 High', color: 'text-amber-400 bg-amber-950/60 border-amber-800/60' },
  2: { label: 'P2 Medium', color: 'text-sky-400 bg-sky-950/60 border-sky-800/60' },
  1: { label: 'P1 Low', color: 'text-zinc-400 bg-zinc-800 border-zinc-700' }
};

const STATUS_CONFIG = {
  open: { label: 'Open', color: 'text-sky-400 bg-sky-950/50 border-sky-800/60' },
  in_progress: { label: 'In Progress', color: 'text-indigo-400 bg-indigo-950/50 border-indigo-800/60' },
  pending_approval: { label: 'Pending Approval', color: 'text-purple-400 bg-purple-950/50 border-purple-800/60' },
  resolved: { label: 'Resolved', color: 'text-emerald-400 bg-emerald-950/50 border-emerald-800/60' },
  closed: { label: 'Closed', color: 'text-zinc-400 bg-zinc-900 border-zinc-800' }
};

const KIND_LABELS = {
  customer_issue: 'Customer Issue',
  incident: 'Incident',
  payment: 'Payment',
  compliance: 'Compliance',
  task: 'Task'
};

export function WorkItemList({
  items,
  filters,
  onUpdateFilters,
  onResetFilters,
  onSelectItem,
  onOpenCreateModal,
  hasNextPage,
  onLoadMore,
  loadingMore,
  isLoading,
  canCreate
}) {
  const activeFilterCount = Object.keys(filters).filter((k) => filters[k] && k !== 'sort' && k !== 'team').length;

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
      {/* Filter and Search Bar */}
      <div className="p-4 border-b border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-zinc-900/40">
        {/* Left: Search input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search title, description, or key (e.g. OPS-1)..."
            value={filters.q || ''}
            onChange={(e) => onUpdateFilters({ q: e.target.value })}
            className="w-full bg-zinc-800/80 border border-zinc-700 text-xs text-zinc-200 pl-9 pr-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-zinc-500"
          />
          {filters.q && (
            <button
              onClick={() => onUpdateFilters({ q: '' })}
              className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Right: Quick toggles and Action */}
        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          {/* Status Tabs */}
          <div className="flex bg-zinc-800/80 p-0.5 rounded-lg border border-zinc-700 text-[11px]">
            {['', 'open', 'in_progress', 'pending_approval', 'resolved'].map((st) => (
              <button
                key={st || 'all'}
                onClick={() => onUpdateFilters({ status: st })}
                className={`px-2.5 py-1 rounded-md capitalize transition ${
                  filters.status === st
                    ? 'bg-zinc-700 text-white font-medium shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {st ? st.replace('_', ' ') : 'Active'}
              </button>
            ))}
          </div>

          {/* Needs Attention Toggle */}
          <button
            onClick={() => onUpdateFilters({ needs_attention: filters.needs_attention === 'true' ? '' : 'true' })}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center space-x-1.5 transition ${
              filters.needs_attention === 'true'
                ? 'bg-amber-950/80 border-amber-700 text-amber-300'
                : 'bg-zinc-800/80 border-zinc-700 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Needs Attention</span>
          </button>

          {/* Assigned to Me Toggle */}
          <button
            onClick={() => onUpdateFilters({ assignee: filters.assignee === 'me' ? '' : 'me' })}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center space-x-1.5 transition ${
              filters.assignee === 'me'
                ? 'bg-indigo-950/80 border-indigo-700 text-indigo-300'
                : 'bg-zinc-800/80 border-zinc-700 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>My Work</span>
          </button>

          {/* Reset Filters if any active */}
          {activeFilterCount > 0 && (
            <button
              onClick={onResetFilters}
              className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}

          {/* Create Button */}
          {canCreate && (
            <button
              onClick={onOpenCreateModal}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>New Work Item</span>
            </button>
          )}
        </div>
      </div>

      {/* Items List */}
      <div className="divide-y divide-zinc-800">
        {isLoading ? (
          <div className="p-8 text-center text-zinc-400 text-xs">
            <div className="animate-spin w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto mb-2"></div>
            Loading operational items...
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 text-xs">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-zinc-600 opacity-80" />
            <p className="font-medium text-zinc-400">No work items found</p>
            <p className="mt-1">Everything is up to date or matching filters are empty.</p>
          </div>
        ) : (
          items.map((item) => {
            const pConfig = PRIORITY_LABELS[item.priority] || PRIORITY_LABELS[1];
            const sConfig = STATUS_CONFIG[item.status] || STATUS_CONFIG.open;
            const isOverdue =
              item.due_at &&
              new Date(item.due_at) < new Date() &&
              ['open', 'in_progress', 'pending_approval'].includes(item.status);

            return (
              <div
                key={item.id}
                onClick={() => onSelectItem(item.id)}
                className="p-4 hover:bg-zinc-800/40 transition cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 group"
              >
                {/* Left: Key, Priority, Title, Meta */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1.5">
                    <span className="font-mono text-xs font-semibold text-indigo-400 bg-indigo-950/40 border border-indigo-800/40 px-2 py-0.5 rounded">
                      {item.team_key}-{item.number}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${pConfig.color}`}>
                      {pConfig.label}
                    </span>
                    <span className="text-[10px] text-zinc-400 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded capitalize">
                      {KIND_LABELS[item.kind] || item.kind}
                    </span>
                    {item.requires_approval && (
                      <span className="text-[10px] text-purple-300 bg-purple-950/60 border border-purple-800 px-2 py-0.5 rounded">
                        Requires Approval
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-medium text-zinc-100 group-hover:text-indigo-300 transition truncate">
                    {item.title}
                  </h3>

                  {item.description && (
                    <p className="text-xs text-zinc-400 truncate mt-0.5 max-w-2xl">
                      {item.description}
                    </p>
                  )}
                </div>

                {/* Right: Status, Assignee, Next Action, Timing */}
                <div className="flex md:flex-col items-end justify-between md:justify-center text-xs text-right space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${sConfig.color}`}>
                      {sConfig.label}
                    </span>
                    <span className="text-zinc-300 font-medium text-[11px] bg-zinc-800/80 border border-zinc-700/80 px-2 py-0.5 rounded">
                      {item.assignee_name || (
                        <span className="text-amber-400 flex items-center gap-1 font-normal">
                          <AlertCircle className="w-3 h-3" /> Unassigned
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="text-[11px] text-zinc-500 flex items-center gap-2">
                    {isOverdue && (
                      <span className="text-rose-400 font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Overdue
                      </span>
                    )}
                    <span>Updated {new Date(item.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Keyset Pagination Load More */}
      {hasNextPage && (
        <div className="p-3 border-t border-zinc-800 text-center bg-zinc-900/30">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="text-xs font-medium text-zinc-300 hover:text-white px-4 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition disabled:opacity-50"
          >
            {loadingMore ? 'Loading more...' : 'Load more items'}
          </button>
        </div>
      )}
    </div>
  );
}
