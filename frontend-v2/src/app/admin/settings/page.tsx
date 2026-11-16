"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, ShieldOff, Search, GraduationCap, UserCheck } from "lucide-react";
import { adminUsersAPI } from "@/config/api";
import { useAuth } from "@/context/AuthContext";
import toast from "react-hot-toast";
import { Spinner } from "@/components/ui/spinner";

export default function AdminSettingsPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [adminsOnly, setAdminsOnly] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await adminUsersAPI.getAll(search, adminsOnly);
      if (res.data.success) {
        setUsers(res.data.users);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchUsers();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [search, adminsOnly]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    setActionLoading(userId);
    try {
      const res = await adminUsersAPI.updateRole(userId, {
        role: newRole,
        isAdmin: newRole === "admin" || newRole === "super_admin",
      });
      toast.success(res.data?.message || `User role updated to ${newRole}`);
      fetchUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to update user role");
    } finally {
      setActionLoading(null);
    }
  };

  const handlePromote = async (userId: string) => {
    setActionLoading(userId);
    try {
      const res = await adminUsersAPI.promote(userId);
      toast.success(res.data.message);
      fetchUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to promote user");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDemote = async (userId: string) => {
    if (!confirm("Are you sure you want to remove admin access for this user?")) return;
    setActionLoading(userId);
    try {
      const res = await adminUsersAPI.demote(userId);
      toast.success(res.data.message);
      fetchUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to demote user");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="p-8 font-sans max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Admin Management</h1>
        <p className="text-muted-foreground text-sm mt-1">Search users and manage administrative privileges.</p>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-foreground"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="adminsOnly"
              checked={adminsOnly}
              onChange={(e) => setAdminsOnly(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary/20 w-4 h-4 bg-background"
            />
            <label htmlFor="adminsOnly" className="text-sm font-medium text-muted-foreground cursor-pointer select-none">
              Show Admins Only
            </label>
          </div>
        </div>

        {/* User List */}
        <div className="overflow-x-auto min-h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Spinner className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
                <ShieldOff className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-foreground font-medium">No users found</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Try adjusting your search criteria.</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm text-muted-foreground">
              <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border">
                <tr>
                  <th className="px-6 py-3">User Details</th>
                  <th className="px-6 py-3">Role</th>
                  <th className="px-6 py-3">Joined</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((u) => (
                  <tr key={u._id} className="hover:bg-muted/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full border border-border bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                          {u.avatar ? (
                            <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="font-bold text-lg text-muted-foreground">
                              {u.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{u.name}</p>
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {['faculty', 'teacher', 'instructor'].includes(u.role) ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <GraduationCap className="w-3.5 h-3.5" /> Faculty
                        </span>
                      ) : u.isAdmin || ['admin', 'super_admin', 'student_admin', 'assessment_admin'].includes(u.role) ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20">
                          <ShieldCheck className="w-3.5 h-3.5" /> {u.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                          <UserCheck className="w-3.5 h-3.5" /> Student
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString('en-GB')}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-90 group-hover:opacity-100 transition-opacity">
                        {actionLoading === u._id ? (
                          <Spinner className="w-5 h-5 text-muted-foreground animate-spin" />
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <select
                              value={['faculty', 'teacher', 'instructor'].includes(u.role) ? 'faculty' : u.isAdmin || ['admin', 'super_admin'].includes(u.role) ? 'admin' : 'student'}
                              disabled={currentUser?.id === u._id}
                              onChange={(e) => handleRoleChange(u._id, e.target.value)}
                              className="text-xs bg-background border border-border rounded-md px-2 py-1 text-foreground focus:ring-1 focus:ring-primary outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              aria-label={`Change role for ${u.name}`}
                            >
                              <option value="student">Student</option>
                              <option value="faculty">Faculty</option>
                              <option value="admin">Admin</option>
                            </select>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
