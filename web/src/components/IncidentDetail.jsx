// web/src/components/IncidentDetail.jsx
import React, { useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  FileCheck2,
  Filter,
  GitBranch,
  Layers,
  Lock,
  MessageSquare,
  PlayCircle,
  RefreshCw,
  Send,
  Server,
  Shield,
  ShieldAlert,
  Sparkles,
  Terminal,
  User,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  X,
  XCircle,
  Zap
} from 'lucide-react';
import { api } from '../api.js';

const SEVERITY_CONFIG = {
  4: { label: 'P4', badge: 'bg-[#FEF2F2] text-[#EF4444] border border-[#FECACA]' },
  3: { label: 'P3', badge: 'bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A]' },
  2: { label: 'P2', badge: 'bg-[#F0F9FF] text-[#0284C7] border border-[#BAE6FD]' },
  1: { label: 'P1', badge: 'bg-[#FEF2F2] text-[#EF4444] border border-[#FECACA]' }
};

const STATUS_LABELS = {
  open: { label: 'Open', badge: 'bg-slate-100 text-slate-700 border-slate-200' },
  in_progress: { label: 'Investigating', badge: 'bg-[#E0F2FE] text-[#0284C7] border-[#BAE6FD]' },
  pending_approval: { label: 'Pending Approval', badge: 'bg-[#F3E8FF] text-[#9333EA] border-[#E9D5FF]' },
  resolved: { label: 'Resolved', badge: 'bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]' },
  closed: { label: 'Closed', badge: 'bg-slate-100 text-slate-500 border-slate-200' }
};

export function IncidentDetail({
  item,
  events,
  currentUser,
  teamMembers,
  onBack,
  onRefresh,
  onConflict
}) {
  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState('all'); // 'all' | 'agents' | 'comments' | 'status'
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  // Remediation selection state
  const [selectedRemediation, setSelectedRemediation] = useState('rollback'); // 'rollback' | 'timeout' | 'approval' | 'resolve'
  const [isExecutingRemediation, setIsExecutingRemediation] = useState(false);
  const [remediationSuccess, setRemediationSuccess] = useState('');

  // Agent action loading states
  const [runningAgentAction, setRunningAgentAction] = useState(null); // 'log_analyzer' | 'metrics' | 'hypothesis'

  // Action error handling
  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Effective user role in item's team
  const userMembership = currentUser?.teams?.find((t) => String(t.id) === String(item.team_id));
  const userRole = userMembership?.role || (currentUser?.is_org_admin ? 'org_admin' : 'viewer');
  const isLead = userRole === 'lead';
  const isMember = userRole === 'member' || userRole === 'lead';
  const isAssignee = item.assignee_id && String(item.assignee_id) === String(currentUser.id);
  const isRequester = item.approval_requested_by && String(item.approval_requested_by) === String(currentUser.id);

  const severity = SEVERITY_CONFIG[item.priority] || SEVERITY_CONFIG[1];
  const statusInfo = STATUS_LABELS[item.status] || STATUS_LABELS.open;

  // Execute standard action with optimistic concurrency conflict handling
  const handleAction = async (actionFn) => {
    setActionError('');
    setActionLoading(true);
    try {
      await actionFn();
      onRefresh();
    } catch (err) {
      if (err.status === 409) {
        onConflict(err, { title: item.title, description: item.description, priority: item.priority });
      } else {
        setActionError(err.message || 'Action failed');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleStatusChange = async (targetStatus) => {
    setShowStatusDropdown(false);
    if (targetStatus === item.status) return;

    if (targetStatus === 'in_progress') {
      if (item.status === 'open') {
        await handleAction(() => api.claimWorkItem(item.id));
      } else {
        await handleAction(() => api.transitionWorkItem(item.id, 'reopen', item.version));
      }
    } else if (targetStatus === 'pending_approval') {
      await handleAction(() => api.transitionWorkItem(item.id, 'request_approval', item.version));
    } else if (targetStatus === 'resolved') {
      if (item.status === 'pending_approval') {
        await handleAction(() => api.transitionWorkItem(item.id, 'approve', item.version, 'Approved and resolved via workspace'));
      } else {
        await handleAction(() => api.transitionWorkItem(item.id, 'resolve', item.version));
      }
    } else if (targetStatus === 'closed') {
      await handleAction(() => api.transitionWorkItem(item.id, 'close', item.version));
    }
  };

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    setIsSubmittingComment(true);
    try {
      await api.addComment(item.id, commentText);
      setCommentText('');
      onRefresh();
    } catch (err) {
      setActionError(err.message || 'Failed to post note');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Agent Actions simulator
  const handleRunAgentAction = async (actionType) => {
    setRunningAgentAction(actionType);
    setActionError('');

    try {
      let note = '';
      if (actionType === 'log_analyzer') {
        note = `Log Analyzer Agent\nLOGANALYSIS\nFound 400+ occurrences of "PaymentGatewayTimeoutException" in last 10 minutes correlated with checkout failures.`;
      } else if (actionType === 'metrics') {
        note = `Metrics Agent\nMETRICSPIKE\nDetected Error Rate > 5% for checkout-service over 5m window.`;
      } else if (actionType === 'hypothesis') {
        note = `Remediation Agent\nHYPOTHESIS\nCanary release v2.4.6 introduced unindexed database query leading to connection pool exhaustion. Suggested rollback to v2.4.5 (92% confidence).`;
      }

      await api.addComment(item.id, note);
      onRefresh();
    } catch (err) {
      setActionError(err.message || 'Agent action execution failed');
    } finally {
      setRunningAgentAction(null);
    }
  };

  // Execute remediation
  const handleExecuteRemediation = async () => {
    setIsExecutingRemediation(true);
    setActionError('');
    setRemediationSuccess('');

    try {
      if (selectedRemediation === 'rollback') {
        await api.addComment(
          item.id,
          `Remediation Agent\nREMEDIATION\nRolled back deployment to v2.4.5. Traffic shifted away from canary pods. Error rate normalized.`
        );
        if (item.status === 'open' && isMember) {
          await api.claimWorkItem(item.id);
        }
        setRemediationSuccess('Rollback to v2.4.5 executed successfully. Canary error rate dropped to 0.01%.');
      } else if (selectedRemediation === 'timeout') {
        await api.addComment(
          item.id,
          `Alex Rivera\nREMEDIATION\nExtended checkout-service client timeout from 5s to 30s as a temporary buffer.`
        );
        setRemediationSuccess('Client timeout increased to 30s.');
      } else if (selectedRemediation === 'approval') {
        await api.transitionWorkItem(item.id, 'request_approval', item.version);
        setRemediationSuccess('Sign-off requested from peer leads.');
      } else if (selectedRemediation === 'resolve') {
        if (item.requires_approval && item.status === 'pending_approval' && isLead && !isRequester) {
          await api.transitionWorkItem(item.id, 'approve', item.version, 'Remediation validated, incident resolved');
        } else {
          await api.transitionWorkItem(item.id, 'resolve', item.version);
        }
        setRemediationSuccess('Incident marked as resolved.');
      }
      onRefresh();
    } catch (err) {
      setActionError(err.message || 'Failed to execute remediation');
    } finally {
      setIsExecutingRemediation(false);
    }
  };

  // Filtered events
  const filteredEvents = (events || []).filter((ev) => {
    if (timelineFilter === 'all') return true;
    if (timelineFilter === 'comments') return ev.type === 'comment_added';
    if (timelineFilter === 'status') return ['created', 'claimed', 'assigned', 'approval_requested', 'approved', 'rejected', 'resolved', 'closed', 'reopened'].includes(ev.type);
    if (timelineFilter === 'agents') return ev.payload?.comment?.includes('Agent');
    return true;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12 font-sans">
      {/* Back button link */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Incidents</span>
        </button>

        <div className="flex items-center space-x-2 text-xs text-slate-400 font-mono">
          <span>Version {item.version}</span>
          <span>•</span>
          <span>{events?.length || 0} events</span>
        </div>
      </div>

      {/* Action Error Alert */}
      {actionError && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span className="font-medium">{actionError}</span>
          </div>
          <button onClick={() => setActionError('')} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Success Alert */}
      {remediationSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span className="font-medium">{remediationSuccess}</span>
          </div>
          <button onClick={() => setRemediationSuccess('')} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Separation of Duties Banner */}
      {item.status === 'pending_approval' && isRequester && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl text-xs flex items-start gap-3 shadow-sm">
          <ShieldAlert className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
          <div>
            <div className="font-bold text-amber-900">Separation of Duties Enforced</div>
            <div className="text-amber-700 mt-0.5">
              You requested sign-off for this incident. Under compliance regulations, sign-off must be approved or rejected by a different team lead.
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 1. TOP INCIDENT HEADER CARD (Exact match to reference) */}
      {/* ========================================================= */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm space-y-6">
        {/* Title row + Top Right Action Buttons */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {item.title}
              </h1>
              <span className={`inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-md ${severity.badge}`}>
                {severity.label}
              </span>
            </div>

            {/* Subtitle metadata */}
            <div className="flex items-center space-x-2 text-xs text-slate-400 font-normal flex-wrap">
              <span className="font-medium text-slate-500">
                ID: {item.item_key}
              </span>
              <span>•</span>
              <span>Created: {new Date(item.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}</span>
              <span>•</span>
              <span>Region: {item.team_key === 'PAY' ? 'eu-west-1' : 'us-east-1'}</span>
            </div>
          </div>

          {/* Top Right Action Buttons (Slack Channel + Investigating dropdown) */}
          <div className="flex items-center space-x-3 shrink-0">
            {/* Slack Channel CTA */}
            <button
              onClick={() => {
                navigator.clipboard?.writeText(`https://operations.internal/incidents/${item.item_key}`);
                setCopiedKey(true);
                setTimeout(() => setCopiedKey(false), 2000);
              }}
              className="px-3.5 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 bg-white hover:bg-indigo-50/50 text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer shadow-sm"
              title="Copy incident link for Slack Channel"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Slack Channel</span>
              {copiedKey && <Check className="w-3.5 h-3.5 text-emerald-500 ml-1" />}
            </button>

            {/* Status Dropdown Button */}
            <div className="relative">
              <button
                onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                className="px-4 py-1.5 rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-xs font-semibold flex items-center space-x-2 transition cursor-pointer shadow-sm"
              >
                <span>{statusInfo.label}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {/* Status transition dropdown menu */}
              {showStatusDropdown && (
                <div className="absolute right-0 mt-1.5 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-20 py-1 text-xs">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    Transition Status
                  </div>

                  {item.status === 'open' && isMember && (
                    <button
                      onClick={() => handleStatusChange('in_progress')}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 flex items-center space-x-2 cursor-pointer font-medium"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-sky-500" />
                      <span>Investigate / Claim</span>
                    </button>
                  )}

                  {item.status === 'in_progress' && (
                    <>
                      {item.requires_approval && isAssignee && (
                        <button
                          onClick={() => handleStatusChange('pending_approval')}
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 flex items-center space-x-2 cursor-pointer font-medium"
                        >
                          <FileCheck2 className="w-3.5 h-3.5 text-purple-500" />
                          <span>Request Approval</span>
                        </button>
                      )}
                      {!item.requires_approval && (isAssignee || isLead) && (
                        <button
                          onClick={() => handleStatusChange('resolved')}
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 flex items-center space-x-2 cursor-pointer font-medium"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Mark Resolved</span>
                        </button>
                      )}
                    </>
                  )}

                  {item.status === 'pending_approval' && isLead && !isRequester && (
                    <button
                      onClick={() => handleStatusChange('resolved')}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 flex items-center space-x-2 cursor-pointer font-medium"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Approve & Resolve</span>
                    </button>
                  )}

                  {item.status === 'resolved' && isLead && (
                    <>
                      <button
                        onClick={() => handleStatusChange('closed')}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 flex items-center space-x-2 cursor-pointer font-medium"
                      >
                        <Lock className="w-3.5 h-3.5 text-slate-400" />
                        <span>Close Permanently</span>
                      </button>
                      <button
                        onClick={() => handleStatusChange('in_progress')}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 flex items-center space-x-2 cursor-pointer font-medium"
                      >
                        <PlayCircle className="w-3.5 h-3.5 text-sky-500" />
                        <span>Reopen Investigation</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 4-Item Attributes Grid across the bottom (STATUS, SERVICE, ASSIGNEE, IMPACT) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-5 border-t border-slate-100">
          {/* 1. STATUS */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              STATUS
            </div>
            <div>
              <span className={`inline-block px-3.5 py-1 rounded-full text-xs font-bold border ${statusInfo.badge}`}>
                {statusInfo.label}
              </span>
            </div>
          </div>

          {/* 2. SERVICE */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              SERVICE
            </div>
            <div className="flex items-center space-x-2 text-xs font-bold text-slate-800">
              <Server className="w-3.5 h-3.5 text-slate-500" />
              <span>{item.team_key === 'PAY' ? 'payment-gateway' : 'checkout-service'}</span>
            </div>
          </div>

          {/* 3. ASSIGNEE */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              ASSIGNEE
            </div>
            <div className="flex items-center space-x-2 text-xs font-bold text-slate-800">
              {item.assignee_name ? (
                <>
                  <div className="w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-bold">
                    {item.assignee_name[0]}
                  </div>
                  <span>{item.assignee_name}</span>
                </>
              ) : (
                <span className="text-amber-600 font-semibold">Unassigned</span>
              )}
            </div>
          </div>

          {/* 4. IMPACT */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              IMPACT
            </div>
            <div className="text-xs font-bold text-slate-900">
              {item.priority >= 3 ? 'User facing' : 'Internal'}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. MAIN 2-COLUMN LAYOUT: TIMELINE (Left) & PANELS (Right) */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Timeline Feed (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between pb-1">
            <h2 className="text-base font-bold text-slate-900">
              Timeline
            </h2>

            {/* Filter Icon button */}
            <div className="relative">
              <button
                onClick={() => setShowFilterMenu(!showFilterMenu)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md transition cursor-pointer"
                title="Filter timeline events"
              >
                <Filter className="w-4 h-4" />
              </button>

              {showFilterMenu && (
                <div className="absolute right-0 mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1 text-xs">
                  <button
                    onClick={() => { setTimelineFilter('all'); setShowFilterMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 font-medium ${timelineFilter === 'all' ? 'font-bold text-indigo-600' : 'text-slate-700'}`}
                  >
                    All Events
                  </button>
                  <button
                    onClick={() => { setTimelineFilter('agents'); setShowFilterMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 font-medium ${timelineFilter === 'agents' ? 'font-bold text-indigo-600' : 'text-slate-700'}`}
                  >
                    Agent Actions Only
                  </button>
                  <button
                    onClick={() => { setTimelineFilter('status'); setShowFilterMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 font-medium ${timelineFilter === 'status' ? 'font-bold text-indigo-600' : 'text-slate-700'}`}
                  >
                    Status Changes
                  </button>
                  <button
                    onClick={() => { setTimelineFilter('comments'); setShowFilterMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 font-medium ${timelineFilter === 'comments' ? 'font-bold text-indigo-600' : 'text-slate-700'}`}
                  >
                    Notes & Comments
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Quick Comment / Investigation Note Box */}
          {isMember && item.status !== 'closed' && (
            <form onSubmit={handleCommentSubmit} className="relative">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Log an operational note or investigation finding..."
                className="w-full bg-white border border-slate-200/90 rounded-2xl px-4 py-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 pr-24 shadow-sm"
              />
              <button
                type="submit"
                disabled={isSubmittingComment || !commentText.trim()}
                className="absolute right-2.5 top-2.5 px-3.5 py-1 bg-[#4F46E5] hover:bg-[#4338CA] text-white rounded-xl text-xs font-semibold flex items-center space-x-1 transition disabled:opacity-40 cursor-pointer shadow-sm"
              >
                <Send className="w-3 h-3" />
                <span>{isSubmittingComment ? 'Posting...' : 'Post'}</span>
              </button>
            </form>
          )}

          {/* Timeline Cards Container */}
          <div className="space-y-3.5">
            {filteredEvents.length === 0 ? (
              <div className="p-10 text-center text-slate-400 text-xs bg-white rounded-2xl border border-slate-200/90">
                No events match current filter.
              </div>
            ) : (
              filteredEvents.map((ev, idx) => {
                const isComment = ev.type === 'comment_added';
                const payload = ev.payload || {};
                const commentBody = payload.comment || '';
                const isAgent = commentBody.includes('Agent') || commentBody.includes('HYPOTHESIS') || commentBody.includes('REMEDIATION');

                // Categorize subtag exactly like reference
                let eventSubtag = 'STATUSCHANGE';
                let actorTitle = ev.actor_name;
                let displayBody = commentBody;

                if (isComment) {
                  if (commentBody.includes('METRICSPIKE')) {
                    actorTitle = 'Metrics Agent';
                    eventSubtag = 'METRICSPIKE';
                    displayBody = commentBody.replace('Metrics Agent\nMETRICSPIKE\n', '');
                  } else if (commentBody.includes('LOGANALYSIS')) {
                    actorTitle = 'Log Analyzer Agent';
                    eventSubtag = 'LOGANALYSIS';
                    displayBody = commentBody.replace('Log Analyzer Agent\nLOGANALYSIS\n', '');
                  } else if (commentBody.includes('HYPOTHESIS')) {
                    actorTitle = 'Remediation Agent';
                    eventSubtag = 'HYPOTHESIS';
                    displayBody = commentBody.replace('Remediation Agent\nHYPOTHESIS\n', '');
                  } else if (commentBody.includes('REMEDIATION')) {
                    eventSubtag = 'REMEDIATION';
                    displayBody = commentBody.replace(/.*REMEDIATION\n/, '');
                  } else {
                    eventSubtag = 'COMMENT';
                  }
                } else if (ev.type === 'created') {
                  actorTitle = 'System';
                  eventSubtag = 'STATUSCHANGE';
                  displayBody = 'Incident created. Status: Open.';
                } else if (ev.type === 'claimed') {
                  eventSubtag = 'STATUSCHANGE';
                  displayBody = 'Changed status to Investigating.';
                } else if (ev.type === 'approval_requested') {
                  eventSubtag = 'STATUSCHANGE';
                  displayBody = 'Requested lead sign-off. Status: Pending Approval.';
                } else if (ev.type === 'approved') {
                  eventSubtag = 'STATUSCHANGE';
                  displayBody = 'Approved by lead. Status: Resolved.';
                } else if (ev.type === 'resolved') {
                  eventSubtag = 'STATUSCHANGE';
                  displayBody = 'Incident marked as Resolved.';
                } else if (ev.type === 'closed') {
                  eventSubtag = 'STATUSCHANGE';
                  displayBody = 'Incident closed permanently.';
                }

                return (
                  <div
                    key={ev.id || idx}
                    className="p-5 bg-white border border-slate-200/90 rounded-2xl shadow-sm text-xs space-y-2.5 transition hover:border-slate-300"
                  >
                    {/* Top Row: Avatar + Actor Name + Subtag + Timestamp */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        {/* Circular Avatar / Badge */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs shrink-0 ${
                          isAgent
                            ? 'bg-[#F3E8FF] text-[#9333EA]'
                            : 'bg-[#E0F2FE] text-[#0284C7]'
                        }`}>
                          {isAgent ? (
                            <Bot className="w-4 h-4" />
                          ) : (
                            <User className="w-4 h-4" />
                          )}
                        </div>

                        <div>
                          <div className="font-bold text-slate-900 text-sm">
                            {actorTitle}
                          </div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                            {eventSubtag}
                          </div>
                        </div>
                      </div>

                      {/* Timestamp on right */}
                      <span className="text-xs text-slate-400 font-normal">
                        {new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>

                    {/* Content Box */}
                    <div className="pl-11 text-slate-700 text-xs leading-relaxed font-normal">
                      <p className="whitespace-pre-wrap">{displayBody}</p>

                      {payload.changes && (
                        <div className="font-mono text-[11px] text-slate-400 space-y-0.5 pt-1.5">
                          {Object.entries(payload.changes).map(([k, diff]) => (
                            <div key={k}>
                              Changed {k}: <span className="text-rose-500 line-through">{String(diff.from ?? 'none')}</span> → <span className="text-emerald-600 font-semibold">{String(diff.to ?? 'none')}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {payload.merged_from_version && (
                        <div className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1 pt-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Auto-merged concurrently with changes from version {payload.merged_from_version}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Agent Actions & Remediation (4 cols) */}
        <div className="lg:col-span-4 space-y-5">
          {/* ========================================================= */}
          {/* Card 1: AGENT ACTIONS (Exact match to reference) */}
          {/* ========================================================= */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm space-y-3.5">
            <h3 className="text-sm font-bold text-slate-900">
              Agent Actions
            </h3>

            <div className="space-y-2.5">
              {/* Button 1: Run Log Analyzer */}
              <button
                onClick={() => handleRunAgentAction('log_analyzer')}
                disabled={runningAgentAction !== null}
                className="w-full bg-white hover:bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-700 flex items-center justify-center space-x-2 transition cursor-pointer shadow-sm disabled:opacity-50"
              >
                <Terminal className="w-4 h-4 text-slate-500" />
                <span>{runningAgentAction === 'log_analyzer' ? 'Analyzing logs...' : 'Run Log Analyzer'}</span>
              </button>

              {/* Button 2: Check Service Metrics */}
              <button
                onClick={() => handleRunAgentAction('metrics')}
                disabled={runningAgentAction !== null}
                className="w-full bg-white hover:bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-700 flex items-center justify-center space-x-2 transition cursor-pointer shadow-sm disabled:opacity-50"
              >
                <Activity className="w-4 h-4 text-slate-500" />
                <span>{runningAgentAction === 'metrics' ? 'Querying metrics...' : 'Check Service Metrics'}</span>
              </button>

              {/* Button 3: Generate Hypothesis */}
              <button
                onClick={() => handleRunAgentAction('hypothesis')}
                disabled={runningAgentAction !== null}
                className="w-full bg-white hover:bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-700 flex items-center justify-center space-x-2 transition cursor-pointer shadow-sm disabled:opacity-50"
              >
                <Zap className="w-4 h-4 text-slate-500" />
                <span>{runningAgentAction === 'hypothesis' ? 'Generating hypothesis...' : 'Generate Hypothesis'}</span>
              </button>
            </div>
          </div>

          {/* ========================================================= */}
          {/* Card 2: REMEDIATION (Exact match to reference) */}
          {/* ========================================================= */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              Remediation
            </h3>

            <div className="space-y-3">
              {/* Option 1: Rollback to v2.4.5 (Recommended / Yellow highlight) */}
              <label
                onClick={() => setSelectedRemediation('rollback')}
                className={`block p-3.5 rounded-xl border transition cursor-pointer ${
                  selectedRemediation === 'rollback'
                    ? 'bg-[#FEFCE8] border-[#FEF08A]'
                    : 'bg-[#FEFCE8]/50 border-amber-200/60'
                }`}
              >
                <div className="flex items-start space-x-2.5">
                  <input
                    type="radio"
                    name="remediation"
                    checked={selectedRemediation === 'rollback'}
                    onChange={() => setSelectedRemediation('rollback')}
                    className="mt-0.5 text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-900">
                      Rollback to v2.4.5
                    </div>
                    <div className="text-[11px] text-[#A16207] font-semibold">
                      Suggested by Remediation Agent (92% confidence)
                    </div>
                  </div>
                </div>
              </label>

              {/* Option 2: Increase timeout to 30s */}
              <label
                onClick={() => setSelectedRemediation('timeout')}
                className={`block p-3.5 rounded-xl border transition cursor-pointer ${
                  selectedRemediation === 'timeout'
                    ? 'bg-slate-50 border-indigo-400'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start space-x-2.5">
                  <input
                    type="radio"
                    name="remediation"
                    checked={selectedRemediation === 'timeout'}
                    onChange={() => setSelectedRemediation('timeout')}
                    className="mt-0.5 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-800">
                      Increase timeout to 30s
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Manual suggestion
                    </div>
                  </div>
                </div>
              </label>

              {/* Option 3: Request Lead Sign-Off (If requires approval and in_progress) */}
              {item.requires_approval && item.status === 'in_progress' && (
                <label
                  onClick={() => setSelectedRemediation('approval')}
                  className={`block p-3.5 rounded-xl border transition cursor-pointer ${
                    selectedRemediation === 'approval'
                      ? 'bg-purple-50 border-purple-300'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start space-x-2.5">
                    <input
                      type="radio"
                      name="remediation"
                      checked={selectedRemediation === 'approval'}
                      onChange={() => setSelectedRemediation('approval')}
                      className="mt-0.5 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-slate-900">
                        Request Lead Sign-Off
                      </div>
                      <div className="text-[11px] text-purple-600 font-semibold">
                        Mandatory compliance sign-off
                      </div>
                    </div>
                  </div>
                </label>
              )}

              {/* Option 4: Resolve incident */}
              {item.status !== 'resolved' && item.status !== 'closed' && (
                <label
                  onClick={() => setSelectedRemediation('resolve')}
                  className={`block p-3.5 rounded-xl border transition cursor-pointer ${
                    selectedRemediation === 'resolve'
                      ? 'bg-emerald-50 border-emerald-300'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start space-x-2.5">
                    <input
                      type="radio"
                      name="remediation"
                      checked={selectedRemediation === 'resolve'}
                      onChange={() => setSelectedRemediation('resolve')}
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-slate-900">
                        Mark Incident as Resolved
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Verify recovery metrics & resolve
                      </div>
                    </div>
                  </div>
                </label>
              )}
            </div>

            {/* Execute Selected Primary Button */}
            <button
              onClick={handleExecuteRemediation}
              disabled={isExecutingRemediation}
              className="w-full bg-[#4F46E5] hover:bg-[#4338CA] text-white font-semibold text-xs py-2.5 px-4 rounded-xl transition shadow-md shadow-indigo-500/20 flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              <span>{isExecutingRemediation ? 'Executing...' : 'Execute Selected'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
