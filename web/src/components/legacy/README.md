# Legacy Prototype Components

The files in this directory are early prototype stubs that were superseded during production development. They are retained here for historical and review reference only and are not imported by the active application:

| Archived Component | Superseded By (Active Production Component) | Reason for Replacement |
|---|---|---|
| `IncidentDetail.jsx` | `WorkItemDetail.jsx` | Lacked multi-assignee support, fix approval workflow, live collaborator popups, attachments, and event history tabs. |
| `OperationsOverview.jsx` | `OverviewView.jsx` | Replaced by the consolidated operational dashboard with SLA indicators and attention cards. |
| `OverviewSummary.jsx` | `OverviewView.jsx` | Consolidated directly into the modern `OverviewView.jsx` metric cards. |
| `Navbar.jsx` | `Header.jsx` | Replaced by the global `Header.jsx` supporting global search, live WebSocket status, and notification popover. |
| `TeamMembersModal.jsx` | `TeamMembersView.jsx` | Replaced by full-page team directory and inline multi-assignee assignment modals. |
| `WorkItemList.jsx` | `WorkListView.jsx` + `WorkItemRow.jsx` | Replaced by keyset infinite-scrolling list with status filters, priority tabs, and avatar stacks. |
| `LandingPage.jsx` | `LoginView.jsx` | Standalone promotional stub superseded by the direct authenticated console and onboarding flows. |
