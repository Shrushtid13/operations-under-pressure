// web/src/components/NotificationsPopover.jsx
import React from 'react';
import { Bell, Check, Clock, X } from 'lucide-react';
import { api } from '../api.js';

export function NotificationsPopover({
  notifications,
  unreadCount,
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
    onSelectItem(notif.work_item_id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-end font-sans">
      <div className="bg-white border-l border-slate-200 w-full max-w-sm h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Bell className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">Notifications</h3>
            {unreadCount > 0 && (
              <span className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {!notifications || notifications.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              <Bell className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <span className="font-medium">No notifications yet</span>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`p-4 hover:bg-slate-50 cursor-pointer transition text-xs space-y-1 ${
                  !n.read_at ? 'bg-indigo-50/40' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-indigo-600">
                    {n.team_key}-{n.item_number}
                  </span>
                  <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                    <Clock className="w-3 h-3" />
                    {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="font-bold text-slate-900">{n.item_title}</div>
                <div className="text-[11px] text-slate-500">
                  {n.actor_name} triggered <span className="text-slate-700 font-semibold">{n.kind.replace('work_item.', '')}</span>
                </div>
                {!n.read_at && (
                  <span className="inline-block w-2 h-2 rounded-full bg-indigo-600 mt-1"></span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
