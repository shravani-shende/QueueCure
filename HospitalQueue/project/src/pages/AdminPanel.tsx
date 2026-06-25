import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Doctor, Profile } from '../lib/types';
import {
  Shield, LogOut, Plus, User, Stethoscope,
  CheckCircle, AlertTriangle, Loader2, Eye, EyeOff, KeyRound, X
} from 'lucide-react';

function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Minimum 8 characters';
  if (!/[A-Z]/.test(password)) return 'Must include an uppercase letter';
  if (!/[a-z]/.test(password)) return 'Must include a lowercase letter';
  if (!/\d/.test(password)) return 'Must include a number';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Must include a special character';
  return null;
}

interface ResetModalState {
  rec: Profile;
  password: string;
  show: boolean;
  loading: boolean;
  error: string;
  success: string;
}

export default function AdminPanel() {
  const { profile, signOut } = useAuth();
  const [tab, setTab] = useState<'doctors' | 'receptionists'>('doctors');

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [receptionists, setReceptionists] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Doctor form
  const [doctorForm, setDoctorForm] = useState({ name: '', specialty: '', room: '' });
  const [doctorError, setDoctorError] = useState('');
  const [doctorSuccess, setDoctorSuccess] = useState('');
  const [addingDoctor, setAddingDoctor] = useState(false);

  // Receptionist form
  const [receptionistForm, setReceptionistForm] = useState({ name: '', email: '', password: '' });
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [receptionistError, setReceptionistError] = useState('');
  const [receptionistSuccess, setReceptionistSuccess] = useState('');
  const [addingReceptionist, setAddingReceptionist] = useState(false);

  // Reset password modal
  const [resetModal, setResetModal] = useState<ResetModalState | null>(null);
  const [showResetPassword, setShowResetPassword] = useState(false);

  async function loadData() {
    setLoading(true);
    const [docs, profs] = await Promise.all([
      api.doctors(),
      api.profiles('receptionist'),
    ]);
    setDoctors(docs);
    setReceptionists(profs);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function addDoctor(e: React.FormEvent) {
    e.preventDefault();
    setDoctorError('');
    setDoctorSuccess('');
    if (!doctorForm.name.trim() || !doctorForm.specialty.trim() || !doctorForm.room.trim()) {
      setDoctorError('All fields are required');
      return;
    }
    setAddingDoctor(true);
    let data: Doctor;
    try {
      data = await api.addDoctor({ name: doctorForm.name.trim(), specialty: doctorForm.specialty.trim(), room: doctorForm.room.trim() });
    } catch (err) {
      setDoctorError(err instanceof Error ? err.message : 'Failed to add doctor');
      setAddingDoctor(false);
      return;
    }

    setDoctorSuccess(`${data.name} added successfully`);
    setDoctorForm({ name: '', specialty: '', room: '' });
    await loadData();
    setAddingDoctor(false);
  }

  async function toggleDoctorActive(doctor: Doctor) {
    await api.updateDoctor(doctor.id, { is_active: !doctor.is_active });
    await loadData();
  }

  async function addReceptionist(e: React.FormEvent) {
    e.preventDefault();
    setReceptionistError('');
    setReceptionistSuccess('');

    if (!receptionistForm.name.trim() || !receptionistForm.email.trim() || !receptionistForm.password) {
      setReceptionistError('All fields are required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(receptionistForm.email)) {
      setReceptionistError('Enter a valid email address');
      return;
    }
    const pwError = validatePassword(receptionistForm.password);
    if (pwError) { setReceptionistError(pwError); return; }

    setAddingReceptionist(true);

    try {
      await api.addReceptionist({
        name: receptionistForm.name.trim(),
        email: receptionistForm.email.trim().toLowerCase(),
        password: receptionistForm.password,
      });
    } catch (err) {
      setReceptionistError(err instanceof Error ? err.message : 'Failed to create account');
      setAddingReceptionist(false);
      return;
    }

    setReceptionistSuccess(`${receptionistForm.name} added successfully`);
    setReceptionistForm({ name: '', email: '', password: '' });
    await loadData();
    setAddingReceptionist(false);
  }

  async function toggleReceptionistActive(rec: Profile) {
    await api.updateProfile(rec.id, { is_active: !rec.is_active });
    await loadData();
  }

  function openResetModal(rec: Profile) {
    setResetModal({ rec, password: '', show: true, loading: false, error: '', success: '' });
    setShowResetPassword(false);
  }

  async function submitResetPassword() {
    if (!resetModal) return;
    const pwError = validatePassword(resetModal.password);
    if (pwError) {
      setResetModal(m => m ? { ...m, error: pwError, success: '' } : null);
      return;
    }
    setResetModal(m => m ? { ...m, loading: true, error: '', success: '' } : null);

    try {
      await api.resetProfilePassword(resetModal.rec.id, resetModal.password);
    } catch (err) {
      setResetModal(m => m ? { ...m, loading: false, error: err instanceof Error ? err.message : 'Failed to reset password' } : null);
      return;
    }

    setResetModal(m => m ? { ...m, loading: false, success: 'Password reset successfully!', password: '' } : null);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-800">Hospital Admin</p>
              <p className="text-xs text-slate-500">City Care Hospital · {profile?.name}</p>
            </div>
          </div>
          <button onClick={signOut} className="flex items-center gap-2 text-slate-500 hover:text-red-600 text-sm transition-colors">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex gap-2 mb-8 bg-slate-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setTab('doctors')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'doctors' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Stethoscope className="w-4 h-4" /> Doctors
          </button>
          <button
            onClick={() => setTab('receptionists')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'receptionists' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <User className="w-4 h-4" /> Receptionists
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <>
            {tab === 'doctors' && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Plus className="w-5 h-5 text-blue-600" /> Add Doctor
                  </h3>
                  <form onSubmit={addDoctor} className="space-y-4">
                    <div className="grid md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Full Name</label>
                        <input type="text" value={doctorForm.name} onChange={e => setDoctorForm(f => ({ ...f, name: e.target.value }))} placeholder="Dr. Full Name" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Specialty</label>
                        <input type="text" value={doctorForm.specialty} onChange={e => setDoctorForm(f => ({ ...f, specialty: e.target.value }))} placeholder="e.g. Cardiologist" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Room</label>
                        <input type="text" value={doctorForm.room} onChange={e => setDoctorForm(f => ({ ...f, room: e.target.value }))} placeholder="e.g. Room 107" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                    {doctorError && <p className="text-red-600 text-xs flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{doctorError}</p>}
                    {doctorSuccess && <p className="text-green-600 text-xs flex items-center gap-1"><CheckCircle className="w-3 h-3" />{doctorSuccess}</p>}
                    <button type="submit" disabled={addingDoctor} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors disabled:opacity-60">
                      {addingDoctor ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      Add Doctor
                    </button>
                  </form>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <h3 className="font-semibold text-slate-800">All Doctors ({doctors.length})</h3>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {doctors.map(doctor => (
                      <div key={doctor.id} className="px-5 py-4 flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${doctor.is_active ? 'bg-blue-100' : 'bg-slate-100'}`}>
                          <Stethoscope className={`w-5 h-5 ${doctor.is_active ? 'text-blue-600' : 'text-slate-400'}`} />
                        </div>
                        <div className="flex-1">
                          <p className={`font-semibold ${doctor.is_active ? 'text-slate-800' : 'text-slate-400'}`}>{doctor.name}</p>
                          <p className="text-xs text-slate-500">{doctor.specialty} · {doctor.room}</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${doctor.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {doctor.is_active ? 'Active' : 'Inactive'}
                        </span>
                        <button onClick={() => toggleDoctorActive(doctor)} className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${doctor.is_active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
                          {doctor.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === 'receptionists' && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Plus className="w-5 h-5 text-blue-600" /> Add Receptionist
                  </h3>
                  <form onSubmit={addReceptionist} className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Full Name</label>
                        <input type="text" value={receptionistForm.name} onChange={e => setReceptionistForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Email Address</label>
                        <input type="email" value={receptionistForm.email} onChange={e => setReceptionistForm(f => ({ ...f, email: e.target.value }))} placeholder="receptionist@hospital.com" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Password</label>
                      <div className="relative">
                        <input
                          type={showAddPassword ? 'text' : 'password'}
                          value={receptionistForm.password}
                          onChange={e => setReceptionistForm(f => ({ ...f, password: e.target.value }))}
                          placeholder="Min 8 chars, upper, lower, number, symbol"
                          className="w-full px-3 py-2.5 pr-10 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button type="button" onClick={() => setShowAddPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                          {showAddPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">Requires uppercase, lowercase, number and special character (e.g. Name@2024)</p>
                    </div>
                    {receptionistError && <p className="text-red-600 text-xs flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{receptionistError}</p>}
                    {receptionistSuccess && <p className="text-green-600 text-xs flex items-center gap-1"><CheckCircle className="w-3 h-3" />{receptionistSuccess}</p>}
                    <button type="submit" disabled={addingReceptionist} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors disabled:opacity-60">
                      {addingReceptionist ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      Add Receptionist
                    </button>
                  </form>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <h3 className="font-semibold text-slate-800">All Receptionists ({receptionists.length})</h3>
                  </div>
                  {receptionists.length === 0 ? (
                    <div className="py-10 text-center">
                      <User className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                      <p className="text-slate-400 text-sm">No receptionists added yet</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {receptionists.map(rec => (
                        <div key={rec.id} className="px-5 py-4 flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${rec.is_active ? 'bg-blue-100' : 'bg-slate-100'}`}>
                            <User className={`w-5 h-5 ${rec.is_active ? 'text-blue-600' : 'text-slate-400'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`font-semibold truncate ${rec.is_active ? 'text-slate-800' : 'text-slate-400'}`}>{rec.name}</p>
                            <p className="text-xs text-slate-500 truncate">{rec.email}</p>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${rec.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                            {rec.is_active ? 'Active' : 'Inactive'}
                          </span>
                          <button
                            onClick={() => openResetModal(rec)}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors flex-shrink-0"
                          >
                            <KeyRound className="w-3.5 h-3.5" /> Reset Password
                          </button>
                          <button
                            onClick={() => toggleReceptionistActive(rec)}
                            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors flex-shrink-0 ${rec.is_active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}
                          >
                            {rec.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Reset Password Modal */}
      {resetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                  <KeyRound className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Reset Password</h3>
                  <p className="text-xs text-slate-500">{resetModal.rec.name}</p>
                </div>
              </div>
              <button onClick={() => setResetModal(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">New Password</label>
                <div className="relative">
                  <input
                    type={showResetPassword ? 'text' : 'password'}
                    value={resetModal.password}
                    onChange={e => setResetModal(m => m ? { ...m, password: e.target.value, error: '', success: '' } : null)}
                    placeholder="e.g. Name@2024"
                    className="w-full px-3 py-2.5 pr-10 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button type="button" onClick={() => setShowResetPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1">Requires uppercase, lowercase, number and special character</p>
              </div>

              {resetModal.error && (
                <p className="text-red-600 text-xs flex items-center gap-1.5 bg-red-50 px-3 py-2 rounded-lg">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />{resetModal.error}
                </p>
              )}
              {resetModal.success && (
                <p className="text-green-700 text-xs flex items-center gap-1.5 bg-green-50 px-3 py-2 rounded-lg">
                  <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />{resetModal.success}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={() => setResetModal(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors">
                  {resetModal.success ? 'Close' : 'Cancel'}
                </button>
                {!resetModal.success && (
                  <button
                    onClick={submitResetPassword}
                    disabled={resetModal.loading || !resetModal.password}
                    className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {resetModal.loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {resetModal.loading ? 'Resetting...' : 'Reset Password'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
