// web/src/App.jsx
import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api.js';
import { useWebSocket } from './useWebSocket.js';

import { Sidebar } from './components/Sidebar.jsx';
import { Header } from './components/Header.jsx';
import { LoginView } from './components/LoginView.jsx';
import { HomePage } from './components/HomePage.jsx';
import { OverviewView } from './components/OverviewView.jsx';
import { WorkListView } from './components/WorkListView.jsx';
import { WorkItemDetail } from './components/WorkItemDetail.jsx';
import { InboxView } from './components/InboxView.jsx';
import { TeamMembersView } from './components/TeamMembersView.jsx';
import { AccountView } from './components/AccountView.jsx';
import { TeamChatView } from './components/TeamChatView.jsx';
import { OnCallView } from './components/OnCallView.jsx';
import { WorkspaceOnboardingView } from './components/WorkspaceOnboardingView.jsx';
import { NotificationToaster } from './components/NotificationToaster.jsx';

import { CreateItemModal } from './components/CreateItemModal.jsx';
import { EditItemModal } from './components/EditItemModal.jsx';
import { ConflictModal } from './components/ConflictModal.jsx';

export default function App() {
  const queryClient = useQueryClient();

  // Hash-based routing state (no router library per requirements)
  const [currentHash, setCurrentHash] = useState(() => window.location.hash || '#/overview');

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash || '#/overview');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = useCallback((newHash) => {
    window.location.hash = newHash;
    setCurrentHash(newHash);
  }, []);

  const handleSidebarNavigate = useCallback((newHash) => {
    if (newHash === '#/all-work' || newHash === '#/my-work') {
      setFilters({
        status: '',
        priority: '',
        needs_attention: '',
        sort: 'priority'
      });
      setSearchValue('');
      setDebouncedSearch('');
    }
    navigate(newHash);
  }, [navigate]);

  // Mobile drawer state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Search state (debounced by 300ms)
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchValue);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchValue]);

  // Selected team & filters
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    needs_attention: '',
    sort: 'priority'
  });

  const handleUpdateFilters = useCallback((newFilters) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  }, []);

  // Modals & toast state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [conflictData, setConflictData] = useState(null); // { error, draft }
  const [toastMessage, setToastMessage] = useState('');

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  }, []);

  // 1. Current User Identity Query
  const {
    data: meData,
    isLoading: isMeLoading,
    refetch: refetchMe
  } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.getMe(),
    retry: false
  });

  const user = meData?.user;
  const teams = user?.teams || [];

  // Selected team: empty string represents all user's teams
  useEffect(() => {
    // If selectedTeamId is set to a team user no longer belongs to, reset
    if (selectedTeamId && !teams.some((t) => String(t.id) === String(selectedTeamId))) {
      setSelectedTeamId('');
    }
  }, [teams, selectedTeamId]);

  // Handle 401 unauthenticated
  const handleAuthFailed = useCallback(() => {
    queryClient.setQueryData(['me'], null);
    navigate('#/signin');
  }, [queryClient, navigate]);

  // 2. Real-time WebSocket Gateway
  const { isConnected: isWsLive } = useWebSocket(Boolean(user), handleAuthFailed);

  // Debounced offline notice: grace period of 4 seconds prevents flickering during brief socket reconnects
  const [showPollingNotice, setShowPollingNotice] = useState(false);
  useEffect(() => {
    if (isWsLive) {
      setShowPollingNotice(false);
      return;
    }
    const timer = setTimeout(() => {
      setShowPollingNotice(true);
    }, 4000);
    return () => clearTimeout(timer);
  }, [isWsLive]);

  // 3. Overview Summary Query
  const { data: summaryData, refetch: refetchSummary } = useQuery({
    queryKey: ['overviewSummary'],
    queryFn: () => api.getOverviewSummary(),
    enabled: Boolean(user && teams.length > 0),
    refetchInterval: isWsLive ? false : 20000
  });

  // 4. Notifications Query
  const { data: notificationsData, refetch: refetchNotifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.listNotifications({ limit: 50 }),
    enabled: Boolean(user),
    refetchInterval: isWsLive ? false : 20000
  });

  const unreadCount = notificationsData?.unread_count || 0;

  // 5. Team Members Query
  const activeTeamId = selectedTeamId || (teams[0]?.id ? String(teams[0].id) : '');
  const { data: membersData, isLoading: isMembersLoading, refetch: refetchMembers } = useQuery({
    queryKey: ['teamMembers', activeTeamId],
    queryFn: () => api.listTeamMembers(activeTeamId),
    enabled: Boolean(user && activeTeamId)
  });

  // 6. Parse Route and Active Item ID
  let activeRoute = 'overview';
  let activeItemId = null;
  let activeInviteCode = '';

  if (currentHash.startsWith('#/my-work')) {
    activeRoute = 'my-work';
  } else if (currentHash.startsWith('#/all-work')) {
    activeRoute = 'all-work';
  } else if (currentHash.startsWith('#/on-call')) {
    activeRoute = 'on-call';
  } else if (currentHash.startsWith('#/inbox')) {
    activeRoute = 'inbox';
  } else if (currentHash.startsWith('#/chat')) {
    activeRoute = 'chat';
  } else if (currentHash.startsWith('#/team')) {
    activeRoute = 'team';
  } else if (currentHash.startsWith('#/account')) {
    activeRoute = 'account';
  } else if (currentHash.startsWith('#/signin')) {
    activeRoute = 'signin';
  } else if (currentHash.startsWith('#/onboarding')) {
    activeRoute = 'onboarding';
  } else if (currentHash.startsWith('#/join/')) {
    activeRoute = 'onboarding';
    activeInviteCode = currentHash.replace('#/join/', '');
  } else if (currentHash.startsWith('#/invite/')) {
    activeRoute = 'onboarding';
    activeInviteCode = currentHash.replace('#/invite/', '');
  } else if (currentHash.startsWith('#/work/')) {
    activeRoute = 'detail';
    activeItemId = currentHash.replace('#/work/', '');
  }

  // 6b. On Call Query
  const onCallTeamId = selectedTeamId || (teams[0]?.id ? String(teams[0].id) : '');
  const {
    data: onCallData,
    isLoading: isOnCallLoading,
    refetch: refetchOnCall
  } = useQuery({
    queryKey: ['onCall', onCallTeamId],
    queryFn: () => api.getOnCall(onCallTeamId),
    enabled: Boolean(user && onCallTeamId && activeRoute === 'on-call'),
    refetchInterval: isWsLive ? false : 15000
  });

  // 7. Keyset Infinite Work Items Query for All Work and My Work
  const listQueryParams = useMemo(() => ({
    ...filters,
    team: selectedTeamId || undefined,
    assignee: activeRoute === 'my-work' ? 'me' : undefined,
    q: debouncedSearch || undefined,
    limit: 50
  }), [filters, selectedTeamId, activeRoute, debouncedSearch]);

  const {
    data: infiniteListData,
    isLoading: isListLoading,
    isError: isListError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch: refetchList
  } = useInfiniteQuery({
    queryKey: ['workItems', listQueryParams],
    queryFn: ({ pageParam }) =>
      api.listWorkItems({
        ...listQueryParams,
        cursor: pageParam || undefined
      }),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage?.next_cursor ?? null,
    enabled: Boolean(user && teams.length > 0 && ['all-work', 'my-work'].includes(activeRoute)),
    refetchInterval: isWsLive ? false : 20000
  });

  const allItems = useMemo(() => {
    if (!infiniteListData?.pages) return [];
    return infiniteListData.pages.flatMap((page) => page?.items || []);
  }, [infiniteListData]);

  // 8. Overview Needs Attention Query (specifically for Overview view)
  const {
    data: attentionData,
    isLoading: isAttentionLoading
  } = useQuery({
    queryKey: ['overviewAttention', selectedTeamId],
    queryFn: () =>
      api.listWorkItems({
        needs_attention: 'true',
        team: selectedTeamId || undefined,
        limit: 10
      }),
    enabled: Boolean(user && teams.length > 0 && activeRoute === 'overview'),
    refetchInterval: isWsLive ? false : 20000
  });

  const attentionItems = attentionData?.items || [];

  // 9. Open Work Item Detail Query
  const {
    data: openItem,
    isLoading: isDetailLoading,
    refetch: refetchDetail
  } = useQuery({
    queryKey: ['workItem', String(activeItemId)],
    queryFn: () => api.getWorkItem(activeItemId),
    enabled: Boolean(user && activeItemId),
    refetchInterval: isWsLive ? false : 10000
  });

  // 10. Work Item Events Query
  const { data: itemEventsData, refetch: refetchEvents } = useQuery({
    queryKey: ['workItemEvents', String(activeItemId)],
    queryFn: () => api.listEvents(activeItemId),
    enabled: Boolean(user && activeItemId)
  });

  // Check if current user can create items (member or lead)
  const currentTeamObj = teams.find((t) => String(t.id) === String(selectedTeamId)) || teams[0];
  const canCreate = currentTeamObj?.role === 'member' || currentTeamObj?.role === 'lead';

  // Logout handler
  const handleLogout = useCallback(async () => {
    try {
      await api.logout();
    } catch (err) {
      console.warn('Logout notice:', err);
    }
    queryClient.setQueryData(['me'], null);
    queryClient.removeQueries({ queryKey: ['me'] });
    queryClient.clear();
    navigate('#/signin');
  }, [queryClient, navigate]);

  // If unauthenticated or explicit signin route, render HomePage (with embedded sign-in modal)
  if ((!user || activeRoute === 'signin') && !isMeLoading) {
    return (
      <HomePage
        onLoginSuccess={(loggedUser) => {
          queryClient.clear();
          queryClient.setQueryData(['me'], { user: loggedUser });
          refetchMe();
          navigate('#/overview');
        }}
      />
    );
  }

  // Initial loading state
  if (isMeLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f3f5f7] text-slate-500 text-sm">
        Loading Operations console...
      </div>
    );
  }

  // If user has NO teams and NO workspaces, or explicitly on #/onboarding, render WorkspaceOnboardingView
  const hasTeamsOrWorkspaces = (teams && teams.length > 0) || (user?.workspaces && user.workspaces.length > 0);
  if (!hasTeamsOrWorkspaces || activeRoute === 'onboarding') {
    return (
      <WorkspaceOnboardingView
        user={user}
        initialCode={activeInviteCode}
        onComplete={async () => {
          await refetchMe();
          navigate('#/overview');
        }}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className="min-h-screen flex bg-[#f3f5f7] font-sans antialiased text-slate-800">
      {/* 240px Left Sidebar with Mobile Drawer */}
      <Sidebar
        user={user}
        currentHash={currentHash}
        onNavigate={handleSidebarNavigate}
        unreadCount={unreadCount}
        onLogout={handleLogout}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Top Header */}
        <Header
          workspaceName={user?.workspaces?.[0]?.name || user?.teams?.[0]?.workspace_name || 'Newtonite Engineering'}
          onOpenWorkspace={() => navigate('#/onboarding')}
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          isLive={isWsLive}
          unreadCount={unreadCount}
          onOpenInbox={() => navigate('#/inbox')}
          onOpenNewItem={() => setIsCreateOpen(true)}
          canCreate={canCreate}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
        />

        {/* Quiet WebSocket Offline Notice (Static / Non-shifting, shown only after 4s sustained disconnect) */}
        {showPollingNotice && (
          <div className="bg-amber-50/90 border-b border-amber-200 px-6 py-1.5 text-xs text-amber-800 flex items-center justify-between shrink-0">
            <span>Operating in polling mode. Real-time stream reconnecting...</span>
            <span className="tabular-nums text-amber-600 font-medium">Poll: 20s</span>
          </div>
        )}

        {/* Global Toast Message Banner */}
        {toastMessage && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg shadow-xs flex items-center justify-between">
            <span>{toastMessage}</span>
            <button
              onClick={() => setToastMessage('')}
              className="text-emerald-600 hover:text-emerald-800 font-bold ml-4 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Screen Content Views */}
        <main className="flex-1 p-6 sm:p-8 max-w-6xl w-full mx-auto">
          {/* SCREEN 1: Overview */}
          {activeRoute === 'overview' && (
            <OverviewView
              user={user}
              summaryData={summaryData}
              attentionItems={attentionItems}
              isLoadingAttention={isAttentionLoading}
              onSelectItem={(id) => navigate(`#/work/${id}`)}
              onFilterStatus={(st) => {
                handleUpdateFilters({ status: st });
                navigate('#/all-work');
              }}
              onFilterNeedsAttention={() => {
                handleUpdateFilters({ needs_attention: 'true' });
                navigate('#/all-work');
              }}
            />
          )}

          {/* SCREEN 2 & 3: All Work / My Work */}
          {(activeRoute === 'all-work' || activeRoute === 'my-work') && (
            <WorkListView
              title={activeRoute === 'my-work' ? 'My work' : 'All work'}
              items={allItems}
              isLoading={isListLoading}
              isError={isListError}
              onRetry={refetchList}
              hasNextPage={Boolean(hasNextPage)}
              isFetchingNextPage={isFetchingNextPage}
              onLoadMore={fetchNextPage}
              filters={filters}
              onUpdateFilters={handleUpdateFilters}
              teams={teams}
              selectedTeamId={selectedTeamId}
              onSelectTeam={setSelectedTeamId}
              onSelectItem={(id) => navigate(`#/work/${id}`)}
            />
          )}

          {/* SCREEN 4: Work Item Detail */}
          {activeRoute === 'detail' && openItem && (
            <WorkItemDetail
              item={openItem}
              events={itemEventsData?.events || []}
              currentUser={user}
              teamMembers={membersData?.members || []}
              onBack={() => navigate('#/all-work')}
              onRefresh={() => {
                refetchDetail();
                refetchEvents();
                queryClient.invalidateQueries({ queryKey: ['attachments', String(activeItemId)] });
              }}
              onConflict={(err) => setConflictData({ error: err, draft: null })}
              onOpenEdit={() => setEditingItem(openItem)}
            />
          )}

          {activeRoute === 'detail' && isDetailLoading && (
            <div className="py-20 text-center text-sm text-slate-400">
              Loading work item...
            </div>
          )}

          {/* SCREEN 6: Inbox */}
          {activeRoute === 'inbox' && (
            <InboxView
              notifications={notificationsData?.notifications || []}
              isLoading={false}
              onRefresh={refetchNotifications}
              onOpenNotification={async (n) => {
                // Optimistic mark read per rules
                api.markNotificationRead(n.id).catch(() => {});
                queryClient.setQueryData(['notifications'], (old) => {
                  if (!old) return old;
                  return {
                    ...old,
                    unread_count: Math.max(0, old.unread_count - 1),
                    notifications: old.notifications.map((item) =>
                      item.id === n.id ? { ...item, read_at: new Date().toISOString() } : item
                    )
                  };
                });
                if (n.work_item_id) {
                  navigate(`#/work/${n.work_item_id}`);
                } else if (n.team_id) {
                  setSelectedTeamId(String(n.team_id));
                  navigate('#/chat');
                }
              }}
            />
          )}

          {/* SCREEN 7: Team Members */}
          {activeRoute === 'team' && (
            <TeamMembersView
              teams={teams}
              selectedTeamId={selectedTeamId || (teams[0]?.id ? String(teams[0].id) : '')}
              onSelectTeam={setSelectedTeamId}
              members={membersData?.members || []}
              isLoading={isMembersLoading}
              currentUser={user}
              onRefresh={refetchMembers}
            />
          )}

          {/* SCREEN 8: Team Chat */}
          {activeRoute === 'chat' && (
            <TeamChatView
              user={user}
              teams={teams}
              selectedTeamId={selectedTeamId}
              onSelectTeam={setSelectedTeamId}
            />
          )}

          {/* SCREEN 9: Account */}
          {activeRoute === 'account' && (
            <AccountView user={user} onLogout={handleLogout} />
          )}

          {/* SCREEN 10: Who's on call */}
          {activeRoute === 'on-call' && (
            <OnCallView
              teams={teams}
              selectedTeamId={onCallTeamId}
              onSelectTeam={setSelectedTeamId}
              onCallData={onCallData}
              isLoading={isOnCallLoading}
              currentUser={user}
              teamMembers={membersData?.members || []}
              onRefresh={refetchOnCall}
              onOpenWorkItem={(id) => navigate(`#/work/${id}`)}
            />
          )}
        </main>
      </div>

      {/* New Work Item Modal */}
      {isCreateOpen && (
        <CreateItemModal
          teams={teams}
          selectedTeamId={selectedTeamId}
          onClose={() => setIsCreateOpen(false)}
          onSuccess={(created) => {
            setIsCreateOpen(false);
            showToast(`Work item ${created.item_key || 'created'} successfully.`);
            refetchList();
            refetchSummary();
            navigate(`#/work/${created.id}`);
          }}
        />
      )}

      {/* Edit Work Item Modal */}
      {editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSuccess={(msg) => {
            setEditingItem(null);
            showToast(msg);
            refetchDetail();
            refetchList();
          }}
          onConflict={(err, draft) => {
            setEditingItem(null);
            setConflictData({ error: err, draft });
          }}
        />
      )}

      {/* Conflict Modal (HTTP 409 VERSION_CONFLICT or ALREADY_ASSIGNED) */}
      {conflictData && (
        <ConflictModal
          conflictError={conflictData.error}
          userDraft={conflictData.draft}
          onDiscard={() => {
            setConflictData(null);
            refetchDetail();
            refetchList();
          }}
          onOverwrite={async (serverVersion) => {
            const draft = conflictData.draft;
            const itemId = conflictData.error?.details?.current_item?.id || activeItemId;
            setConflictData(null);
            try {
              await api.patchWorkItem(itemId, serverVersion, draft);
              showToast('Changes forced and overwritten successfully.');
              refetchDetail();
              refetchList();
            } catch (err) {
              if (err.status === 409) {
                setConflictData({ error: err, draft });
              } else {
                showToast(err.message || 'Overwrite failed');
              }
            }
          }}
        />
      )}

      {/* Floating Push Notification Toaster (Global pop-ups across all views) */}
      <NotificationToaster onNavigate={navigate} />
    </div>
  );
}
