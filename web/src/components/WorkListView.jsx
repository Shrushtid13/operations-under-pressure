// web/src/components/WorkListView.jsx
import React, { useEffect, useRef, useCallback } from 'react';
import { WorkItemRow } from './WorkItemRow.jsx';
import { RefreshCw } from 'lucide-react';

export function WorkListView({
  title, // 'All work' or 'My work'
  items = [],
  isLoading,
  isError,
  onRetry,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  filters,
  onUpdateFilters,
  teams = [],
  selectedTeamId,
  onSelectTeam,
  onSelectItem
}) {
  const sentinelRef = useRef(null);

  // Status tabs per screenshot: All, Open, In progress, Pending approval, Resolved, Closed
  const statusTabs = [
    { id: '', label: 'All' },
    { id: 'open', label: 'Open' },
    { id: 'in_progress', label: 'In progress' },
    { id: 'pending_approval', label: 'Pending approval' },
    { id: 'resolved', label: 'Resolved' },
    { id: 'closed', label: 'Closed' }
  ];

  // Priority filter options
  const priorityOptions = [
    { value: '', label: 'Any priority' },
    { value: '4', label: 'Critical' },
    { value: '3', label: 'High' },
    { value: '2', label: 'Medium' },
    { value: '1', label: 'Low' }
  ];

  const isHistorical = filters.status === 'resolved' || filters.status === 'closed';

  // Keyset infinite scrolling with memoized IntersectionObserver
  const handleObserver = useCallback(
    (entries) => {
      const [target] = entries;
      if (target?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        onLoadMore?.();
      }
    },
    [hasNextPage, isFetchingNextPage, onLoadMore]
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;

    const observer = new IntersectionObserver(handleObserver, {
      rootMargin: '100px',
      threshold: 0.1
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [handleObserver, hasNextPage]);

  return (
    <div className="space-y-7">
      {/* Page Title: 32px / font-bold */}
      <h1 className="text-[32px] font-bold text-slate-900 tracking-tight leading-none">
        {title}
      </h1>

      {/* Filter and Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 text-[15px]">
        {/* Left: Status Pill Tabs */}
        <div className="inline-flex items-center p-1.5 bg-white border border-[#e2e8f0] rounded-2xl shadow-xs">
          {statusTabs.map((tab) => {
            const isSelected = (filters.status || '') === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  const updates = { status: tab.id };
                  if ((tab.id === 'resolved' || tab.id === 'closed') && filters.sort === 'priority') {
                    updates.sort = 'updated_at';
                  }
                  onUpdateFilters(updates);
                }}
                className={`px-4 py-2.5 rounded-xl text-[15px] font-medium transition cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-[#0f1f2e] text-white shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Right Filters: Team Filter, Priority Dropdown, Sort Dropdown, Needs attention checkbox */}
        <div className="flex items-center flex-wrap gap-3">
          {/* Team Filter (if user belongs to multiple teams) */}
          {teams.length > 1 && (
            <div className="relative">
              <select
                value={selectedTeamId || ''}
                onChange={(e) => onSelectTeam(e.target.value)}
                className="bg-white border border-[#e2e8f0] text-slate-700 text-[15px] font-medium rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#2f5bea] cursor-pointer shadow-xs appearance-none pr-8"
              >
                <option value="">All my teams</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.key} · {t.name}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-3 text-xs text-slate-400">▾</span>
            </div>
          )}

          {/* Priority Filter */}
          <div className="relative">
            <select
              value={filters.priority || ''}
              onChange={(e) => onUpdateFilters({ priority: e.target.value })}
              className="bg-white border border-[#e2e8f0] text-slate-700 text-[15px] font-medium rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#2f5bea] cursor-pointer shadow-xs appearance-none pr-8"
            >
              {priorityOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-3 text-xs text-slate-400">▾</span>
          </div>

          {/* Sort: Most urgent first vs Recently updated */}
          {!isHistorical && (
            <div className="relative">
              <select
                value={filters.sort || 'priority'}
                onChange={(e) => onUpdateFilters({ sort: e.target.value })}
                className="bg-white border border-[#e2e8f0] text-slate-700 text-[15px] font-medium rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#2f5bea] cursor-pointer shadow-xs appearance-none pr-8"
              >
                <option value="priority">Most urgent first</option>
                <option value="updated_at">Recently updated</option>
              </select>
              <span className="pointer-events-none absolute right-3 top-3 text-xs text-slate-400">▾</span>
            </div>
          )}

          {/* Needs attention toggle checkbox */}
          <label className="inline-flex items-center space-x-2 bg-white border border-[#e2e8f0] px-4 py-2.5 rounded-xl text-[15px] font-medium text-slate-700 cursor-pointer shadow-xs hover:bg-slate-50">
            <input
              type="checkbox"
              checked={filters.needs_attention === 'true'}
              onChange={(e) => onUpdateFilters({ needs_attention: e.target.checked ? 'true' : '' })}
              className="w-4 h-4 rounded text-[#2f5bea] focus:ring-0 cursor-pointer border-slate-300"
            />
            <span>Needs attention</span>
          </label>

          {/* Reset Filters button when any filter is active */}
          {(filters.status || filters.priority || filters.needs_attention === 'true' || selectedTeamId) && (
            <button
              onClick={() => {
                onSelectTeam?.('');
                onUpdateFilters({ status: '', priority: '', needs_attention: '', sort: 'priority' });
              }}
              className="text-xs font-semibold text-[#2f5bea] hover:text-[#264ecc] px-3.5 py-2.5 bg-blue-50 hover:bg-blue-100 rounded-xl transition cursor-pointer"
            >
              Reset filters ✕
            </button>
          )}
        </div>
      </div>

      {/* Main List Card Container (16px radius, border #e2e8f0) */}
      <div className="bg-white border border-[#e2e8f0] rounded-2xl overflow-hidden shadow-xs">
        {/* Loading Skeleton Rows */}
        {isLoading && items.length === 0 && (
          <div className="divide-y divide-[#e2e8f0]">
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="py-5 px-5 flex items-center justify-between animate-pulse">
                <div className="space-y-2.5 flex-1 pr-6">
                  <div className="h-5 bg-slate-200 rounded w-2/5"></div>
                  <div className="h-4 bg-slate-100 rounded w-1/4"></div>
                </div>
                <div className="w-8 h-8 rounded-full bg-slate-200 shrink-0"></div>
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {isError && (
          <div className="p-10 text-center space-y-4">
            <div className="text-base font-semibold text-slate-800">
              Failed to load work items from server
            </div>
            <button
              onClick={onRetry}
              className="px-4 py-2 bg-white border border-[#e2e8f0] hover:bg-slate-50 text-sm font-semibold text-slate-700 rounded-xl inline-flex items-center space-x-2 transition cursor-pointer shadow-xs"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !isError && items.length === 0 && (
          <div className="py-20 text-center text-slate-500 text-base space-y-3">
            <p>No work items match the selected criteria.</p>
            {(filters.status || filters.priority || filters.needs_attention === 'true' || selectedTeamId) && (
              <button
                onClick={() => {
                  onSelectTeam?.('');
                  onUpdateFilters({ status: '', priority: '', needs_attention: '', sort: 'priority' });
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-semibold rounded-xl transition cursor-pointer"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        {/* Items List */}
        {!isLoading && items.length > 0 && (
          <div>
            {items.map((item) => (
              <WorkItemRow
                key={item.id}
                item={item}
                onClick={() => onSelectItem(item.id)}
              />
            ))}
          </div>
        )}

        {/* Keyset Infinite Scroll Sentinel */}
        <div ref={sentinelRef} className="py-4 text-center text-sm text-slate-400">
          {isFetchingNextPage && <span>Loading more items...</span>}
          {!hasNextPage && items.length > 0 && <span>All items loaded</span>}
          {hasNextPage && !isFetchingNextPage && <span>Loading more as you scroll</span>}
        </div>
      </div>
    </div>
  );
}
