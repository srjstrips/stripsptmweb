'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { UserPlus, Pencil, Trash2, Shield, X, Eye, EyeOff, LayoutDashboard, Factory, Truck, Package, BarChart3, Zap, Users } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import Spinner from '@/components/Spinner';
import { usersApi, PtmUser } from '@/lib/api';

const PAGES = [
  { path: '/',            label: 'Dashboard',       icon: LayoutDashboard, always: true },
  { path: '/production',  label: 'Production',      icon: Factory },
  { path: '/dispatch',    label: 'Dispatch',        icon: Truck },
  { path: '/stock',       label: 'Live Stock',      icon: Package },
  { path: '/reports',     label: 'Reports',         icon: BarChart3 },
  { path: '/breakdown',   label: 'Breakdown',       icon: Zap },
  { path: '/admin',       label: 'User Management', icon: Users },
];

const PAGE_COLORS: Record<string, string> = {
  '/production': 'bg-blue-50 border-blue-300 text-blue-700',
  '/dispatch':   'bg-amber-50 border-amber-300 text-amber-700',
  '/stock':      'bg-green-50 border-green-300 text-green-700',
  '/reports':    'bg-teal-50 border-teal-300 text-teal-700',
  '/breakdown':  'bg-orange-50 border-orange-300 text-orange-700',
  '/admin':      'bg-purple-50 border-purple-300 text-purple-700',
  '/':           'bg-slate-50 border-slate-300 text-slate-600',
};

const EMPTY_FORM = { username: '', password: '', allowed_routes: ['/'] as string[] };

function PageBadge({ path }: { path: string }) {
  const page = PAGES.find(p => p.path === path);
  if (!page) return null;
  const Icon = page.icon;
  const colors = PAGE_COLORS[path] ?? 'bg-slate-50 border-slate-300 text-slate-600';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${colors}`}>
      <Icon size={11} /> {page.label}
    </span>
  );
}

export default function UsersPage() {
  const [users, setUsers]           = useState<PtmUser[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [form, setForm]             = useState({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [showPass, setShowPass]     = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await usersApi.list();
      setUsers(res.data.data);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, allowed_routes: ['/'] });
    setEditingId(null);
    setShowPass(false);
    setShowForm(true);
  };

  const openEdit = (u: PtmUser) => {
    setForm({ username: u.username, password: '', allowed_routes: u.allowed_routes?.length ? u.allowed_routes : ['/'] });
    setEditingId(u.id);
    setShowPass(false);
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditingId(null); };

  const toggleRoute = (path: string) => {
    if (path === '/') return; // Dashboard always on
    setForm(p => ({
      ...p,
      allowed_routes: p.allowed_routes.includes(path)
        ? p.allowed_routes.filter(r => r !== path)
        : [...p.allowed_routes, path],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username.trim()) return toast.error('Username is required');
    if (!editingId && !form.password) return toast.error('Password is required');
    if (form.allowed_routes.length === 0) return toast.error('Select at least one page');
    setSubmitting(true);
    try {
      if (editingId) {
        const payload: { username: string; allowed_routes: string[]; password?: string } = {
          username: form.username,
          allowed_routes: form.allowed_routes,
        };
        if (form.password) payload.password = form.password;
        await usersApi.update(editingId, payload);
        toast.success('User updated');
      } else {
        await usersApi.create({ username: form.username, password: form.password, allowed_routes: form.allowed_routes });
        toast.success('User created');
      }
      closeForm();
      load();
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { message?: string } } };
      toast.error(ex?.response?.data?.message || 'Failed to save user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (u: PtmUser) => {
    if (!confirm(`Delete user "${u.username}"? They will no longer be able to log in.`)) return;
    try {
      await usersApi.delete(u.id);
      toast.success('User deleted');
      load();
    } catch {
      toast.error('Failed to delete user');
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <PageHeader
        title="User Management"
        subtitle={`${users.length} user${users.length !== 1 ? 's' : ''}`}
        actions={
          <button onClick={openCreate} className="btn-primary">
            <UserPlus size={15} /> Add User
          </button>
        }
      />

      {/* Form */}
      {showForm && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-700 flex items-center gap-2">
              <Shield size={16} />
              {editingId ? 'Edit User' : 'New User'}
            </h2>
            <button onClick={closeForm} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Username + Password */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Username *</label>
                <input
                  className="form-input"
                  value={form.username}
                  onChange={(e) => setForm(p => ({ ...p, username: e.target.value }))}
                  placeholder="e.g. john"
                  autoComplete="off"
                  required
                />
              </div>
              <div>
                <label className="form-label">
                  Password {editingId && <span className="text-slate-400 font-normal">(leave blank to keep)</span>}
                  {!editingId && ' *'}
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    className="form-input pr-10"
                    value={form.password}
                    onChange={(e) => setForm(p => ({ ...p, password: e.target.value }))}
                    placeholder={editingId ? 'New password…' : 'Password'}
                    autoComplete="new-password"
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Page access */}
            <div>
              <label className="form-label">Page Access *</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                {PAGES.map(({ path, label, icon: Icon, always }) => {
                  const selected = form.allowed_routes.includes(path);
                  return (
                    <button
                      key={path}
                      type="button"
                      disabled={always}
                      onClick={() => toggleRoute(path)}
                      className={`
                        flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors text-left
                        ${selected
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}
                        ${always ? 'opacity-60 cursor-default' : 'cursor-pointer'}
                      `}
                    >
                      <Icon size={15} className="shrink-0" />
                      <span className="truncate">{label}</span>
                      {always && <span className="ml-auto text-[10px] opacity-70">always</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? <Spinner size={14} /> : <Shield size={14} />}
                {submitting ? 'Saving…' : editingId ? 'Update User' : 'Create User'}
              </button>
              <button type="button" onClick={closeForm} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Users table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner size={28} /></div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-slate-400 gap-2">
            <Shield size={32} className="text-slate-300" />
            <p className="text-sm">No users yet. Click <strong>Add User</strong> to create one.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="table-th">Username</th>
                <th className="table-th">Page Access</th>
                <th className="table-th">Created</th>
                <th className="table-th w-20"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="table-td font-medium">{u.username}</td>
                  <td className="table-td">
                    <div className="flex flex-wrap gap-1">
                      {(u.allowed_routes ?? []).filter(r => r !== '/').map(r => (
                        <PageBadge key={r} path={r} />
                      ))}
                      {(u.allowed_routes ?? []).filter(r => r !== '/').length === 0 && (
                        <span className="text-slate-400 text-xs">Dashboard only</span>
                      )}
                    </div>
                  </td>
                  <td className="table-td text-slate-400 whitespace-nowrap">
                    {new Date(u.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="table-td">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(u)} className="btn-secondary py-1 px-2" title="Edit">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => handleDelete(u)} className="btn-danger py-1 px-2" title="Delete">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
