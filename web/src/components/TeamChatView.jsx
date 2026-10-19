// web/src/components/TeamChatView.jsx
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessagesSquare, Send, Shield, Users } from 'lucide-react';
import { api } from '../api.js';

const ROLE_BADGE = {
  lead: { label: 'Lead', bg: 'bg-amber-100 text-amber-700 border-amber-200' },
  member: { label: 'Member', bg: 'bg-sky-100 text-sky-700 border-sky-200' },
  viewer: { label: 'Viewer', bg: 'bg-slate-100 text-slate-500 border-slate-200' }
};

function formatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  if (isYesterday) return `Yesterday ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// Hash a string to a deterministic hue for consistent avatar colors
function nameHue(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

export function TeamChatView({ user, teams = [], selectedTeamId, onSelectTeam }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const activeTeamId = selectedTeamId || (teams[0]?.id ? String(teams[0].id) : '');
  const activeTeam = teams.find((t) => String(t.id) === activeTeamId) || teams[0];

  const canSend = activeTeam?.role === 'member' || activeTeam?.role === 'lead';

  const {
    data: chatData,
    isLoading,
    refetch
  } = useQuery({
    queryKey: ['teamMessages', activeTeamId],
    queryFn: () => api.listTeamMessages(activeTeamId, { limit: 100 }),
    enabled: Boolean(activeTeamId),
    refetchInterval: 15000 // Fallback polling in case websocket is disconnected
  });

  const messages = chatData?.messages || [];

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Focus input when team changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeTeamId]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;

    setError('');
    setSending(true);

    try {
      const result = await api.sendTeamMessage(activeTeamId, text);
      setDraft('');
      // Optimistic update: append the new message immediately
      queryClient.setQueryData(['teamMessages', activeTeamId], (old) => {
        if (!old) return { messages: [result.message] };
        return { messages: [...old.messages, result.message] };
      });
    } catch (err) {
      setError(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Group messages by date for visual separators
  const groupedMessages = useMemo(() => {
    const groups = [];
    let lastDate = '';
    for (const msg of messages) {
      const d = new Date(msg.created_at);
      const dateStr = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
      if (dateStr !== lastDate) {
        groups.push({ type: 'date', label: dateStr, key: `date-${dateStr}` });
        lastDate = dateStr;
      }
      groups.push({ type: 'message', data: msg, key: `msg-${msg.id}` });
    }
    return groups;
  }, [messages]);

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] max-w-4xl">
      {/* Page Header */}
      <div className="flex items-center justify-between pb-5">
        <div>
          <h1 className="text-[26px] font-semibold text-slate-900 tracking-tight leading-none flex items-center gap-3">
            <MessagesSquare className="w-7 h-7 text-slate-600" />
            Team chat
          </h1>
          <p className="text-sm text-slate-500 mt-2 ml-10">
            Real-time communication across your operational teams.
          </p>
        </div>
      </div>

      {/* Team Channel Selector */}
      {teams.length > 1 && (
        <div className="flex items-center gap-2 pb-4">
          {teams.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelectTeam(String(t.id))}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition cursor-pointer border ${
                String(t.id) === activeTeamId
                  ? 'bg-[#2f5bea] text-white border-[#2f5bea] shadow-sm'
                  : 'bg-white text-slate-600 border-[#e2e8f0] hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              #{t.key?.toLowerCase() || t.name}
            </button>
          ))}
        </div>
      )}

      {/* Chat Body */}
      <div className="flex-1 bg-white border border-[#e2e8f0] rounded-2xl shadow-xs flex flex-col overflow-hidden">
        {/* Messages stream */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-1">
          {isLoading && (
            <div className="text-center text-sm text-slate-400 py-10">Loading messages…</div>
          )}

          {!isLoading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <MessagesSquare className="w-7 h-7 text-slate-400" />
              </div>
              <p className="text-base font-semibold text-slate-700">No messages yet</p>
              <p className="text-sm text-slate-400 mt-1 max-w-xs">
                {canSend
                  ? 'Start the conversation — type a message below to begin.'
                  : 'Viewers can read messages. Members and Leads can send.'}
              </p>
            </div>
          )}

          {groupedMessages.map((entry) => {
            if (entry.type === 'date') {
              return (
                <div key={entry.key} className="flex items-center gap-4 py-3">
                  <div className="flex-1 border-t border-slate-100" />
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">
                    {entry.label}
                  </span>
                  <div className="flex-1 border-t border-slate-100" />
                </div>
              );
            }

            const msg = entry.data;
            const isMe = String(msg.sender_id) === String(user?.id);
            const hue = nameHue(msg.sender_name);
            const roleBadge = ROLE_BADGE[msg.sender_role] || ROLE_BADGE.member;

            return (
              <div key={entry.key} className="flex items-start gap-3 group py-2 hover:bg-slate-50/50 -mx-3 px-3 rounded-xl transition">
                {/* Avatar */}
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5"
                  style={{ backgroundColor: `hsl(${hue}, 45%, 55%)` }}
                >
                  {getInitials(msg.sender_name)}
                </div>

                {/* Message content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-bold ${isMe ? 'text-[#2f5bea]' : 'text-slate-800'}`}>
                      {msg.sender_name || 'Unknown'}
                      {isMe && <span className="text-[11px] font-medium text-slate-400 ml-1">(you)</span>}
                    </span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${roleBadge.bg}`}>
                      {roleBadge.label}
                    </span>
                    <span className="text-[11px] text-slate-400 opacity-0 group-hover:opacity-100 transition">
                      {formatTime(msg.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap break-words leading-relaxed">
                    {msg.content}
                  </p>
                </div>

                {/* Timestamp always visible on right */}
                <span className="text-[11px] text-slate-300 shrink-0 mt-1 group-hover:hidden">
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>

        {/* Error display */}
        {error && (
          <div className="mx-6 mb-2 px-3 py-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
            {error}
          </div>
        )}

        {/* Input bar */}
        <div className="border-t border-[#e2e8f0] px-5 py-4 bg-slate-50/40">
          {canSend ? (
            <div className="flex items-end gap-3">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message #${activeTeam?.key?.toLowerCase() || 'team'}…`}
                rows={1}
                maxLength={4000}
                className="flex-1 resize-none bg-white border border-[#e2e8f0] rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#2f5bea] focus:ring-1 focus:ring-[#2f5bea]/20 transition min-h-[44px] max-h-[120px]"
                style={{ fieldSizing: 'content' }}
              />
              <button
                onClick={handleSend}
                disabled={!draft.trim() || sending}
                className="h-[44px] px-5 bg-[#2f5bea] hover:bg-[#264ecc] text-white rounded-xl font-semibold text-sm transition disabled:opacity-40 cursor-pointer flex items-center gap-2 shadow-xs shrink-0"
              >
                <Send className="w-4 h-4" />
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          ) : (
            <div className="text-center text-sm text-slate-400 py-2">
              <Shield className="w-4 h-4 inline mr-1.5 -mt-0.5" />
              Viewers can read messages. <span className="font-semibold">Member</span> or <span className="font-semibold">Lead</span> role required to send.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
