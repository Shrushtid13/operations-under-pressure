// web/src/components/OnCallView.jsx
import React, { useState } from 'react';
import {
  Calendar,
  Check,
  CheckCircle,
  Clock,
  Copy,
  ExternalLink,
  Link,
  PhoneCall,
  Plus,
  RefreshCw,
  Shield,
  Users,
  Video,
  X
} from 'lucide-react';
import { api } from '../api.js';

// Initials and avatar helper
function getAvatarProps(name) {
  if (!name) return { initials: '?', bg: 'bg-slate-500' };
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0].toUpperCase())
    .slice(0, 2)
    .join('');
  const colors = [
    'bg-[#2e7d32]',
    'bg-[#15803d]',
    'bg-[#8c6d3f]',
    'bg-[#1d4ed8]',
    'bg-[#4f46e5]',
    'bg-[#b45309]'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const bg = colors[Math.abs(hash) % colors.length];
  return { initials, bg };
}

function formatRelativeTime(dateString) {
  if (!dateString) return '';
  const diffSec = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (Math.abs(diffSec) < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin > 0 && diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 0 && Math.abs(diffMin) < 60) return `in ${Math.abs(diffMin)}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours > 0 && diffHours < 24) return `${diffHours}h ago`;
  if (diffHours < 0 && Math.abs(diffHours) < 24) return `in ${Math.abs(diffHours)}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays > 0) return `${diffDays}d ago`;
  return `in ${Math.abs(diffDays)}d`;
}

export function OnCallView({
  teams = [],
  selectedTeamId,
  onSelectTeam,
  onCallData,
  isLoading,
  currentUser,
  teamMembers = [],
  onRefresh,
  onOpenWorkItem
}) {
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [copiedCallId, setCopiedCallId] = useState(null);

  // Form state for scheduling call
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [platform, setPlatform] = useState('google_meet');
  const [customLink, setCustomLink] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');

  const currentTeam = teams.find((t) => String(t.id) === String(selectedTeamId)) || teams[0];
  const shifts = onCallData?.shifts || [];
  const calls = onCallData?.calls || [];

  const primaryShift = shifts.find((s) => s.tier === 'primary');
  const secondaryShift = shifts.find((s) => s.tier === 'secondary');
  const escalationShift = shifts.find((s) => s.tier === 'escalation');

  const handleCopyLink = (callId, url) => {
    navigator.clipboard.writeText(url);
    setCopiedCallId(callId);
    setTimeout(() => setCopiedCallId(null), 2500);
  };

  const handleOpenScheduleModal = () => {
    // Generate fresh Google Meet link
    const part1 = Math.random().toString(36).substring(2, 5);
    const part2 = Math.random().toString(36).substring(2, 6);
    const part3 = Math.random().toString(36).substring(2, 5);
    setCustomLink(`https://meet.google.com/${part1}-${part2}-${part3}`);
    setTitle('');
    setDescription('');
    setPlatform('google_meet');
    setScheduledAt('');
    setSelectedParticipants(teamMembers.map((m) => m.id));
    setIsScheduleOpen(true);
  };

  const handleScheduleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !currentTeam) return;

    setSubmitting(true);
    setActionError('');

    try {
      await api.scheduleCall(currentTeam.id, {
        title: title.trim(),
        description: description.trim() || null,
        platform,
        meeting_url: customLink.trim() || null,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : new Date().toISOString(),
        participants: selectedParticipants
      });
      setIsScheduleOpen(false);
      onRefresh();
    } catch (err) {
      setActionError(err.message || 'Failed to schedule call');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteCall = async (callId) => {
    try {
      await api.updateCall(currentTeam.id, callId, { status: 'completed' });
      onRefresh();
    } catch (err) {
      alert(err.message || 'Failed to complete call');
    }
  };

  const toggleParticipant = (userId) => {
    setSelectedParticipants((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">
            Who's on call & War Rooms
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            Active on-call roster, incident escalation, and one-click Google Meet / Teams calls for {currentTeam?.name || 'team'}.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {teams.length > 1 && (
            <select
              value={selectedTeamId || currentTeam?.id || ''}
              onChange={(e) => onSelectTeam(e.target.value)}
              className="bg-white border border-[#e2e8f0] text-slate-700 text-sm font-medium rounded-xl px-3.5 py-2 focus:outline-none focus:border-[#2563eb] cursor-pointer shadow-xs"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.key} — {t.name}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={handleOpenScheduleModal}
            className="px-4 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold rounded-xl flex items-center space-x-2 transition shadow-xs cursor-pointer"
          >
            <Video className="w-4 h-4" />
            <span>Schedule War Room / Call</span>
          </button>

          <button
            onClick={onRefresh}
            title="Refresh on-call data"
            className="p-2 bg-white border border-[#e2e8f0] hover:bg-slate-50 text-slate-600 rounded-xl cursor-pointer shadow-xs"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {actionError && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
          {actionError}
        </div>
      )}

      {/* SECTION 1: Active On-Call Responders Grid */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
          Current On-Call Shifts
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Primary Responder Card */}
          <div className="bg-white border-2 border-emerald-500/30 rounded-2xl p-5 shadow-xs relative overflow-hidden space-y-4">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-lg flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Primary Responder</span>
              </span>
              <span className="text-[11px] text-slate-400 font-medium">SLA: &lt; 5 min ack</span>
            </div>

            <div className="flex items-center space-x-3.5 pt-1">
              {primaryShift ? (
                <>
                  <div
                    className={`w-11 h-11 rounded-full text-white flex items-center justify-center font-bold text-sm shadow-xs ${
                      getAvatarProps(primaryShift.user_name).bg
                    }`}
                  >
                    {getAvatarProps(primaryShift.user_name).initials}
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-base">
                      {primaryShift.user_name}
                    </div>
                    <div className="text-xs text-slate-500 capitalize">
                      {primaryShift.team_role || 'Lead'} · {primaryShift.user_email}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-400 italic">No primary assigned</div>
              )}
            </div>

            <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 flex items-center justify-between">
              <span>Shift active now</span>
              <span className="font-medium text-slate-700">Ends in 5 days</span>
            </div>
          </div>

          {/* Secondary Backup Card */}
          <div className="bg-white border border-[#e2e8f0] rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold rounded-lg">
                Secondary Backup
              </span>
              <span className="text-[11px] text-slate-400 font-medium">SLA: &lt; 15 min ack</span>
            </div>

            <div className="flex items-center space-x-3.5 pt-1">
              {secondaryShift ? (
                <>
                  <div
                    className={`w-11 h-11 rounded-full text-white flex items-center justify-center font-bold text-sm shadow-xs ${
                      getAvatarProps(secondaryShift.user_name).bg
                    }`}
                  >
                    {getAvatarProps(secondaryShift.user_name).initials}
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-base">
                      {secondaryShift.user_name}
                    </div>
                    <div className="text-xs text-slate-500 capitalize">
                      {secondaryShift.team_role || 'Lead'} · {secondaryShift.user_email}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-400 italic">No secondary assigned</div>
              )}
            </div>

            <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 flex items-center justify-between">
              <span>Automatic fallback</span>
              <span className="font-medium text-slate-700">Ends in 5 days</span>
            </div>
          </div>

          {/* Escalation Lead Card */}
          <div className="bg-white border border-[#e2e8f0] rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 text-xs font-bold rounded-lg">
                Incident Commander
              </span>
              <span className="text-[11px] text-slate-400 font-medium">Critical P1 / Outages</span>
            </div>

            <div className="flex items-center space-x-3.5 pt-1">
              {escalationShift ? (
                <>
                  <div
                    className={`w-11 h-11 rounded-full text-white flex items-center justify-center font-bold text-sm shadow-xs ${
                      getAvatarProps(escalationShift.user_name).bg
                    }`}
                  >
                    {getAvatarProps(escalationShift.user_name).initials}
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-base">
                      {escalationShift.user_name}
                    </div>
                    <div className="text-xs text-slate-500 capitalize">
                      {escalationShift.team_role || 'Lead'} · {escalationShift.user_email}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-400 italic">No escalation lead</div>
              )}
            </div>

            <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 flex items-center justify-between">
              <span>Executive Escalation</span>
              <span className="font-medium text-slate-700">24/7 Standby</span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: Active & Upcoming War Rooms / Calls */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            Active & Scheduled War Rooms ({calls.length})
          </h2>
          <span className="text-xs text-slate-400">
            One-click Google Meet & Microsoft Teams links
          </span>
        </div>

        {calls.length === 0 ? (
          <div className="bg-white border border-[#e2e8f0] rounded-2xl p-10 text-center text-slate-400 text-sm space-y-3">
            <PhoneCall className="w-8 h-8 mx-auto text-slate-300" />
            <p>No active war rooms or operational calls currently scheduled.</p>
            <button
              onClick={handleOpenScheduleModal}
              className="px-4 py-2 bg-blue-50 text-[#2563eb] text-xs font-semibold rounded-xl hover:bg-blue-100 transition cursor-pointer"
            >
              Start a new War Room
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {calls.map((call) => {
              const isGoogle = call.platform === 'google_meet';
              const isLive = call.status === 'active';

              return (
                <div
                  key={call.id}
                  className={`bg-white border rounded-2xl p-6 shadow-xs space-y-4 transition ${
                    isLive ? 'border-blue-200 ring-1 ring-blue-50' : 'border-[#e2e8f0]'
                  }`}
                >
                  {/* Top Bar: Platform & Status */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center space-x-1.5 ${
                          isGoogle
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                        }`}
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>{isGoogle ? 'Google Meet' : 'Microsoft Teams'}</span>
                      </span>

                      {isLive ? (
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-lg flex items-center space-x-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span>Active Call</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded-md">
                          Completed
                        </span>
                      )}
                    </div>

                    <span className="text-xs text-slate-400 tabular-nums">
                      {formatRelativeTime(call.scheduled_at)}
                    </span>
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h3 className="text-base font-bold text-slate-900 leading-snug">
                      {call.title}
                    </h3>
                    {call.description && (
                      <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                        {call.description}
                      </p>
                    )}
                  </div>

                  {/* Associated Incident */}
                  {call.work_item_title && (
                    <div className="bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-2 truncate pr-2">
                        <span className="font-mono font-bold text-slate-700 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                          {call.team_key}-{call.work_item_number}
                        </span>
                        <span className="text-slate-800 font-medium truncate">
                          {call.work_item_title}
                        </span>
                      </div>
                      {onOpenWorkItem && (
                        <button
                          onClick={() => onOpenWorkItem(call.work_item_id)}
                          className="text-[#2563eb] hover:underline font-semibold shrink-0 cursor-pointer"
                        >
                          View
                        </button>
                      )}
                    </div>
                  )}

                  {/* Creator / Host */}
                  <div className="text-xs text-slate-400 flex items-center justify-between">
                    <span>
                      Host: <strong className="text-slate-700">{call.creator_name}</strong>
                    </span>
                    <span className="font-mono text-[11px] truncate max-w-[180px]">
                      {call.meeting_url.replace('https://', '')}
                    </span>
                  </div>

                  {/* Action Buttons Row */}
                  <div className="flex items-center space-x-2.5 pt-3 border-t border-slate-100">
                    {/* Big Direct Join Button */}
                    <a
                      href={call.meeting_url}
                      target="_blank"
                      rel="noreferrer"
                      className={`flex-1 py-2.5 px-4 rounded-xl text-white text-xs font-semibold shadow-xs flex items-center justify-center space-x-2 transition cursor-pointer ${
                        isGoogle
                          ? 'bg-[#2563eb] hover:bg-[#1d4ed8]'
                          : 'bg-[#5059c9] hover:bg-[#434bb5]'
                      }`}
                    >
                      <Video className="w-4 h-4" />
                      <span>{isGoogle ? 'Join Google Meet' : 'Join Microsoft Teams'}</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>

                    {/* Copy Link Button */}
                    <button
                      type="button"
                      onClick={() => handleCopyLink(call.id, call.meeting_url)}
                      className="p-2.5 bg-white border border-[#e2e8f0] hover:bg-slate-50 text-slate-600 rounded-xl transition cursor-pointer shadow-xs"
                      title="Copy meeting link"
                    >
                      {copiedCallId === call.id ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>

                    {/* End Call (Creator or Lead) */}
                    {isLive && (
                      <button
                        type="button"
                        onClick={() => handleCompleteCall(call.id)}
                        className="px-3 py-2.5 border border-[#e2e8f0] bg-white hover:bg-rose-50 text-rose-600 rounded-xl text-xs font-semibold transition cursor-pointer"
                        title="Mark call finished"
                      >
                        End
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SCHEDULE MODAL */}
      {isScheduleOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#e2e8f0] rounded-[16px] p-6 w-full max-w-lg shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Video className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Schedule War Room / Call
                </h3>
              </div>
              <button
                onClick={() => setIsScheduleOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleScheduleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Meeting Topic / Title (required)
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Urgent Triage: EU Merchant Payment Spikes"
                  className="w-full bg-slate-50 border border-[#e2e8f0] rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#2563eb]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Platform
                  </label>
                  <select
                    value={platform}
                    onChange={(e) => {
                      const newP = e.target.value;
                      setPlatform(newP);
                      if (newP === 'teams') {
                        setCustomLink(`https://teams.microsoft.com/l/meetup-join/war-room-${Date.now()}`);
                      } else {
                        const part1 = Math.random().toString(36).substring(2, 5);
                        const part2 = Math.random().toString(36).substring(2, 6);
                        const part3 = Math.random().toString(36).substring(2, 5);
                        setCustomLink(`https://meet.google.com/${part1}-${part2}-${part3}`);
                      }
                    }}
                    className="w-full bg-slate-50 border border-[#e2e8f0] rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#2563eb]"
                  >
                    <option value="google_meet">Google Meet</option>
                    <option value="teams">Microsoft Teams</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Scheduled Time
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="w-full bg-slate-50 border border-[#e2e8f0] rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#2563eb]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Meeting Link (auto-generated or custom)
                </label>
                <div className="relative">
                  <input
                    type="url"
                    required
                    value={customLink}
                    onChange={(e) => setCustomLink(e.target.value)}
                    className="w-full bg-slate-50 border border-[#e2e8f0] rounded-xl pl-8 pr-3.5 py-2.5 text-xs text-slate-800 font-mono focus:outline-none focus:bg-white focus:border-[#2563eb]"
                  />
                  <Link className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Context / Agenda (optional)
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Outline the incident details, steps to reproduce, or failover goals..."
                  className="w-full bg-slate-50 border border-[#e2e8f0] rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#2563eb]"
                />
              </div>

              {/* Participants selection */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    Invite Participants ({selectedParticipants.length}/{teamMembers.length})
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedParticipants(
                        selectedParticipants.length === teamMembers.length
                          ? []
                          : teamMembers.map((m) => m.id)
                      )
                    }
                    className="text-[11px] text-[#2563eb] hover:underline font-semibold"
                  >
                    {selectedParticipants.length === teamMembers.length ? 'Clear all' : 'Select all'}
                  </button>
                </div>

                <div className="max-h-36 overflow-y-auto space-y-1.5 p-2 bg-slate-50 border border-[#e2e8f0] rounded-xl">
                  {teamMembers.map((m) => {
                    const isChecked = selectedParticipants.includes(m.id);
                    return (
                      <label
                        key={m.id}
                        className="flex items-center space-x-2.5 p-1.5 hover:bg-white rounded-lg cursor-pointer text-xs transition"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleParticipant(m.id)}
                          className="w-4 h-4 rounded text-[#2563eb] focus:ring-0 cursor-pointer"
                        />
                        <span className="font-medium text-slate-800">{m.name}</span>
                        <span className="text-slate-400">({m.role})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsScheduleOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#e2e8f0] text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !title.trim()}
                  className="px-4 py-2 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Scheduling...' : 'Schedule & Alert Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
