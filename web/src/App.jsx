// web/src/App.jsx
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';
import { useWebSocket } from './useWebSocket.js';
import { Sidebar } from './components/Sidebar.jsx';
import { Header } from './components/Header.jsx';
import { OperationsOverview } from './components/OperationsOverview.jsx';
import { IncidentDetail } from './components/IncidentDetail.jsx';
import { ConflictModal } from './components/ConflictModal.jsx';
import { CreateItemModal } from './components/CreateItemModal.jsx';
import { TeamMembersModal } from './components/TeamMembersModal.jsx';
import { NotificationsPopover } from './components/NotificationsPopover.jsx';
import { LandingPage } from './components/LandingPage.jsx';

export default function App() {
  const queryClient = useQueryClient();

  // Theme state: defaults to 'light' to match the SwarmOps reference screenshot, with 1-click toggle to dark
  const [theme, setTheme] = useState('light');

  // Selected team & item state
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [activeNav, setActiveNav] = useState('all');

  // Filters state
  const [filters, setFilters] = useState({
    status: '',
    assignee: '',
    priority: '',
    overdue: '',
    needs_attention: '',
    q: '',
    sort: 'priority',
    cursor: undefined
  });

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [conflictData, setConflictData] = useState(null); // { error, draft }

  // 1. Current User Query
  const { data: meData, isLoading: isMeLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.getMe(),
    retry: false
  });

  const user = meData?.user;
  const teams = user?.teams || [];

  // Initialize selectedTeamId to first team if not set
  if (teams.length > 0 && !selectedTeamId) {
    setSelectedTeamId(String(teams[0].id));
  }

  // 2. Real-time WebSocket Gateway
  const { isWsConnected } = useWebSocket(Boolean(user));

  // 3. Overview Summary Query (safety-net poll 20s if WebSocket disconnected)
  const { data: summaryData } = useQuery({
    queryKey: ['overviewSummary', selectedTeamId],
    queryFn: () => api.getOverviewSummary(),
    enabled: Boolean(user),
    refetchInterval: isWsConnected ? 60000 : 20000
  });

  // 4. Work Items List Query (safety-net poll 20s)
  const listParams = {
    ...filters,
    team: selectedTeamId || undefined
  };

  const {
    data: listData,
    isLoading: isListLoading,
    isError: isListError,
    refetch: refetchList
  } = useQuery({
    queryKey: ['workItems', listParams],
    queryFn: () => api.listWorkItems(listParams),
    enabled: Boolean(user),
    refetchInterval: isWsConnected ? 60000 : 20000
  });

  // 5. Work Item Detail Query (safety-net poll 10s if open)
  const { data: itemDetail, refetch: refetchDetail } = useQuery({
    queryKey: ['workItem', String(selectedItemId)],
    queryFn: () => api.getWorkItem(selectedItemId),
    enabled: Boolean(user && selectedItemId),
    refetchInterval: isWsConnected ? 60000 : 10000
  });

  // 6. Work Item Events Query
  const { data: itemEventsData, refetch: refetchEvents } = useQuery({
    queryKey: ['workItemEvents', String(selectedItemId)],
    queryFn: () => api.listEvents(selectedItemId),
    enabled: Boolean(user && selectedItemId)
  });

  // 7. Team Members Query
  const { data: membersData, refetch: refetchMembers } = useQuery({
    queryKey: ['teamMembers', String(selectedTeamId)],
    queryFn: () => api.listTeamMembers(selectedTeamId),
    enabled: Boolean(user && selectedTeamId)
  });

  // 8. Notifications Query
  const { data: notifData, refetch: refetchNotifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.listNotifications(),
    enabled: Boolean(user),
    refetchInterval: 30000
  });

  const selectedTeam = teams.find((t) => String(t.id) === String(selectedTeamId)) || teams[0];
  const canCreate = selectedTeam?.role === 'member' || selectedTeam?.role === 'lead';

  // Navigation handlers
  const handleSelectNav = (navId) => {
    setActiveNav(navId);
    setSelectedItemId(null);

    if (navId === 'all') {
      setFilters((prev) => ({
        ...prev,
        status: '',
        assignee: '',
        priority: '',
        overdue: '',
        needs_attention: '',
        cursor: undefined
      }));
    } else if (navId === 'needs_attention') {
      setFilters((prev) => ({
        ...prev,
        status: '',
        assignee: '',
        priority: '',
        overdue: '',
        needs_attention: 'true',
        cursor: undefined
      }));
    } else if (navId === 'my_work') {
      setFilters((prev) => ({
        ...prev,
        status: '',
        assignee: 'me',
        priority: '',
        overdue: '',
        needs_attention: '',
        cursor: undefined
      }));
    } else if (navId === 'pending_approval') {
      setFilters((prev) => ({
        ...prev,
        status: 'pending_approval',
        assignee: '',
        priority: '',
        overdue: '',
        needs_attention: '',
        cursor: undefined
      }));
    }
  };

  const handleUpdateFilters = (patch) => {
    setFilters((prev) => ({ ...prev, ...patch, cursor: undefined }));
  };

  const handleResetFilters = () => {
    setFilters({
      status: '',
      assignee: '',
      priority: '',
      overdue: '',
      needs_attention: '',
      q: '',
      sort: 'priority',
      cursor: undefined
    });
    setActiveNav('all');
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {}
    queryClient.clear();
    window.location.reload();
  };

  // Conflict handler
  const handleConflict = (err, draft) => {
    setConflictData({ error: err, draft });
  };

  const handleResolveConflict = async (newVersion) => {
    if (!conflictData) return;
    try {
      await api.patchWorkItem(selectedItemId, newVersion, conflictData.draft);
      setConflictData(null);
      refetchDetail();
      refetchEvents();
    } catch (err) {
      if (err.status === 409) {
        setConflictData({ error: err, draft: conflictData.draft });
      }
    }
  };

  if (isMeLoading) {
    return (
      <div className="min-h-screen bg-[#0d111c] flex items-center justify-center text-slate-400 text-xs font-mono">
        <div className="animate-spin w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full mr-3"></div>
        Connecting to Operations Workspace...
      </div>
    );
  }

  if (!user) {
    return <LandingPage onLoginSuccess={() => queryClient.invalidateQueries({ queryKey: ['me'] })} />;
  }

  // Breadcrumbs determination
  const breadcrumbs = selectedItemId && itemDetail
    ? [
        { label: 'Operations', onClick: () => setSelectedItemId(null) },
        { label: selectedTeam?.key || 'Team', onClick: () => setSelectedItemId(null) },
        { label: 'Incidents', onClick: () => setSelectedItemId(null) }
      ]
    : [
        { label: 'Operations' },
        { label: selectedTeam?.name || selectedTeam?.key || 'Team' }
      ];

  const viewTitle = selectedItemId && itemDetail
    ? itemDetail.item_key
    : activeNav === 'needs_attention'
    ? 'Needs Attention'
    : activeNav === 'my_work'
    ? 'My Assigned Incidents'
    : activeNav === 'pending_approval'
    ? 'Pending Approvals'
    : 'All Incidents & Operations';

  const isLight = theme === 'light';

  return (
    <div className={`min-h-screen flex font-sans ${isLight ? 'bg-[#f4f6f8] text-slate-900' : 'bg-[#0a0e17] text-slate-100'}`}>
      {/* 1. Persistent Compact Sidebar (Always dark navy matching SwarmOps screenshot) */}
      <Sidebar
        user={user}
        teams={teams}
        selectedTeamId={selectedTeamId}
        onSelectTeam={(teamId) => {
          setSelectedTeamId(teamId);
          setSelectedItemId(null);
          queryClient.invalidateQueries({ queryKey: ['workItems'] });
          queryClient.invalidateQueries({ queryKey: ['overviewSummary'] });
        }}
        activeNav={activeNav}
        onSelectNav={handleSelectNav}
        onOpenMembersModal={() => setIsMembersOpen(true)}
        onLogout={handleLogout}
        isWsConnected={isWsConnected}
      />

      {/* 2. Main Content Viewport */}
      <div className={`flex-1 flex flex-col min-h-screen min-w-0 ${isLight ? 'bg-[#f4f6f8]' : 'bg-[#0a0e17]'}`}>
        {/* Top Header */}
        <Header
          viewTitle={viewTitle}
          breadcrumbs={breadcrumbs}
          searchValue={filters.q}
          onSearchChange={(q) => handleUpdateFilters({ q })}
          unreadCount={notifData?.unread_count || 0}
          onOpenNotifications={() => setIsNotificationsOpen(true)}
          onOpenCreateModal={() => setIsCreateOpen(true)}
          canCreate={canCreate}
          user={user}
          selectedTeam={selectedTeam}
          theme={theme}
          onToggleTheme={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
        />

        {/* Scrollable Workspace Container */}
        <main className="flex-1 px-4 sm:px-8 py-6 max-w-7xl w-full mx-auto">
          {selectedItemId && itemDetail ? (
            <IncidentDetail
              item={itemDetail}
              events={itemEventsData?.events || []}
              currentUser={user}
              teamMembers={membersData?.members || []}
              onBack={() => setSelectedItemId(null)}
              onRefresh={() => {
                refetchDetail();
                refetchEvents();
                queryClient.invalidateQueries({ queryKey: ['workItems'] });
                queryClient.invalidateQueries({ queryKey: ['overviewSummary'] });
              }}
              onConflict={handleConflict}
              isDark={!isLight}
            />
          ) : (
            <OperationsOverview
              summaryData={summaryData}
              selectedTeamId={selectedTeamId}
              items={listData?.items || []}
              filters={filters}
              onUpdateFilters={handleUpdateFilters}
              onResetFilters={handleResetFilters}
              onSelectItem={(id) => setSelectedItemId(id)}
              hasNextPage={Boolean(listData?.has_more)}
              onLoadMore={() => {
                if (listData?.next_cursor) {
                  setFilters((prev) => ({ ...prev, cursor: listData.next_cursor }));
                }
              }}
              isLoading={isListLoading}
              isError={isListError}
              onRetry={refetchList}
            />
          )}
        </main>
      </div>

      {/* 3. Operational Modals */}

      {/* Create Work Item Modal */}
      {isCreateOpen && selectedTeam && (
        <CreateItemModal
          teamId={selectedTeam.id}
          teamKey={selectedTeam.key}
          onClose={() => setIsCreateOpen(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['workItems'] });
            queryClient.invalidateQueries({ queryKey: ['overviewSummary'] });
          }}
        />
      )}

      {/* Team Roster & Roles Modal */}
      {isMembersOpen && selectedTeam && (
        <TeamMembersModal
          teamId={selectedTeam.id}
          teamKey={selectedTeam.key}
          members={membersData?.members || []}
          onClose={() => setIsMembersOpen(false)}
          onRefresh={refetchMembers}
        />
      )}

      {/* Live Notifications Drawer */}
      {isNotificationsOpen && (
        <NotificationsPopover
          notifications={notifData?.notifications || []}
          unreadCount={notifData?.unread_count || 0}
          onClose={() => setIsNotificationsOpen(false)}
          onSelectItem={(id) => {
            setSelectedItemId(id);
            setIsNotificationsOpen(false);
          }}
          onRefresh={refetchNotifications}
        />
      )}

      {/* 409 Optimistic Concurrency Conflict Resolution Modal */}
      {conflictData && (
        <ConflictModal
          conflictError={conflictData.error}
          userDraft={conflictData.draft}
          onResolve={handleResolveConflict}
          onDiscard={() => {
            setConflictData(null);
            refetchDetail();
            refetchEvents();
          }}
        />
      )}
    </div>
  );
}
