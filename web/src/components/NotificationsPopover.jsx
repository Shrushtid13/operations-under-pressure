// web/src/components/NotificationsPopover.jsx
import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Calendar,
  Check,
  Clock,
  MessageSquare,
  Video,
  X
} from 'lucide-react';
import { api } from '../api.js';

export function NotificationsPopover({
  notifications = [],
  unreadCount = 0,
  onClose,
  onSelectItem,
  onRefresh
}) {
  const handleNotificationClick = async (notif) => {
    if (!notif.read_at) {
      try {
        await api.markNotificationRead(notif.id);
        onRefresh();
      } catch {
        // ignore
      }
    }
    if (notif.work_item_id) {
      onSelectItem(notif.work_item_id);
    }
    onClose();
  };

  const formatDeadline = (dueAt) => {
    if (!dueAt) return '';
    const d = new Date(dueAt);
    return d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-end font-sans">
      <div className="bg-white border-l border-slate-200 w-full max-w-sm h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Bell className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">Notifications & Reminders</h3>
            {unreadCount > 0 && (
              <span className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {!notifications || notifications.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              <Bell className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <span className="font-medium">No notifications yet</span>
              <p className="text-[11px] text-slate-400 mt-1">
                Reminders for upcoming and overdue deadlines will appear here.
              </p>
            </div>
          ) : (
            notifications.map((n) => {
              const isApproaching = n.kind === 'deadline_approaching' || n.event_type === 'deadline_approaching';
              const isOverdue = n.kind === 'deadline_overdue' || n.event_type === 'deadline_overdue';
              const isCall = Boolean(n.call_id) || n.event_type === 'call_invite';
              const isChat = Boolean(n.message_id) || n.event_type === 'team_message';

              let cardBg = !n.read_at ? 'bg-indigo-50/40' : 'bg-white';
              let borderAccent = '';

              if (isApproaching) {
                cardBg = !n.read_at ? 'bg-amber-50/70 border-l-4 border-amber-500' : 'bg-amber-50/30';
              } else if (isOverdue) {
                cardBg = !n.read_at ? 'bg-rose-50/70 border-l-4 border-rose-500' : 'bg-rose-50/30';
              } else if (isCall) {
                cardBg = !n.read_at ? 'bg-emerald-50/60 border-l-4 border-emerald-500' : 'bg-white';
              }

              return (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`p-4 hover:bg-slate-50 cursor-pointer transition text-xs space-y-1.5 ${cardBg} ${borderAccent}`}
                >
                  {/* Top Bar: Tag & Time */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      {isApproaching ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-[10px] text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full">
                          <Clock className="w-3 h-3 text-amber-600" />
                          Deadline Approaching
                        </span>
                      ) : isOverdue ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-[10px] text-rose-700 bg-rose-100/80 px-2 py-0.5 rounded-full">
                          <AlertCircle className="w-3 h-3 text-rose-600" />
                          Deadline Overdue
                        </span>
                      ) : isCall ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-[10px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                          <Video className="w-3 h-3 text-emerald-600" />
                          War Room Call
                        </span>
                      ) : isChat ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-[10px] text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                          <MessageSquare className="w-3 h-3 text-blue-600" />
                          Team Chat
                        </span>
                      ) : (
                        <span className="font-mono text-xs font-bold text-indigo-600">
                          {n.team_key ? `${n.team_key}-${n.item_number}` : 'Alert'}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3" />
                      {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* Title */}
                  <div className="font-bold text-slate-900 leading-tight">
                    {n.item_title || n.call_title || 'Team update'}
                  </div>

                  {/* Body / Context */}
                  {isApproaching && (
                    <div className="text-[11px] text-amber-900 font-medium flex items-center gap-1">
                      <span>Target deadline:</span>
                      <span className="font-semibold">{formatDeadline(n.item_due_at)}</span>
                    </div>
                  )}

                  {isOverdue && (
                    <div className="text-[11px] text-rose-900 font-medium flex items-center gap-1">
                      <span>Was due:</span>
                      <span className="font-semibold">{formatDeadline(n.item_due_at)}</span>
                    </div>
                  )}

                  {!isApproaching && !isOverdue && (
                    <div className="text-[11px] text-slate-500">
                      {n.actor_name} triggered{' '}
                      <span className="text-slate-700 font-semibold">
                        {String(n.kind || '').replace('work_item.', '')}
                      </span>
                    </div>
                  )}

                  {!n.read_at && (
                    <div className="flex items-center justify-between pt-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-indigo-600"></span>
                      <span className="text-[10px] text-indigo-600 font-medium">Click to open</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
