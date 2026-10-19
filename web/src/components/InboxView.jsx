// web/src/components/InboxView.jsx
import React from 'react';
import { Bell, CheckCheck, Inbox, RefreshCw } from 'lucide-react';

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

export function InboxView({
  notifications = [],
  isLoading,
  onRefresh,
  onOpenNotification
}) {
  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold text-slate-900 tracking-tight leading-none">
            Inbox
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            Activity and assignment notifications across your teams.
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="p-1.5 bg-white border border-[#e3e8ee] hover:bg-slate-50 rounded-lg text-slate-600 transition cursor-pointer"
          title="Refresh inbox"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Notifications List Card */}
      <div className="bg-white border border-[#e3e8ee] rounded-[12px] overflow-hidden shadow-xs">
        {isLoading && notifications.length === 0 && (
          <div className="divide-y divide-[#e3e8ee]">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="p-4 space-y-2 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-1/3"></div>
                <div className="h-3 bg-slate-100 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && notifications.length === 0 && (
          <div className="py-16 text-center text-sm text-slate-500 space-y-2">
            <Inbox className="w-8 h-8 text-slate-300 mx-auto" />
            <div>Your inbox is clear.</div>
          </div>
        )}

        {!isLoading && notifications.length > 0 && (
          <div className="divide-y divide-[#e3e8ee]">
            {notifications.map((n) => {
              const isUnread = !n.read_at;
              const isChat = n.kind === 'chat_message' || !n.work_item_id;
              const itemKey = isChat ? `${n.team_key || 'Team'} Chat` : `${n.team_key}-${n.item_number}`;
              const title = isChat ? (n.message_content || 'New chat message') : n.item_title;
              return (
                <div
                  key={n.id}
                  onClick={() => onOpenNotification(n)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenNotification(n);
                    }
                  }}
                  className={`p-4 flex items-start justify-between cursor-pointer transition select-none ${
                    isUnread
                      ? 'bg-blue-50/40 hover:bg-blue-50/70 border-l-4 border-l-[#2f5bea]'
                      : 'bg-white hover:bg-slate-50 border-l-4 border-l-transparent'
                  }`}
                >
                  <div className="space-y-1 pr-4">
                    <div className="flex items-center space-x-2 text-xs">
                      <span className="font-semibold text-slate-900">{itemKey}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-500">{n.actor_name || 'Team member'}</span>
                      {isUnread && (
                        <span className="w-2 h-2 rounded-full bg-[#2f5bea]" />
                      )}
                    </div>
                    <div className={`text-sm ${isUnread ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                      {title}
                    </div>
                    <div className="text-xs text-slate-500 capitalize">
                      {isChat ? 'Team Chat Message' : `Event: ${n.event_type?.replace(/_/g, ' ')}`}
                    </div>
                  </div>

                  <span className="text-xs text-slate-400 tabular-nums shrink-0 whitespace-nowrap">
                    {formatRelativeTime(n.created_at)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
