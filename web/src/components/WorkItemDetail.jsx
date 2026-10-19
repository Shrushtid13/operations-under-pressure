// web/src/components/WorkItemDetail.jsx
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Clock,
  Download,
  Edit2,
  FileText,
  Paperclip,
  Plus,
  RefreshCw,
  Send,
  Shield,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  X,
  XCircle
} from 'lucide-react';
import { api } from '../api.js';

// Status labels and dot colors
const STATUS_DATA = {
  open: { label: 'Open', dot: 'bg-slate-400' },
  in_progress: { label: 'In progress', dot: 'bg-blue-600' },
  pending_approval: { label: 'Pending approval', dot: 'bg-amber-500' },
  resolved: { label: 'Resolved', dot: 'bg-emerald-600' },
  closed: { label: 'Closed', dot: 'bg-slate-400' }
};

// Priority labels and colors matching screenshot
const PRIORITY_DATA = {
  4: { label: 'Critical', color: 'text-rose-600' },
  3: { label: 'High', color: 'text-amber-600' },
  2: { label: 'Medium', color: 'text-blue-600' },
  1: { label: 'Low', color: 'text-slate-600' }
};

// Avatar colors and initials generator
function getAvatarProps(name) {
  if (!name) return { initials: '?', bg: 'bg-slate-500' };
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0].toUpperCase())
    .slice(0, 2)
    .join('');
  const colors = [
    'bg-[#2e7d32]', // green
    'bg-[#15803d]', // forest green
    'bg-[#8c6d3f]', // gold / amber
    'bg-[#1d4ed8]', // blue
    'bg-[#4f46e5]', // indigo
    'bg-[#b45309]'  // bronze
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const bg = colors[Math.abs(hash) % colors.length];
  return { initials, bg };
}

// Relative time formatter
function formatRelativeTime(dateString) {
  if (!dateString) return '';
  const diffSec = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

// Due date formatter
function formatDue(dueAt, isOverdue) {
  if (!dueAt) return 'No deadline set';
  const date = new Date(dueAt);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 3600));

  if (isOverdue) {
    if (Math.abs(diffHours) < 24) {
      return `${Math.max(1, Math.abs(diffHours))}h ago (overdue)`;
    }
    const diffDays = Math.ceil(Math.abs(diffMs) / (1000 * 3600 * 24));
    return `${diffDays}d ago (overdue)`;
  }

  if (diffHours >= 0 && diffHours <= 24) {
    return `in ~${diffHours}h (${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
  }

  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  const diffDays = Math.ceil(diffMs / (1000 * 3600 * 24));
  if (diffDays === 1) return `Tomorrow at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function WorkItemDetail({
  item,
  events = [],
  currentUser,
  teamMembers = [],
  onBack,
  onRefresh,
  onConflict,
  onOpenEdit
}) {
  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState('');

  // Rejection modal state (Lead rejects resolution request)
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Reassignment / Multiple assignees modal state (Lead assigns two or more people)
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState('');
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState([]);
  const [assignReason, setAssignReason] = useState('');

  // Live conflict / collaborator change notification pop-up state
  const [liveConflictNotice, setLiveConflictNotice] = useState(null);

  useEffect(() => {
    const handleLiveChange = (e) => {
      const data = e.detail;
      if (!data) return;
      if (String(data.item_id) === String(item.id) && String(data.actor_id) !== String(currentUser.id)) {
        setLiveConflictNotice({
          actor_name: data.actor_name || 'A teammate',
          changed_fields: data.changed_fields || [],
          version: data.version,
          time: Date.now()
        });
      }
    };
    window.addEventListener('operations_live_item_change', handleLiveChange);
    return () => window.removeEventListener('operations_live_item_change', handleLiveChange);
  }, [item.id, currentUser.id]);

  // "Ask lead to reassign" modal state (Assignee cannot or doesn't want to do the task)
  const [isReassignRequestOpen, setIsReassignRequestOpen] = useState(false);
  const [reassignReason, setReassignReason] = useState('');

  // "Submit fix for approval" modal state (Assignee completed work and submits for lead sign-off)
  const [isSubmitApprovalOpen, setIsSubmitApprovalOpen] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');

  // Attachments state
  const [isAttachOpen, setIsAttachOpen] = useState(false);
  const [selectedPdf, setSelectedPdf] = useState(null);
  const [newFileName, setNewFileName] = useState('');
  const [newFileDesc, setNewFileDesc] = useState('');
  const [newFileType, setNewFileType] = useState('application/pdf');
  const [newFileData, setNewFileData] = useState('');
  const [newFileSize, setNewFileSize] = useState(0);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState('');
  const [isReadingFile, setIsReadingFile] = useState(false);

  // Dedicated query to fetch attachments fresh from server on demand and cache-bust
  const {
    data: attachmentsData,
    refetch: refetchAttachments
  } = useQuery({
    queryKey: ['attachments', String(item.id)],
    queryFn: () => api.listAttachments(item.id),
    initialData: { attachments: item.attachments || [] }
  });

  const attachments = attachmentsData?.attachments || item.attachments || [];

  // Mutation error & loading
  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // User role in this team
  const userMembership = currentUser?.teams?.find((t) => String(t.id) === String(item.team_id));
  const userRole = userMembership?.role || (currentUser?.is_org_admin ? 'org_admin' : 'viewer');
  const isLead = userRole === 'lead' || currentUser?.is_org_admin;
  const isMember = userRole === 'member' || userRole === 'lead';

  // Support multiple co-assignees from item.assignees
  const assigneesList = item.assignees && item.assignees.length > 0
    ? item.assignees
    : (item.assignee_id ? [{ id: item.assignee_id, name: item.assignee_name }] : []);

  const isAssignee =
    (item.assignee_id && String(item.assignee_id) === String(currentUser.id)) ||
    assigneesList.some((a) => String(a.id) === String(currentUser.id));
  const isApprovalRequester = item.approval_requested_by && String(item.approval_requested_by) === String(currentUser.id);

  const status = STATUS_DATA[item.status] || STATUS_DATA.open;
  const priority = PRIORITY_DATA[item.priority] || PRIORITY_DATA[2];
  const itemKey = item.item_key || `${item.team_key}-${item.number}`;
  const assigneeAvatar = getAvatarProps(item.assignee_name);

  const isApproaching =
    item.due_at &&
    !item.is_overdue &&
    (new Date(item.due_at).getTime() - Date.now() <= 24 * 3600 * 1000) &&
    (new Date(item.due_at).getTime() > Date.now()) &&
    ['open', 'in_progress', 'pending_approval'].includes(item.status);

  // Safe payload parser
  const parsePayload = (p) => {
    if (!p) return {};
    if (typeof p === 'object') return p;
    try {
      return JSON.parse(p);
    } catch {
      return {};
    }
  };

  // Extract latest approval submission details (from item or events)
  const latestApprovalEvent = [...events]
    .reverse()
    .find((e) => e.type === 'approval_requested');
  const latestApprovalPayload = latestApprovalEvent ? parsePayload(latestApprovalEvent.payload) : {};
  const fixNotes = item.approval_request?.notes || latestApprovalPayload?.reason || latestApprovalPayload?.notes || '';
  const submitterName = item.approval_request?.actor_name || item.approval_requested_by_name || latestApprovalEvent?.actor_name || item.assignee_name || 'Assignee';
  const submittedTime = item.approval_request?.created_at || latestApprovalEvent?.created_at || item.updated_at;
  const submittedTimeAgo = submittedTime ? formatRelativeTime(submittedTime) : '';

  // Server mutation executor
  const runMutation = async (mutationFn) => {
    setActionError('');
    setActionLoading(true);
    try {
      await mutationFn();
      onRefresh();
    } catch (err) {
      if (err.status === 409) {
        onConflict(err);
      } else {
        setActionError(err.message || 'Action failed on server');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = () => runMutation(() => api.transitionWorkItem(item.id, 'approve', item.version));
  const handleResolve = () => runMutation(() => api.transitionWorkItem(item.id, 'resolve', item.version));
  const handleClose = () => runMutation(() => api.transitionWorkItem(item.id, 'close', item.version));
  const handleReopen = () => runMutation(() => api.transitionWorkItem(item.id, 'reopen', item.version));

  // Reject resolution request (Lead only)
  const handleRejectSubmit = (e) => {
    e.preventDefault();
    if (!rejectReason.trim()) return;
    setIsRejectOpen(false);
    runMutation(() => api.transitionWorkItem(item.id, 'reject', item.version, rejectReason));
  };

  // Assign or Reassign / Co-assign teammates (Lead or Member)
  const handleAssignSubmit = (e) => {
    e.preventDefault();
    const targetIds = selectedAssigneeIds.length > 0
      ? selectedAssigneeIds
      : (assigneeId ? [assigneeId] : []);
    if (!targetIds.length) return;
    setIsAssignOpen(false);
    runMutation(async () => {
      await api.addAssignee(item.id, targetIds, item.version);
      if (assigneeId && String(assigneeId) !== String(item.assignee_id)) {
        try {
          await api.assignWorkItem(item.id, assigneeId, item.version, assignReason || undefined);
        } catch {
          // ignore if already assigned
        }
      }
    });
  };

  const handleRemoveAssignee = (targetUserId) => {
    if (!window.confirm('Remove this collaborator from the work item?')) return;
    runMutation(async () => {
      await api.removeAssignee(item.id, targetUserId);
    });
  };

  // Operator asks lead to reassign (releases claim with explanatory comment to lead)
  const handleReassignRequestSubmit = async (e) => {
    e.preventDefault();
    if (!reassignReason.trim()) return;
    setIsReassignRequestOpen(false);
    const reasonText = reassignReason.trim();
    setReassignReason('');

    runMutation(async () => {
      // 1. Post comment detailing the reason for requesting reassignment
      await api.addComment(item.id, `[Reassignment Requested] ${reasonText}`);
      // 2. Release item back to open pool for lead reassignment
      await api.releaseWorkItem(item.id, item.version);
    });
  };

  // Operator submits completed work for lead sign-off and resolution
  const handleSubmitApprovalSubmit = (e) => {
    e.preventDefault();
    setIsSubmitApprovalOpen(false);
    const notes = approvalNotes.trim();
    setApprovalNotes('');
    runMutation(() => api.transitionWorkItem(item.id, 'request_approval', item.version, notes || undefined));
  };

  // Create attachment (upload/attach PDF or document)
  const handleCreateAttachment = async (e) => {
    e.preventDefault();
    if (!newFileName.trim() || attaching) return;
    setAttaching(true);
    setAttachError('');
    setActionError('');
    try {
      await api.addAttachment(item.id, {
        filename: newFileName.trim(),
        file_type: newFileType,
        file_size: newFileSize || (newFileData ? newFileData.length : (1024 * (Math.floor(Math.random() * 300) + 45))),
        description: newFileDesc.trim() || undefined,
        file_data: newFileData || `Standard Operating Procedure & Diagnostic Log for ${newFileName.trim()}`
      });
      setIsAttachOpen(false);
      setNewFileName('');
      setNewFileDesc('');
      setNewFileData('');
      setNewFileSize(0);
      await refetchAttachments();
      onRefresh();
    } catch (err) {
      setAttachError(err.message || 'Failed to upload attachment');
      setActionError(err.message || 'Failed to upload attachment');
    } finally {
      setAttaching(false);
    }
  };

  // Delete attachment
  const handleDeleteAttachment = async (attachmentId) => {
    if (!window.confirm('Are you sure you want to remove this attachment?')) return;
    runMutation(async () => {
      await api.deleteAttachment(item.id, attachmentId);
      await refetchAttachments();
    });
  };

  // Download document helper
  const handleDownloadDocument = (attachment) => {
    if (attachment.file_data && attachment.file_data.startsWith('data:')) {
      const a = document.createElement('a');
      a.href = attachment.file_data;
      a.download = attachment.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
    const content = attachment.file_data || `Standard Operating Procedure: ${attachment.filename}\nAttached for Work Item: ${itemKey}\nTitle: ${item.title}\nUploaded By: ${attachment.uploader_name || 'System'}`;
    const blob = new Blob([content], { type: attachment.file_type || 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = attachment.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim() || isSubmittingComment) return;

    const text = commentText.trim();
    setCommentText('');
    setCommentError('');
    setIsSubmittingComment(true);

    try {
      await api.addComment(item.id, text);
      onRefresh();
    } catch (err) {
      setCommentError(err.message || 'Failed to post comment');
      setCommentText(text);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Chronologically sorted events
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center space-x-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to all work</span>
        </button>

        <button
          onClick={onRefresh}
          title="Refresh item"
          className="p-1.5 bg-white border border-[#e2e8f0] text-slate-500 hover:text-slate-800 rounded-lg cursor-pointer shadow-xs transition"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Action Error Banner */}
      {actionError && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError('')} className="text-rose-500 hover:text-rose-700 font-bold ml-2">
            ✕
          </button>
        </div>
      )}

      {/* 2-Column High-End Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: Work Item Overview & Activity Stream */}
        <div className="lg:col-span-2 space-y-6">
          {/* Main Card: Key, Title, Next Banner, Description, Action Buttons */}
          <div className="bg-white border border-[#e2e8f0] rounded-[16px] p-6 shadow-xs space-y-4">
            {/* Work Item Key */}
            <div className="text-xs font-semibold text-slate-400 tracking-wide uppercase">
              {itemKey}
            </div>

            {/* Title */}
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-snug">
              {item.title}
            </h1>

            {/* "Next:" Warm Action Banner */}
            <div className="bg-[#fff9eb] border border-[#fde68a] text-[#92400e] rounded-xl px-4 py-3 text-sm flex items-start space-x-2">
              <span className="font-semibold shrink-0">Next:</span>
              <span className="font-medium text-amber-950">
                {item.next_action ||
                  (item.status === 'pending_approval'
                    ? 'Fix submitted for review — awaiting lead approval.'
                    : item.fix_approved && item.status === 'in_progress'
                    ? (isAssignee
                        ? 'Fix is approved by lead! Current assignee can now mark this job as resolved.'
                        : `Fix approved by ${item.fix_approved_by_name || 'lead'}. Awaiting assignee resolution.`)
                    : item.status === 'in_progress'
                    ? (isAssignee
                        ? 'Work in progress by you. Investigate and apply fix, then submit for lead approval once done.'
                        : `Work in progress by ${assigneesList.map((a) => a.name).join(', ') || item.assignee_name || 'assignee'}.`)
                    : item.status === 'open'
                    ? 'Unassigned — awaiting team lead to assign owners.'
                    : 'Review required.')}
              </span>
            </div>

            {/* Prominent Fix Approved Banner (visible when fix is approved but item still in progress for assignee to resolve) */}
            {item.fix_approved && item.status === 'in_progress' && (
              <div className="bg-emerald-50 border-2 border-emerald-300 rounded-[16px] p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-xs shrink-0">
                    <CheckCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h2 className="text-sm font-bold text-emerald-950 uppercase tracking-wide">
                        Fix Approved by Team Lead
                      </h2>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-900 border border-emerald-300">
                        Ready to Resolve
                      </span>
                    </div>
                    <p className="text-xs text-emerald-800 mt-0.5">
                      Approved by <strong className="font-semibold text-emerald-950">{item.fix_approved_by_name || 'Team Lead'}</strong>
                      {item.fix_approved_at && ` · ${formatRelativeTime(item.fix_approved_at)}`}
                    </p>
                  </div>
                </div>
                {isAssignee && (
                  <button
                    disabled={actionLoading}
                    onClick={handleResolve}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer flex items-center space-x-1.5 shrink-0 self-start sm:self-auto"
                    title="You are an assignee. Complete and mark this item as resolved."
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>Mark as resolved</span>
                  </button>
                )}
              </div>
            )}

            {/* Prominent Fix Submission Review Card (visible whenever status === 'pending_approval') */}
            {item.status === 'pending_approval' && (
              <div className="bg-gradient-to-br from-[#fffbeb] to-[#fef3c7]/60 border-2 border-amber-300 rounded-[16px] p-5 shadow-xs space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-xs shrink-0">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h2 className="text-sm font-bold text-amber-950 uppercase tracking-wide">
                          Fix Submitted for Lead Sign-Off
                        </h2>
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-200 text-amber-900 border border-amber-300">
                          <Clock className="w-3 h-3 text-amber-800" />
                          <span>Awaiting Sign-Off</span>
                        </span>
                      </div>
                      <p className="text-xs text-amber-800 mt-0.5">
                        Submitted by <strong className="font-semibold text-amber-950">{submitterName}</strong>
                        {submittedTimeAgo && ` · ${submittedTimeAgo}`}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Fix Content / Resolution Notes Box */}
                <div className="bg-white/95 border border-amber-200/90 rounded-xl p-4 shadow-2xs space-y-2">
                  <div className="text-[11px] font-bold text-amber-900 uppercase tracking-wider flex items-center space-x-1.5 border-b border-amber-100 pb-2">
                    <FileText className="w-3.5 h-3.5 text-amber-700" />
                    <span>Resolution Notes & Fix Details</span>
                  </div>
                  {fixNotes ? (
                    <div className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap font-normal">
                      {fixNotes}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 italic py-1">
                      No explanatory resolution notes were entered by the assignee for this submission.
                    </div>
                  )}
                </div>

                {/* Review Guide for Lead */}
                {isLead && !isApprovalRequester ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-xs text-amber-900">
                    <span className="font-medium">
                      Review the resolution notes above and any attached documents before certifying.
                    </span>
                    <div className="flex items-center space-x-2 shrink-0">
                      <button
                        disabled={actionLoading}
                        onClick={handleApprove}
                        className="px-3 py-1.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer flex items-center space-x-1"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Approve Fix</span>
                      </button>
                      <button
                        disabled={actionLoading}
                        onClick={() => setIsRejectOpen(true)}
                        className="px-3 py-1.5 bg-white border border-amber-300 hover:bg-amber-50 text-slate-700 text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer"
                      >
                        Reject...
                      </button>
                    </div>
                  </div>
                ) : isApprovalRequester ? (
                  <div className="text-xs text-amber-900 font-medium pt-1 flex items-center space-x-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-700" />
                    <span>Your fix has been submitted. Awaiting a team lead to review and certify the resolution.</span>
                  </div>
                ) : null}
              </div>
            )}

            {/* Description */}
            <div className="text-sm text-slate-700 leading-relaxed pt-1 whitespace-pre-wrap">
              {item.description || 'No description provided.'}
            </div>

            {/* Attached Job Documents & PDFs */}
            <div className="pt-3 border-t border-slate-100 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Paperclip className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Attached Job Documents & PDFs ({attachments.length})
                  </span>
                </div>
                {isMember && item.status !== 'closed' && (
                  <button
                    type="button"
                    onClick={() => setIsAttachOpen(true)}
                    className="inline-flex items-center space-x-1 text-xs font-semibold text-[#2563eb] hover:text-[#1d4ed8] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Attach PDF / Spec</span>
                  </button>
                )}
              </div>

              {attachments.length === 0 ? (
                <div className="text-xs text-slate-400 italic py-1 bg-slate-50/60 rounded-xl px-3 border border-dashed border-slate-200">
                  No runbook, spec, or diagnostic PDF attached yet. Click &quot;Attach PDF / Spec&quot; to add job documents.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {attachments.map((att) => {
                    const isPdf = att.file_type?.includes('pdf') || att.filename?.toLowerCase().endsWith('.pdf');
                    return (
                      <div
                        key={att.id}
                        className="p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/90 transition flex items-start justify-between space-x-3 group"
                      >
                        <div
                          className="flex items-start space-x-2.5 flex-1 min-w-0 cursor-pointer"
                          onClick={() => setSelectedPdf(att)}
                          title="Click to view full PDF document"
                        >
                          <div
                            className={`p-2 rounded-lg shrink-0 ${
                              isPdf ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'
                            }`}
                          >
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-slate-800 truncate group-hover:text-[#2563eb]">
                              {att.filename}
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center space-x-1.5 mt-0.5">
                              <span>{(att.file_size / 1024).toFixed(1)} KB</span>
                              <span>•</span>
                              <span>{att.uploader_name || 'Operator'}</span>
                            </div>
                            {att.description && (
                              <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">
                                {att.description}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center space-x-1 shrink-0 pt-0.5">
                          <button
                            type="button"
                            onClick={() => handleDownloadDocument(att)}
                            title="Download document file"
                            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-white transition cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          {isMember && item.status !== 'closed' && (
                            <button
                              type="button"
                              onClick={() => handleDeleteAttachment(att.id)}
                              title="Delete attachment"
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-white transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Action Buttons Row */}
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <div className="flex items-center flex-wrap gap-2.5">
                {/* 1. APPROVE & REJECT: Lead only on pending_approval (cannot self-approve) */}
                {isLead && item.status === 'pending_approval' && !isApprovalRequester && (
                  <>
                    <button
                      disabled={actionLoading}
                      onClick={handleApprove}
                      className="px-4 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer flex items-center space-x-1.5"
                      title="Certify the fix (assignee will mark this incident resolved)"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Approve fix</span>
                    </button>
                    <button
                      disabled={actionLoading}
                      onClick={() => setIsRejectOpen(true)}
                      className="px-4 py-2 bg-white border border-[#e2e8f0] hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer"
                      title="Reject fix and return back to in-progress with feedback"
                    >
                      Reject (needs more work)...
                    </button>
                  </>
                )}

                {/* 2. ASSIGNEE IN PROGRESS: Submit fix when done OR Mark as resolved */}
                {isAssignee && item.status === 'in_progress' && (
                  <>
                    {!item.fix_approved && (
                      <button
                        disabled={actionLoading}
                        onClick={() => setIsSubmitApprovalOpen(true)}
                        className="px-4 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer flex items-center space-x-1.5"
                        title="Submit your completed work for team lead sign-off"
                      >
                        <Shield className="w-3.5 h-3.5" />
                        <span>Submit fix for approval</span>
                      </button>
                    )}

                    {(item.fix_approved || !item.requires_approval) && (
                      <button
                        disabled={actionLoading}
                        onClick={handleResolve}
                        className={`px-4 py-2 text-white text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer flex items-center space-x-1.5 ${
                          item.fix_approved
                            ? 'bg-emerald-600 hover:bg-emerald-700'
                            : 'bg-[#2563eb] hover:bg-[#1d4ed8]'
                        }`}
                        title="Mark task completed and resolved"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Mark as resolved</span>
                      </button>
                    )}

                    {/* Ask Lead to Reassign: for when operator cannot do or doesn't want to do the task */}
                    <button
                      disabled={actionLoading}
                      onClick={() => setIsReassignRequestOpen(true)}
                      className="px-4 py-2 bg-white border border-[#e2e8f0] hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer flex items-center space-x-1.5"
                      title="If you cannot do this task or lack capacity, ask the lead to reassign it"
                    >
                      <UserX className="w-3.5 h-3.5 text-slate-400" />
                      <span>Ask lead to reassign</span>
                    </button>
                  </>
                )}

                {/* 3. LEAD-CONTROLLED ASSIGNMENT (Assign 2 or more people) */}
                {isLead && item.status !== 'closed' && (
                  <button
                    disabled={actionLoading}
                    onClick={() => {
                      setSelectedAssigneeIds(assigneesList.map((a) => String(a.id)));
                      setIsAssignOpen(true);
                    }}
                    className="px-4 py-2 bg-white border border-[#e2e8f0] hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer flex items-center space-x-1.5"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-slate-400" />
                    <span>{assigneesList.length > 0 ? 'Assign / Add co-workers' : 'Assign to members'}</span>
                  </button>
                )}

                {/* 4. CLOSE & REOPEN: Lead only on resolved */}
                {isLead && item.status === 'resolved' && (
                  <>
                    <button
                      disabled={actionLoading}
                      onClick={handleClose}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer"
                    >
                      Close item
                    </button>
                    <button
                      disabled={actionLoading}
                      onClick={handleReopen}
                      className="px-4 py-2 bg-white border border-[#e2e8f0] hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer"
                    >
                      Reopen
                    </button>
                  </>
                )}

                {/* Non-assignee info banner */}
                {!isAssignee && item.status === 'in_progress' && (
                  <span className="text-xs text-slate-500 py-1">
                    Assigned to <strong className="text-slate-700">{item.assignee_name || 'an operator'}</strong>
                  </span>
                )}

                {/* Awaiting lead sign-off notice for requester */}
                {item.status === 'pending_approval' && isApprovalRequester && (
                  <span className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg flex items-center space-x-1.5">
                    <Clock className="w-3 h-3 text-amber-600" />
                    <span>You submitted a fix. Awaiting lead sign-off to resolve.</span>
                  </span>
                )}
              </div>

              {/* Informative helper note for assignee */}
              {isAssignee && item.status === 'in_progress' && (
                <div className="text-[11px] text-slate-500">
                  Tip: Work on investigating and mitigating the incident. When your fix is complete, click <strong>"Submit fix for lead approval"</strong>. If you cannot do this task, click <strong>"Ask lead to reassign"</strong> to notify the team lead.
                </div>
              )}
            </div>
          </div>

          {/* Activity Feed Card */}
          <div className="bg-white border border-[#e2e8f0] rounded-[16px] p-6 shadow-xs space-y-5">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Activity
            </h2>

            {/* Chronological Activity Feed */}
            <div className="space-y-4">
              {sortedEvents.length === 0 ? (
                <div className="text-xs text-slate-400 italic py-2">
                  No activity recorded yet.
                </div>
              ) : (
                sortedEvents.map((ev) => {
                  const actor = ev.actor_name || 'System';
                  const avatar = getAvatarProps(actor);
                  const payloadObj = parsePayload(ev.payload);
                  const isComment = ev.type === 'comment' || ev.type === 'comment_added';
                  const commentTextVal = payloadObj?.text || payloadObj?.comment || '';
                  const reasonText = payloadObj?.reason || payloadObj?.notes || '';
                  const fromPriority = payloadObj?.from_priority;
                  const toPriority = payloadObj?.to_priority;

                  return (
                    <div key={ev.id} className="flex items-start space-x-3 text-xs leading-relaxed">
                      {/* Circular Avatar */}
                      <div
                        className={`w-7 h-7 rounded-full text-white flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5 shadow-xs ${avatar.bg}`}
                      >
                        {avatar.initials}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Event Actor & Action line */}
                        <div className="text-slate-800">
                          <span className="font-semibold text-slate-900">{actor}</span>{' '}
                          {ev.type === 'created' && 'created this item'}
                          {ev.type === 'assigned' && `assigned to ${payloadObj?.assignee_name || 'operator'}`}
                          {ev.type === 'claimed' && 'claimed this item'}
                          {ev.type === 'released' && 'released task to team lead for reassignment'}
                          {ev.type === 'approval_requested' && 'submitted fix for lead sign-off'}
                          {ev.type === 'approved' && 'approved fix and marked resolved'}
                          {ev.type === 'rejected' && 'rejected fix and returned task to in-progress'}
                          {ev.type === 'resolved' && 'resolved this item'}
                          {ev.type === 'closed' && 'closed this item'}
                          {ev.type === 'reopened' && 'reopened this item'}
                          {isComment && 'commented'}
                          {ev.type === 'patched' && 'updated details'}
                          {fromPriority && toPriority && ` · priority: ${PRIORITY_DATA[fromPriority]?.label || fromPriority} to ${PRIORITY_DATA[toPriority]?.label || toPriority}`}
                          <span className="text-slate-400 ml-2 tabular-nums">
                            {formatRelativeTime(ev.created_at)}
                          </span>
                        </div>

                        {/* Fix details for approval_requested */}
                        {ev.type === 'approval_requested' && (
                          <div className="mt-2 p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-xs">
                            <div className="font-semibold text-amber-950 flex items-center space-x-1.5 mb-1">
                              <FileText className="w-3.5 h-3.5 text-amber-700" />
                              <span>Fix Details / Resolution Notes</span>
                            </div>
                            <div className="text-slate-800 whitespace-pre-wrap leading-relaxed">
                              {reasonText || <span className="italic text-slate-400">No resolution notes provided.</span>}
                            </div>
                          </div>
                        )}

                        {/* Rejection feedback */}
                        {ev.type === 'rejected' && (
                          <div className="mt-2 p-3 rounded-xl bg-rose-50/80 border border-rose-200 text-xs">
                            <div className="font-semibold text-rose-950 flex items-center space-x-1.5 mb-1">
                              <XCircle className="w-3.5 h-3.5 text-rose-700" />
                              <span>Rejection Feedback (Needs rework)</span>
                            </div>
                            <div className="text-slate-800 whitespace-pre-wrap leading-relaxed">
                              {reasonText || <span className="italic text-slate-400">No reason provided.</span>}
                            </div>
                          </div>
                        )}

                        {/* Approval notes */}
                        {ev.type === 'approved' && reasonText && (
                          <div className="mt-2 p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 text-xs">
                            <div className="font-semibold text-emerald-950 flex items-center space-x-1.5 mb-1">
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-700" />
                              <span>Approval Note</span>
                            </div>
                            <div className="text-slate-800 whitespace-pre-wrap leading-relaxed">
                              {reasonText}
                            </div>
                          </div>
                        )}

                        {/* Resolution notes */}
                        {ev.type === 'resolved' && reasonText && (
                          <div className="mt-2 p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 text-xs">
                            <div className="font-semibold text-emerald-950 flex items-center space-x-1.5 mb-1">
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-700" />
                              <span>Resolution Note</span>
                            </div>
                            <div className="text-slate-800 whitespace-pre-wrap leading-relaxed">
                              {reasonText}
                            </div>
                          </div>
                        )}

                        {/* Other reason (reopened, assigned, etc.) */}
                        {!['approval_requested', 'rejected', 'approved', 'resolved'].includes(ev.type) && reasonText && (
                          <div className="text-slate-600 mt-1 pl-2 border-l-2 border-slate-200 text-xs">
                            Reason: {reasonText}
                          </div>
                        )}

                        {/* Comment text bubble */}
                        {isComment && commentTextVal && (
                          <div className={`mt-1.5 p-3 rounded-xl border text-xs whitespace-pre-wrap ${
                            commentTextVal.startsWith('[Reassignment Requested]')
                              ? 'bg-amber-50/70 border-amber-200 text-amber-950 font-medium'
                              : 'bg-slate-50/80 border-slate-200/70 text-slate-800'
                          }`}>
                            {commentTextVal}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Comment Composer */}
            {isMember && (
              <form onSubmit={handleAddComment} className="pt-3 border-t border-slate-100 space-y-2">
                {commentError && (
                  <div className="text-xs text-rose-600 font-medium">{commentError}</div>
                )}
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add a comment or note..."
                    className="flex-1 bg-slate-50 border border-[#e2e8f0] rounded-xl px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#2563eb] shadow-xs"
                  />
                  <button
                    type="submit"
                    disabled={isSubmittingComment || !commentText.trim()}
                    className="px-4 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold rounded-xl shadow-xs transition disabled:opacity-40 cursor-pointer"
                  >
                    {isSubmittingComment ? 'Posting...' : 'Comment'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Right Column: Clean Metadata Table & Edit Details Button */}
        <div className="bg-white border border-[#e2e8f0] rounded-[16px] p-5 shadow-xs space-y-4">
          <div className="divide-y divide-slate-100 text-xs">
            {/* Status */}
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-500 font-medium">Status</span>
              <div className="flex items-center space-x-1.5 font-medium text-slate-800">
                <span className={`w-2 h-2 rounded-full ${status.dot}`} />
                <span>{status.label}</span>
              </div>
            </div>

            {/* Priority */}
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-500 font-medium">Priority</span>
              <span className={`font-semibold ${priority.color}`}>
                {priority.label}
              </span>
            </div>

            {/* Assignees (Multiple Assignees Support) */}
            <div className="py-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span>Assignees ({assigneesList.length})</span>
                  {assigneesList.length > 1 && (
                    <span className="px-1.5 py-0.5 bg-blue-50 text-[#2563eb] text-[10px] font-bold rounded-full">
                      Co-assigned
                    </span>
                  )}
                </span>
                {isLead && item.status !== 'closed' && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAssigneeIds(assigneesList.map((a) => String(a.id)));
                      setIsAssignOpen(true);
                    }}
                    className="text-[11px] font-semibold text-[#2563eb] hover:text-[#1d4ed8] flex items-center space-x-0.5 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Manage</span>
                  </button>
                )}
              </div>

              {assigneesList.length === 0 ? (
                <span className="text-slate-400 italic text-xs block">Unassigned</span>
              ) : (
                <div className="space-y-1.5 pt-0.5">
                  {assigneesList.map((a) => {
                    const aAvatar = getAvatarProps(a.name);
                    const isPrimary = String(a.id) === String(item.assignee_id);
                    const canRemove =
                      item.status !== 'closed' &&
                      ((isLead && assigneesList.length > 1) ||
                        (String(a.id) === String(currentUser.id) && assigneesList.length > 1));
                    return (
                      <div
                        key={a.id}
                        className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50/80 border border-slate-200/60 text-xs hover:bg-slate-100/70 transition"
                      >
                        <div className="flex items-center space-x-2 min-w-0">
                          <div
                            className={`w-5 h-5 rounded-full text-white flex items-center justify-center font-bold text-[9px] shrink-0 ${aAvatar.bg}`}
                          >
                            {aAvatar.initials}
                          </div>
                          <span className="font-medium text-slate-800 truncate">{a.name}</span>
                          {isPrimary && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-200 text-slate-700">
                              Lead
                            </span>
                          )}
                        </div>
                        {canRemove && (
                          <button
                            type="button"
                            onClick={() => handleRemoveAssignee(a.id)}
                            title={String(a.id) === String(currentUser.id) ? "Leave task" : "Remove collaborator"}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Due / Deadline */}
            <div className="py-2.5 flex items-center justify-between gap-2">
              <span className="text-slate-500 font-medium flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Deadline</span>
              </span>
              <div className="flex items-center gap-1.5 text-right">
                {item.is_overdue ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full text-[11px]">
                    {formatDue(item.due_at, true)}
                  </span>
                ) : isApproaching ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full text-[11px]">
                    {formatDue(item.due_at, false)}
                  </span>
                ) : (
                  <span className="text-slate-700 font-medium text-xs">
                    {formatDue(item.due_at, false)}
                  </span>
                )}
                {isMember && item.status !== 'closed' && (
                  <button
                    type="button"
                    onClick={onOpenEdit}
                    className="text-[11px] text-[#2563eb] hover:underline font-medium ml-1 cursor-pointer"
                    title="Change or set deadline"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>

            {/* Approval Guard */}
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-500 font-medium">Approval</span>
              <span className="text-slate-800 font-medium">
                {item.requires_approval ? 'Required' : 'Standard'}
              </span>
            </div>

            {/* Updated */}
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-500 font-medium">Updated</span>
              <span className="text-slate-600 tabular-nums font-medium">
                {formatRelativeTime(item.updated_at)}
              </span>
            </div>
          </div>

          {/* Edit Details Action Button */}
          {isMember && item.status !== 'closed' && (
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onOpenEdit}
                className="w-full py-2 bg-white border border-[#e2e8f0] hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer shadow-xs text-center"
              >
                Edit details
              </button>
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1: Request Reassignment (Assignee asks lead to reassign because they cannot do it) */}
      {isReassignRequestOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#e2e8f0] rounded-[16px] p-6 w-full max-w-md shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-semibold text-slate-900">Ask Lead to Reassign Task</h3>
              <button onClick={() => setIsReassignRequestOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              If you cannot complete this task or don't have the capacity, explain why below. Your reason will be logged for the team lead and the task will be returned to the queue for reassignment.
            </p>
            <form onSubmit={handleReassignRequestSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Reason for requesting reassignment (required)
                </label>
                <textarea
                  required
                  rows={3}
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  placeholder="e.g. Out of office, lack domain access, overloaded with P1 incident..."
                  className="w-full bg-slate-50 border border-[#e2e8f0] rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#2563eb]"
                />
              </div>
              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsReassignRequestOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-[#e2e8f0] text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!reassignReason.trim()}
                  className="px-3.5 py-1.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  Submit request to lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Submit Fix for Approval (Assignee completed their work and submits for lead resolution sign-off) */}
      {isSubmitApprovalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#e2e8f0] rounded-[16px] p-6 w-full max-w-md shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-semibold text-slate-900">Submit Fix for Lead Approval</h3>
              <button onClick={() => setIsSubmitApprovalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Have you finished working on this incident? Submitting will notify your team lead to review your work. Once approved by a team lead, this incident will be marked as <strong>Resolved</strong>.
            </p>
            <form onSubmit={handleSubmitApprovalSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Resolution notes & fix details
                </label>
                <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
                  Provide notes describing what was investigated, the fix applied, and how you verified it. The team lead will review these notes and any attached documents before certifying resolution.
                </p>
                <textarea
                  rows={4}
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  placeholder="e.g. Diagnosed high memory consumption in cache proxy. Patched connection timeout, restarted worker instances, and verified error rate dropped back to 0.01%."
                  className="w-full bg-slate-50 border border-[#e2e8f0] rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#2563eb]"
                />
              </div>
              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSubmitApprovalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-[#e2e8f0] text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold shadow-xs cursor-pointer"
                >
                  Submit for lead sign-off
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Reject Fix (Lead rejects submitted resolution with required feedback) */}
      {isRejectOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#e2e8f0] rounded-[16px] p-6 w-full max-w-md shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-semibold text-slate-900">Reject Resolution & Return to Work</h3>
              <button onClick={() => setIsRejectOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Explain why this fix cannot be approved yet. The item will return to "In progress" so the assignee can continue working on it.
            </p>
            <form onSubmit={handleRejectSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Reason for rejection (required)
                </label>
                <textarea
                  required
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Explain what needs to be fixed or checked before sign-off..."
                  className="w-full bg-slate-50 border border-[#e2e8f0] rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#2563eb]"
                />
              </div>
              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsRejectOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-[#e2e8f0] text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!rejectReason.trim()}
                  className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  Confirm rejection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Assign / Co-assign Team Members (Assign two or more people) */}
      {isAssignOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#e2e8f0] rounded-[16px] p-6 w-full max-w-lg shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-[#2563eb]" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Assign Team Members to Work Item
                </h3>
              </div>
              <button onClick={() => setIsAssignOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Select one or more team members to work on this job. All assigned members can investigate, collaborate, and submit or complete the fix.
            </p>

            <form onSubmit={handleAssignSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>Select Assignees ({selectedAssigneeIds.length} selected)</span>
                  <span className="text-[11px] font-normal text-slate-400">Multiple people can work on one job</span>
                </label>

                {/* Team member selection checklist */}
                <div className="max-h-56 overflow-y-auto border border-[#e2e8f0] rounded-xl divide-y divide-slate-100 bg-slate-50/50 p-1">
                  {teamMembers.length === 0 ? (
                    <div className="p-3 text-xs text-slate-400 text-center">No team members found</div>
                  ) : (
                    teamMembers.map((m) => {
                      const isChecked = selectedAssigneeIds.includes(String(m.id));
                      const mAvatar = getAvatarProps(m.name);
                      return (
                        <label
                          key={m.id}
                          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition ${
                            isChecked ? 'bg-blue-50/80 border border-blue-200' : 'hover:bg-slate-100'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const sid = String(m.id);
                                if (e.target.checked) {
                                  setSelectedAssigneeIds((prev) => [...prev, sid]);
                                  if (!assigneeId) setAssigneeId(sid);
                                } else {
                                  setSelectedAssigneeIds((prev) => prev.filter((id) => id !== sid));
                                  if (assigneeId === sid) {
                                    const remaining = selectedAssigneeIds.filter((id) => id !== sid);
                                    setAssigneeId(remaining[0] || '');
                                  }
                                }
                              }}
                              className="w-4 h-4 text-[#2563eb] rounded border-slate-300 focus:ring-0 cursor-pointer"
                            />
                            <div
                              className={`w-5 h-5 rounded-full text-white flex items-center justify-center font-bold text-[9px] shrink-0 ${mAvatar.bg}`}
                            >
                              {mAvatar.initials}
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-medium text-slate-900 block truncate">{m.name}</span>
                              <span className="text-[10px] text-slate-500 block">{m.email}</span>
                            </div>
                          </div>
                          <span className="text-[10px] font-semibold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded uppercase">
                            {m.role}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Lead Assignee selection if multiple people chosen */}
              {selectedAssigneeIds.length > 1 && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Primary / Lead Assignee
                  </label>
                  <select
                    value={assigneeId || selectedAssigneeIds[0]}
                    onChange={(e) => setAssigneeId(e.target.value)}
                    className="w-full bg-slate-50 border border-[#e2e8f0] rounded-xl p-2 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#2563eb]"
                  >
                    {selectedAssigneeIds.map((id) => {
                      const member = teamMembers.find((m) => String(m.id) === String(id));
                      return (
                        <option key={id} value={id}>
                          {member?.name || `User ${id}`} (Lead Contact)
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Assignment Note / Collaboration Context (optional)
                </label>
                <input
                  type="text"
                  value={assignReason}
                  onChange={(e) => setAssignReason(e.target.value)}
                  placeholder="e.g. Co-assigned to investigate database bottleneck and rewrite migration..."
                  className="w-full bg-slate-50 border border-[#e2e8f0] rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#2563eb]"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="text-xs text-slate-500 font-medium">
                  {selectedAssigneeIds.length} person{selectedAssigneeIds.length === 1 ? '' : 's'} selected
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsAssignOpen(false)}
                    className="px-3.5 py-1.5 rounded-lg border border-[#e2e8f0] text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={selectedAssigneeIds.length === 0}
                    className="px-4 py-1.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    Assign {selectedAssigneeIds.length > 1 ? `${selectedAssigneeIds.length} assignees` : 'member'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: Attach Document / PDF */}
      {isAttachOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#e2e8f0] rounded-[16px] p-6 w-full max-w-lg shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Paperclip className="w-4 h-4 text-[#2563eb]" />
                <h3 className="text-sm font-semibold text-slate-900">Attach Job Document or PDF</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAttachOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Attach runbooks, SOPs, diagnostic PDFs, or crash logs relevant to this incident. Operators will be able to preview and download them directly from the job card.
            </p>

            {attachError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center justify-between">
                <span>{attachError}</span>
                <button type="button" onClick={() => setAttachError('')} className="text-rose-500 font-bold ml-2 cursor-pointer">
                  ✕
                </button>
              </div>
            )}

            <form onSubmit={handleCreateAttachment} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Upload file from computer (optional)
                </label>
                <input
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setNewFileName(file.name);
                    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
                    const mime = file.type || (isPdf ? 'application/pdf' : 'application/octet-stream');
                    setNewFileType(mime);
                    setNewFileSize(file.size);
                    setIsReadingFile(true);
                    const reader = new FileReader();
                    reader.onload = () => {
                      const res = typeof reader.result === 'string' ? reader.result : '';
                      setNewFileData(res);
                      setIsReadingFile(false);
                    };
                    reader.onerror = () => {
                      setIsReadingFile(false);
                    };
                    // Always read files as DataURL (base64) so raw binary bytes never conflict with UTF-8
                    reader.readAsDataURL(file);
                  }}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-slate-200 file:text-xs file:font-semibold file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Document / PDF Filename <span className="text-rose-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="e.g. EU-Merchant-Gateway-Diagnostic-Report.pdf"
                  className="w-full bg-slate-50 border border-[#e2e8f0] rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#2563eb]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Document Type
                  </label>
                  <select
                    value={newFileType}
                    onChange={(e) => setNewFileType(e.target.value)}
                    className="w-full bg-slate-50 border border-[#e2e8f0] rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#2563eb]"
                  >
                    <option value="application/pdf">PDF Runbook / Document</option>
                    <option value="text/markdown">Markdown Spec / Guide</option>
                    <option value="text/plain">Plain Text Log / Dump</option>
                    <option value="application/json">JSON Telemetry / Trace</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    File Category
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={newFileName.endsWith('.pdf') ? 'PDF Document' : 'Operational Attachment'}
                    className="w-full bg-slate-100 border border-[#e2e8f0] rounded-xl p-2.5 text-xs text-slate-500 cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Description / Operational Instructions (optional)
                </label>
                <textarea
                  rows={2}
                  value={newFileDesc}
                  onChange={(e) => setNewFileDesc(e.target.value)}
                  placeholder="e.g. Step-by-step triage guide for failover testing and database reconnection..."
                  className="w-full bg-slate-50 border border-[#e2e8f0] rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#2563eb]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Document Content / Runbook Text (optional)
                </label>
                <textarea
                  rows={3}
                  value={newFileData}
                  onChange={(e) => setNewFileData(e.target.value)}
                  placeholder="Paste runbook text, log snippet, or checklist here..."
                  className="w-full font-mono bg-slate-50 border border-[#e2e8f0] rounded-xl p-2.5 text-[11px] text-slate-800 focus:outline-none focus:bg-white focus:border-[#2563eb]"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAttachOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-[#e2e8f0] text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newFileName.trim() || attaching || isReadingFile}
                  className="px-3.5 py-1.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isReadingFile ? 'Reading file...' : attaching ? 'Attaching...' : 'Attach Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: Interactive Document & PDF Viewer */}
      {selectedPdf && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#e2e8f0] rounded-[20px] w-full max-w-3xl max-h-[88vh] shadow-2xl flex flex-col overflow-hidden">
            {/* PDF Viewer Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold truncate text-white">
                    {selectedPdf.filename}
                  </h3>
                  <div className="text-[11px] text-slate-400 flex items-center space-x-2 mt-0.5">
                    <span>{(selectedPdf.file_size / 1024).toFixed(1)} KB</span>
                    <span>•</span>
                    <span>{selectedPdf.file_type || 'PDF Document'}</span>
                    <span>•</span>
                    <span>Uploaded by {selectedPdf.uploader_name || 'Operator'}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => handleDownloadDocument(selectedPdf)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-medium rounded-lg transition cursor-pointer"
                  title="Download file"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPdf(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Description Banner if available */}
            {selectedPdf.description && (
              <div className="px-6 py-2.5 bg-amber-50/80 border-b border-amber-200/80 text-amber-900 text-xs flex items-center space-x-2 shrink-0">
                <span className="font-semibold shrink-0">Runbook Overview:</span>
                <span>{selectedPdf.description}</span>
              </div>
            )}

            {/* Document Content / PDF Reader Area */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50 space-y-4">
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5">
                <div className="border-b border-slate-100 pb-4">
                  <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400">
                    Operations Incident SOP Runbook
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 mt-1">
                    {selectedPdf.filename}
                  </h2>
                  <div className="text-xs text-slate-500 mt-1">
                    Job ID: <strong className="text-slate-700">{itemKey}</strong> — {item.title}
                  </div>
                </div>

                {/* Formatted Runbook Sections */}
                <div className="space-y-4 text-xs text-slate-700 leading-relaxed">
                  <div>
                    <h4 className="font-bold text-slate-900 uppercase tracking-wide text-[11px] mb-1 text-blue-700">
                      1. Standard Operating Procedure &amp; Trigger Conditions
                    </h4>
                    <p className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-600">
                      This document is an attached operating manual for <strong>{item.title}</strong>. When working on this job, follow all verification steps and checklist items outlined below before submitting the fix for lead sign-off.
                    </p>
                  </div>

                  {selectedPdf.file_data && selectedPdf.file_data.startsWith('data:application/pdf') ? (
                    <div>
                      <h4 className="font-bold text-slate-900 uppercase tracking-wide text-[11px] mb-1.5 text-slate-800">
                        2. Attached PDF Document Preview
                      </h4>
                      <iframe
                        src={selectedPdf.file_data}
                        title={selectedPdf.filename}
                        className="w-full h-96 rounded-xl border border-slate-200 bg-white shadow-inner"
                      />
                    </div>
                  ) : selectedPdf.file_data ? (
                    <div>
                      <h4 className="font-bold text-slate-900 uppercase tracking-wide text-[11px] mb-1.5 text-slate-800">
                        2. Attached Document Payload &amp; Diagnostic Log
                      </h4>
                      <pre className="p-4 bg-slate-900 text-emerald-400 rounded-xl font-mono text-[11px] overflow-x-auto whitespace-pre-wrap leading-relaxed shadow-inner">
                        {selectedPdf.file_data}
                      </pre>
                    </div>
                  ) : (
                    <div>
                      <h4 className="font-bold text-slate-900 uppercase tracking-wide text-[11px] mb-1.5 text-slate-800">
                        2. Triage &amp; Remediation Protocol
                      </h4>
                      <div className="p-4 bg-slate-900 text-slate-200 rounded-xl font-mono text-[11px] space-y-1.5">
                        <div className="text-emerald-400 font-semibold">[DIAGNOSTIC RUNBOOK PROTOCOL]</div>
                        <div>1. Verify primary service health via telemetry metrics.</div>
                        <div>2. Inspect error rates in downstream connection pool.</div>
                        <div>3. Check circuit breaker state and reset throttles if tripped.</div>
                        <div>4. Run automated integration test suite on sandbox environment.</div>
                        <div>5. Log all mitigation steps in the activity comments.</div>
                      </div>
                    </div>
                  )}

                  <div>
                    <h4 className="font-bold text-slate-900 uppercase tracking-wide text-[11px] mb-1 text-slate-800">
                      3. Escalation &amp; On-Call Contacts
                    </h4>
                    <p className="text-slate-600">
                      If remediation fails to restore the SLA within 15 minutes, initiate a War Room call immediately from the <strong>&quot;Who&apos;s on call&quot;</strong> tab or escalate to the Primary On-Call engineer.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* PDF Viewer Footer */}
            <div className="px-6 py-3 bg-white border-t border-slate-100 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-400">
                Press Esc or Close to return to incident detail.
              </span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => handleDownloadDocument(selectedPdf)}
                  className="px-4 py-1.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer flex items-center space-x-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download file</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPdf(null)}
                  className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Real-time live conflict & collaborator change notification pop-up */}
      {liveConflictNotice && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md bg-[#fffbeb] border-2 border-[#fcd34d] rounded-2xl p-4 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wide">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Collaborator Update</span>
            </div>
            <button
              onClick={() => setLiveConflictNotice(null)}
              className="text-amber-600 hover:text-amber-800 p-0.5 rounded cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-amber-950 mt-1.5 font-medium leading-relaxed">
            <strong className="font-bold text-amber-950">{liveConflictNotice.actor_name}</strong> made changes to this work item while you are working on it.
            {liveConflictNotice.changed_fields?.length > 0 && (
              <span className="block text-[11px] text-amber-800 font-normal mt-1">
                Updated fields: <strong className="font-semibold">{liveConflictNotice.changed_fields.join(', ')}</strong>
              </span>
            )}
          </p>

          <div className="flex items-center gap-2 mt-3 pt-2 border-t border-amber-200/80">
            <button
              onClick={() => {
                setLiveConflictNotice(null);
                onRefresh();
              }}
              className="px-3.5 py-1.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer"
            >
              Refresh to view changes
            </button>
            <button
              onClick={() => setLiveConflictNotice(null)}
              className="px-3 py-1.5 bg-white border border-amber-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-amber-50 transition cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
