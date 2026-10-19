# Frontend Components Guide

This directory houses the React 19 UI components powering the Newtonite Operations Console.

---

## 1. Component Architecture Overview

All components are functional React components utilizing Tailwind CSS for styling and TanStack Query v5 for asynchronous state management.

```
web/src/components/
├── index.js                     # Unified component barrel exports
│
├── Views & Screens/             # Primary routed application screens
│   ├── OverviewView.jsx         # Executive operations overview & high-priority jobs
│   ├── WorkListView.jsx         # Keyset-paginated work item tables (All Work / My Work)
│   ├── WorkItemDetail.jsx       # Deep work item management, multi-assignees & approvals
│   ├── TeamMembersView.jsx      # Team member directory and workspace invitation generator
│   ├── TeamChatView.jsx         # Real-time operational communications channel
│   ├── OnCallView.jsx           # On-call shift schedules and war room incident coordination
│   ├── InboxView.jsx            # User notifications center (assignments, mentions, deadlines)
│   ├── AccountView.jsx          # Profile details and password change settings
│   ├── LoginView.jsx            # Authentication and registration with one-click demo logins
│   └── WorkspaceOnboardingView.jsx # Multi-tenant workspace creation and invite acceptance
│
├── Modals & Overlays/           # Interactive dialogs and conflict handlers
│   ├── CreateItemModal.jsx      # Work item creation with deadline presets & priority
│   ├── EditItemModal.jsx        # Edit modal with client-side draft preservation
│   └── ConflictModal.jsx        # OCC 409 version conflict prompt ("Take theirs" vs "Overwrite")
│
├── Layout & Navigation/         # Application shell and real-time alerts
│   ├── Sidebar.jsx              # Navigation drawer, workspace switcher, and team selector
│   ├── Header.jsx               # Global search bar, new item CTA, and live connection status
│   ├── WorkItemRow.jsx          # Dense job row featuring overlapping multi-assignee avatars
│   ├── NotificationsPopover.jsx # Header notification bell dropdown menu
│   └── NotificationToaster.jsx  # Floating real-time collaborator and deadline toasts
│
└── legacy/                      # Archived prototype components (for historical reference)
    ├── README.md                # Mapping of archived stubs to active production replacements
    ├── IncidentDetail.jsx
    ├── LandingPage.jsx
    ├── Navbar.jsx
    ├── OperationsOverview.jsx
    ├── OverviewSummary.jsx
    ├── TeamMembersModal.jsx
    └── WorkItemList.jsx
```

---

## 2. Component Categorization

| Category | Component | Description |
|---|---|---|
| **View** | `WorkItemDetail.jsx` | Full item details with multi-assignee sidebar, lead fix approvals, assignee-only resolution, activity timeline, and real-time collaborator update alerts. |
| **View** | `WorkListView.jsx` | High-density list supporting keyset pagination (`api.listWorkItems`), status tabs, and priority filters. |
| **View** | `OverviewView.jsx` | High-level operational health indicators, attention metric cards, and recent active work. |
| **View** | `OnCallView.jsx` | Visualizes the active responder rota and provides a one-click incident war room link. |
| **View** | `TeamChatView.jsx` | Collaborative team chat channel with instant WebSocket broadcast. |
| **Modal** | `ConflictModal.jsx` | Prompts users when concurrent writes touch the same field, allowing selective diff resolution without lost work. |
| **Modal** | `CreateItemModal.jsx` | Creates new work items with custom or preset deadlines (+2h, +6h, +24h, +3d). |
| **Layout** | `Header.jsx` | Displays workspace name, search filter, notifications dropdown, and live WebSocket ping. |
| **Layout** | `Sidebar.jsx` | Responsive navigation bar with mobile slide-out drawer support. |
