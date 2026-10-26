// Navigation and page titles in one place. To add or remove a module, edit NAV_GROUPS (sidebar)
// and PAGES (breadcrumbs); the routes themselves live in App.jsx.
import {
  BarChart3,
  Bell,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  ListChecks,
  Settings,
  Users,
} from 'lucide-react';

/** Sidebar groups per role. `end` makes the link active only on its exact path. */
export const NAV_GROUPS = {
  APPLICANT: [
    {
      label: 'Application',
      items: [
        { to: '/applicant', label: 'My Application', icon: FileText },
        { to: '/notifications', label: 'Notifications', icon: Bell },
      ],
    },
  ],
  VERIFIER: [
    {
      label: 'Verification',
      items: [{ to: '/cases', label: 'Pending Cases', icon: ClipboardCheck }],
    },
    {
      label: 'Account',
      items: [{ to: '/notifications', label: 'Notifications', icon: Bell }],
    },
  ],
  ADMINISTRATOR: [
    {
      label: 'Overview',
      items: [
        { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
        { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
      ],
    },
    {
      label: 'Verification',
      items: [{ to: '/cases', label: 'Verification', icon: ClipboardCheck }],
    },
    {
      label: 'Administration',
      items: [
        { to: '/admin/users', label: 'Users & Roles', icon: Users },
        { to: '/admin/categories', label: 'Categories & Checklists', icon: ListChecks },
        { to: '/admin/settings', label: 'System Configuration', icon: Settings },
      ],
    },
    {
      label: 'Account',
      items: [{ to: '/notifications', label: 'Notifications', icon: Bell }],
    },
  ],
};

/**
 * Page titles for breadcrumbs. `parent` is the pattern of the page one level up.
 * A title can depend on the role (administrators see the pending cases as "Verification").
 */
export const PAGES = [
  { pattern: '/applicant', title: 'My Application' },
  { pattern: '/applicant/documents/:itemId', title: 'Upload document', parent: '/applicant' },
  { pattern: '/cases', title: (role) => (role === 'ADMINISTRATOR' ? 'Verification' : 'Pending Cases') },
  { pattern: '/cases/documents/:id', title: 'Review document', parent: '/cases' },
  { pattern: '/cases/applications/:id', title: 'Application', parent: '/cases' },
  { pattern: '/admin', title: 'Dashboard' },
  { pattern: '/admin/users', title: 'Users & Roles' },
  { pattern: '/admin/users/:id', title: 'User', parent: '/admin/users' },
  { pattern: '/admin/categories', title: 'Categories & Checklists' },
  { pattern: '/admin/categories/:id', title: 'Checklist', parent: '/admin/categories' },
  { pattern: '/admin/reports', title: 'Reports' },
  { pattern: '/admin/settings', title: 'System Configuration' },
  { pattern: '/notifications', title: 'Notifications' },
];
