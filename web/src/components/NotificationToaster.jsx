// web/src/components/NotificationToaster.jsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  Bell,
  CheckCircle,
  ExternalLink,
  MessageSquare,
  PhoneCall,
  Video,
  X
} from 'lucide-react';

export function NotificationToaster({ onNavigate, onJoinCall }) {
  const [toasts, setToasts] = useState([]);

  // Add toast helper
  const addToast = useCallback((toast) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 6);
    const newToast = { id, ...toast, createdAt: Date.now() };
    setToasts((prev) => [newToast, ...prev.slice(0, 4)]); // Keep at most 5

    // Auto dismiss after 7 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 7000);
  }, []);

  // Listen to window custom events or expose global emitter
  useEffect(() => {
    const handleCustomToast = (e) => {
      if (e.detail) {
        addToast(e.detail);
      }
    };
    window.addEventListener('operations_push_notification', handleCustomToast);
    return () => window.removeEventListener('operations_push_notification', handleCustomToast);
  }, [addToast]);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-5 right-5 z-50 flex flex-col space-y-3 pointer-events-none max-w-sm w-full">
      {toasts.map((toast) => {
        const isCall = toast.type === 'call';
        const isChat = toast.type === 'chat';
        const isWork = toast.type === 'work_item';

        return (
          <div
            key={toast.id}
            className="pointer-events-auto bg-white border border-[#e2e8f0] rounded-2xl p-4 shadow-xl transition-all flex items-start space-x-3.5 animate-in slide-in-from-top-3"
          >
            {/* Icon */}
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                isCall
                  ? 'bg-rose-50 border border-rose-200 text-rose-600'
                  : isChat
                  ? 'bg-blue-50 border border-blue-200 text-blue-600'
                  : 'bg-emerald-50 border border-emerald-200 text-emerald-600'
              }`}
            >
              {isCall ? (
                <Video className="w-4 h-4" />
              ) : isChat ? (
                <MessageSquare className="w-4 h-4" />
              ) : (
                <Bell className="w-4 h-4" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pr-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {isCall ? 'War Room Call' : isChat ? 'Team Chat' : 'Operational Notice'}
                </span>
                <span className="text-[11px] text-slate-400">just now</span>
              </div>

              <div className="font-semibold text-slate-900 text-sm mt-0.5 truncate">
                {toast.title}
              </div>

              <div className="text-xs text-slate-600 mt-0.5 line-clamp-2 leading-relaxed">
                {toast.message}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2 mt-2.5">
                {isCall && toast.meeting_url && (
                  <a
                    href={toast.meeting_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => removeToast(toast.id)}
                    className="inline-flex items-center space-x-1 px-3 py-1 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold rounded-lg shadow-xs transition"
                  >
                    <span>Join Google Meet</span>
                    <ExternalLink className="w-3 h-3 ml-0.5" />
                  </a>
                )}

                {isChat && (
                  <button
                    onClick={() => {
                      removeToast(toast.id);
                      if (onNavigate) onNavigate('#/chat');
                    }}
                    className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer"
                  >
                    Open Chat
                  </button>
                )}

                {isWork && toast.work_item_id && (
                  <button
                    onClick={() => {
                      removeToast(toast.id);
                      if (onNavigate) onNavigate(`#/work/${toast.work_item_id}`);
                    }}
                    className="px-3 py-1 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer"
                  >
                    View Item
                  </button>
                )}
              </div>
            </div>

            {/* Dismiss */}
            <button
              onClick={() => removeToast(toast.id)}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// Global emitter helper so any component or WebSocket listener can trigger pop-ups
export function emitPushNotification(detail) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('operations_push_notification', { detail })
    );
  }
}
