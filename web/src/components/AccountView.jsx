// web/src/components/AccountView.jsx
import React, { useState, useMemo } from 'react';
import {
  AlertCircle,
  Award,
  CheckCircle,
  CheckCircle2,
  Clock,
  Flame,
  GitCommit,
  GitPullRequest,
  Lock,
  LogOut,
  Shield,
  TrendingUp,
  User,
  Users,
  Zap
} from 'lucide-react';
import { api } from '../api.js';

// Initials and avatar generator
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

// Generate realistic 16-week contribution heatmap data seeded deterministically by user id
function generateContributionData(userId = 1) {
  const weeks = 16;
  const days = 7;
  const grid = [];
  let totalActions = 0;
  const now = new Date();

  for (let w = 0; w < weeks; w++) {
    const week = [];
    for (let d = 0; d < days; d++) {
      const daysAgo = (weeks - 1 - w) * 7 + (6 - d);
      const date = new Date(now.getTime() - daysAgo * 24 * 3600 * 1000);

      // Deterministic pseudorandom count based on day, week, and userId
      const seed = Math.sin(userId * 997 + daysAgo * 13) * 10000;
      const rand = seed - Math.floor(seed);

      // Weekdays have higher activity
      const isWeekend = d === 5 || d === 6;
      let count = 0;
      if (!isWeekend) {
        if (rand > 0.82) count = Math.floor(rand * 8) + 4; // heavy day
        else if (rand > 0.5) count = Math.floor(rand * 4) + 1; // medium day
        else if (rand > 0.25) count = 1;
      } else if (rand > 0.75) {
        count = Math.floor(rand * 3) + 1; // occasional on-call weekend action
      }

      totalActions += count;

      // GitHub heat levels 0 to 4
      let level = 0;
      if (count >= 6) level = 4;
      else if (count >= 4) level = 3;
      else if (count >= 2) level = 2;
      else if (count >= 1) level = 1;

      week.push({
        date: date.toISOString().split('T')[0],
        count,
        level,
        displayDate: date.toLocaleDateString([], { month: 'short', day: 'numeric' })
      });
    }
    grid.push(week);
  }

  return { grid, totalActions };
}

export function AccountView({ user, onLogout }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [hoveredCell, setHoveredCell] = useState(null);

  const teams = user?.teams || [];
  const primaryRole = user?.is_org_admin
    ? 'Organization Administrator'
    : teams[0]?.role
    ? teams[0].role.charAt(0).toUpperCase() + teams[0].role.slice(1)
    : 'Member';

  const avatar = getAvatarProps(user?.name);

  // GitHub contribution data
  const { grid, totalActions } = useMemo(() => {
    return generateContributionData(user?.id || 1);
  }, [user?.id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword.length < 12) {
      setError('New password must be at least 12 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setSuccess('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  const getHeatmapColor = (level) => {
    switch (level) {
      case 4:
        return 'bg-[#216e39]'; // Dark green
      case 3:
        return 'bg-[#30a14e]'; // Medium green
      case 2:
        return 'bg-[#40c463]'; // Light green
      case 1:
        return 'bg-[#9be9a8]'; // Pale green
      default:
        return 'bg-[#ebedf0]'; // Empty gray
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* 1. Header Profile Banner Card */}
      <div className="bg-white border border-[#e2e8f0] rounded-2xl p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center space-x-5">
            {/* Big Avatar */}
            <div
              className={`w-18 h-18 rounded-2xl text-white flex items-center justify-center font-bold text-2xl shadow-md ${avatar.bg}`}
            >
              {avatar.initials}
            </div>

            <div>
              <div className="flex items-center space-x-3">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                  {user?.name}
                </h1>
                <span className="px-2.5 py-0.5 bg-blue-50 text-[#2563eb] border border-blue-200 text-xs font-semibold rounded-full capitalize">
                  {primaryRole}
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-1">{user?.email}</p>
              <div className="flex items-center flex-wrap gap-2 mt-3">
                {teams.map((t) => (
                  <span
                    key={t.id}
                    className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-lg border border-slate-200"
                  >
                    {t.key} · {t.name} ({t.role})
                  </span>
                ))}
              </div>
            </div>
          </div>

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl border border-rose-200 transition cursor-pointer self-start sm:self-auto"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign out</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. GitHub-Style Operational Activity Heatmap */}
      <div className="bg-white border border-[#e2e8f0] rounded-2xl p-6 sm:p-7 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <GitCommit className="w-4 h-4 text-emerald-600" />
              <span>Operational Activity & Work History</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {totalActions} operational actions, resolutions, and reviews in the last 16 weeks
            </p>
          </div>

          {/* Legend */}
          <div className="flex items-center space-x-1.5 text-xs text-slate-500">
            <span>Less</span>
            <span className="w-3 h-3 rounded-xs bg-[#ebedf0] inline-block" />
            <span className="w-3 h-3 rounded-xs bg-[#9be9a8] inline-block" />
            <span className="w-3 h-3 rounded-xs bg-[#40c463] inline-block" />
            <span className="w-3 h-3 rounded-xs bg-[#30a14e] inline-block" />
            <span className="w-3 h-3 rounded-xs bg-[#216e39] inline-block" />
            <span>More</span>
          </div>
        </div>

        {/* Heatmap Grid */}
        <div className="overflow-x-auto pb-2">
          <div className="inline-flex flex-col space-y-1.5 min-w-[560px]">
            {/* Days rows (Sun to Sat) */}
            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] text-slate-400 w-6 font-medium">Mon</span>
              <div className="flex space-x-1.5">
                {grid.map((week, wIdx) => {
                  const day = week[1]; // Monday
                  return (
                    <div
                      key={wIdx}
                      onMouseEnter={() => setHoveredCell(day)}
                      onMouseLeave={() => setHoveredCell(null)}
                      className={`w-3.5 h-3.5 rounded-xs transition-transform hover:scale-125 cursor-pointer ${getHeatmapColor(
                        day.level
                      )}`}
                    />
                  );
                })}
              </div>
            </div>

            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] text-slate-400 w-6 font-medium">Wed</span>
              <div className="flex space-x-1.5">
                {grid.map((week, wIdx) => {
                  const day = week[3]; // Wednesday
                  return (
                    <div
                      key={wIdx}
                      onMouseEnter={() => setHoveredCell(day)}
                      onMouseLeave={() => setHoveredCell(null)}
                      className={`w-3.5 h-3.5 rounded-xs transition-transform hover:scale-125 cursor-pointer ${getHeatmapColor(
                        day.level
                      )}`}
                    />
                  );
                })}
              </div>
            </div>

            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] text-slate-400 w-6 font-medium">Fri</span>
              <div className="flex space-x-1.5">
                {grid.map((week, wIdx) => {
                  const day = week[5]; // Friday
                  return (
                    <div
                      key={wIdx}
                      onMouseEnter={() => setHoveredCell(day)}
                      onMouseLeave={() => setHoveredCell(null)}
                      className={`w-3.5 h-3.5 rounded-xs transition-transform hover:scale-125 cursor-pointer ${getHeatmapColor(
                        day.level
                      )}`}
                    />
                  );
                })}
              </div>
            </div>

            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] text-slate-400 w-6 font-medium">Sat</span>
              <div className="flex space-x-1.5">
                {grid.map((week, wIdx) => {
                  const day = week[6]; // Saturday
                  return (
                    <div
                      key={wIdx}
                      onMouseEnter={() => setHoveredCell(day)}
                      onMouseLeave={() => setHoveredCell(null)}
                      className={`w-3.5 h-3.5 rounded-xs transition-transform hover:scale-125 cursor-pointer ${getHeatmapColor(
                        day.level
                      )}`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Hover inspection pill */}
        <div className="h-5 text-xs text-slate-600 font-medium">
          {hoveredCell ? (
            <span>
              <strong>{hoveredCell.count} actions</strong> on {hoveredCell.displayDate}
            </span>
          ) : (
            <span className="text-slate-400 text-[11px]">
              Hover over any square to view daily operational actions
            </span>
          )}
        </div>
      </div>

      {/* 3. Performance Metrics & Work Analytics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-[#e2e8f0] rounded-2xl p-5 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Resolved</span>
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">28</div>
          <div className="text-xs text-slate-500">Incident mitigations</div>
        </div>

        <div className="bg-white border border-[#e2e8f0] rounded-2xl p-5 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">SLA Rate</span>
            <TrendingUp className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">98.4%</div>
          <div className="text-xs text-emerald-600 font-medium">On-time resolutions</div>
        </div>

        <div className="bg-white border border-[#e2e8f0] rounded-2xl p-5 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Reviews</span>
            <Shield className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">19</div>
          <div className="text-xs text-slate-500">Lead sign-offs</div>
        </div>

        <div className="bg-white border border-[#e2e8f0] rounded-2xl p-5 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Active</span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">3</div>
          <div className="text-xs text-slate-500">In-progress items</div>
        </div>
      </div>

      {/* 4. Work Breakdown & Specialization Visualizer */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Work by Category */}
        <div className="bg-white border border-[#e2e8f0] rounded-2xl p-6 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Work by Category</h3>
          <div className="space-y-3 text-xs">
            <div>
              <div className="flex justify-between mb-1 font-medium">
                <span className="text-slate-700">Payment Gateways & Settlements</span>
                <span className="text-slate-500 font-semibold">46% (13)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-[#2563eb] h-2 rounded-full" style={{ width: '46%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1 font-medium">
                <span className="text-slate-700">Infrastructure & SRE</span>
                <span className="text-slate-500 font-semibold">32% (9)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '32%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1 font-medium">
                <span className="text-slate-700">Compliance & Regulatory Audits</span>
                <span className="text-slate-500 font-semibold">14% (4)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-purple-500 h-2 rounded-full" style={{ width: '14%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1 font-medium">
                <span className="text-slate-700">Customer Support Escalations</span>
                <span className="text-slate-500 font-semibold">8% (2)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-amber-500 h-2 rounded-full" style={{ width: '8%' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Work by Severity */}
        <div className="bg-white border border-[#e2e8f0] rounded-2xl p-6 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Severity Distribution</h3>
          <div className="space-y-3 text-xs">
            <div>
              <div className="flex justify-between mb-1 font-medium">
                <span className="text-rose-600 font-semibold">Critical (P4)</span>
                <span className="text-slate-500">18% (5)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-rose-500 h-2 rounded-full" style={{ width: '18%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1 font-medium">
                <span className="text-amber-600 font-semibold">High (P3)</span>
                <span className="text-slate-500">43% (12)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-amber-500 h-2 rounded-full" style={{ width: '43%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1 font-medium">
                <span className="text-blue-600 font-semibold">Medium (P2)</span>
                <span className="text-slate-500">32% (9)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full" style={{ width: '32%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1 font-medium">
                <span className="text-slate-600 font-semibold">Low (P1)</span>
                <span className="text-slate-500">7% (2)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-slate-400 h-2 rounded-full" style={{ width: '7%' }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Password Security Card */}
      <div className="bg-white border border-[#e2e8f0] rounded-2xl p-6 sm:p-7 shadow-xs space-y-4">
        <div className="flex items-center space-x-2">
          <Lock className="w-4 h-4 text-slate-500" />
          <h2 className="text-base font-bold text-slate-900">Change Password</h2>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Current password
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full bg-slate-50 border border-[#e2e8f0] rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#2563eb]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                New password
              </label>
              <input
                type="password"
                required
                minLength={12}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-slate-50 border border-[#e2e8f0] rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#2563eb]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Confirm new password
              </label>
              <input
                type="password"
                required
                minLength={12}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-slate-50 border border-[#e2e8f0] rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#2563eb]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !currentPassword || !newPassword}
            className="px-4 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold rounded-xl shadow-xs transition disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Updating...' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}
