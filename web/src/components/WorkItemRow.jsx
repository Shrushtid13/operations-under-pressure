// web/src/components/WorkItemRow.jsx
import React from 'react';

// Priority rails: critical (4) rose, high (3) orange, medium (2) sky, low (1) gray
const PRIORITY_RAILS = {
  4: { rail: 'bg-rose-500', label: 'Critical', text: 'text-rose-600' },
  3: { rail: 'bg-amber-500', label: 'High', text: 'text-amber-600' },
  2: { rail: 'bg-sky-500', label: 'Medium', text: 'text-sky-600' },
  1: { rail: 'bg-slate-300', label: 'Low', text: 'text-slate-500' }
};

// Status: small dot plus label in sentence case
const STATUS_META = {
  open: { label: 'Open', dot: 'bg-slate-400' },
  in_progress: { label: 'In progress', dot: 'bg-blue-600' },
  pending_approval: { label: 'Pending approval', dot: 'bg-amber-500' },
  resolved: { label: 'Resolved', dot: 'bg-emerald-600' },
  closed: { label: 'Closed', dot: 'bg-slate-400' }
};

function formatRelativeTime(dateString) {
  if (!dateString) return '';
  const now = new Date();
  const date = new Date(dateString);
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function getInitials(name) {
  if (!name) return '';
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

export function WorkItemRow({ item, onClick }) {
  const priority = PRIORITY_RAILS[item.priority] || PRIORITY_RAILS[1];
  const status = STATUS_META[item.status] || STATUS_META.open;
  const isOverdue = item.is_overdue || (item.due_at && new Date(item.due_at) < new Date() && ['open', 'in_progress', 'pending_approval'].includes(item.status));
  const itemKey = item.item_key || `${item.team_key}-${item.number}`;
  const relativeTime = formatRelativeTime(item.updated_at || item.created_at);

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="relative flex items-center justify-between py-5 px-6 bg-white hover:bg-slate-50/80 border-b border-[#e2e8f0] last:border-b-0 cursor-pointer transition select-none group"
    >
      {/* 5px colored rail at left edge */}
      <span
        className={`absolute left-0 top-0 bottom-0 w-[5px] ${priority.rail}`}
        aria-hidden="true"
      />

      {/* Main item details */}
      <div className="flex-1 min-w-0 pr-6 pl-2.5">
        {/* Title: 17px semibold, dark charcoal */}
        <div className="text-[17px] font-semibold text-slate-900 group-hover:text-[#2f5bea] transition truncate leading-snug">
          {item.title}
        </div>

        {/* Meta row: Key · Status dot + label · Priority · Overdue (14.5px) */}
        <div className="flex items-center flex-wrap gap-x-2.5 text-[14.5px] text-slate-500 mt-1.5">
          <span className="font-semibold text-slate-800">{itemKey}</span>

          <span className="text-slate-300">·</span>

          {/* Status with dot */}
          <span className="inline-flex items-center space-x-2">
            <span className={`w-2.5 h-2.5 rounded-full ${status.dot}`} />
            <span className="capitalize-first text-slate-700 font-medium">{status.label}</span>
          </span>

          <span className="text-slate-300">·</span>

          {/* Priority label */}
          <span className={`font-semibold ${priority.text}`}>
            {priority.label}
          </span>

          {/* Overdue tag if applicable */}
          {isOverdue && (
            <>
              <span className="text-slate-300">·</span>
              <span className="text-rose-600 font-semibold">Overdue</span>
            </>
          )}

          {item.status === 'pending_approval' && (
            <>
              <span className="text-slate-300">·</span>
              <span className="text-amber-800 font-semibold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/80 text-[12.5px] inline-flex items-center space-x-1">
                <span>Fix submitted · Lead review required</span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* Right: Assignees avatar stack or 'Unassigned' + relative timestamp */}
      <div className="flex items-center space-x-6 shrink-0 text-[14.5px] text-slate-500">
        {item.assignees && item.assignees.length > 1 ? (
          <div
            className="flex items-center -space-x-2"
            title={`Assigned to: ${item.assignees.map((a) => a.name).join(', ')}`}
          >
            {item.assignees.slice(0, 3).map((a, idx) => (
              <div
                key={a.id}
                className={`w-8 h-8 rounded-full border-2 border-white text-white flex items-center justify-center font-bold text-[10px] shrink-0 shadow-xs ${
                  idx === 0 ? 'bg-[#2e7d32]' : idx === 1 ? 'bg-[#1d4ed8]' : 'bg-[#b45309]'
                }`}
              >
                {getInitials(a.name)}
              </div>
            ))}
            {item.assignees.length > 3 && (
              <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-700 text-white flex items-center justify-center font-bold text-[10px] shrink-0 shadow-xs">
                +{item.assignees.length - 3}
              </div>
            )}
          </div>
        ) : item.assignee_name ? (
          <div
            className="w-9 h-9 rounded-full bg-[#2e7d32] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs"
            title={`Assigned to ${item.assignee_name}`}
          >
            {getInitials(item.assignee_name)}
          </div>
        ) : (
          <span className="text-slate-400 font-medium">Unassigned</span>
        )}

        <span className="w-24 text-right tabular-nums text-slate-400 whitespace-nowrap">
          {relativeTime}
        </span>
      </div>
    </div>
  );
}
