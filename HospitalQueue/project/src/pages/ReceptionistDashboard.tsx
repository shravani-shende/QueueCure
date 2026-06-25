import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Appointment, Doctor, QueueState, VisitCategory } from '../lib/types';
import { getCategoryAverages, calculateETA } from '../lib/eta';
import {
  Stethoscope, LogOut, Play, CheckCircle, SkipForward, RotateCcw,
  Clock, PlayCircle, Coffee, ChevronRight, MessageCircle, Plus,
  AlertTriangle, User, Loader2, Calendar, CalendarOff, Activity,
  ClipboardList, Settings2, ArrowLeft, X, Trash2
} from 'lucide-react';

function padToken(n: number) { return String(n).padStart(3, '0'); }

function formatEta(minutes: number | undefined) {
  if (minutes === undefined) return '--';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

const CATEGORY_PILL: Record<string, string> = {
  'New Consultation': 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  'Follow-up':        'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  'Report Review':    'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  'Emergency':        'bg-red-50 text-red-700 ring-1 ring-red-200',
};

function todayStr() { return new Date().toISOString().split('T')[0]; }

function timeStr(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function defaultBreakTimes() {
  const start = new Date();
  start.setSeconds(0, 0);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return { start: timeStr(start), end: timeStr(end) };
}

function isOnLeaveToday(qs: QueueState | null): boolean {
  if (!qs?.is_on_leave) return false;
  const today = todayStr();
  const from = qs.leave_from ?? today;
  const until = qs.leave_until ?? today;
  return today >= from && today <= until;
}

function isOnBreak(qs: QueueState | null): boolean {
  return !!(qs?.is_paused && !isOnLeaveToday(qs));
}

type DashTab = 'queue' | 'schedule';
const VISIT_CATEGORIES = ['New Consultation', 'Follow-up', 'Report Review', 'Emergency'] as const;
const LIVE_REFRESH_MS = 3000;

export default function ReceptionistDashboard() {
  const { profile, signOut } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [tab, setTab] = useState<DashTab>('queue');

  const [queue, setQueue] = useState<Appointment[]>([]);
  const [pendingAppointments, setPendingAppointments] = useState<Appointment[]>([]);
  const [etaMap, setEtaMap] = useState<Record<string, number>>({});
  const [queueState, setQueueState] = useState<QueueState | null>(null);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [registerForm, setRegisterForm] = useState({ name: '', age: '', phone: '', visitCategory: 'New Consultation' });
  const [registerError, setRegisterError] = useState('');
  const [notificationStatus, setNotificationStatus] = useState('');
  const [manualWhatsappUrl, setManualWhatsappUrl] = useState('');
  const [registering, setRegistering] = useState(false);

  // Break form
  const initialBreak = defaultBreakTimes();
  const [breakStart, setBreakStart] = useState(initialBreak.start);
  const [breakEnd, setBreakEnd] = useState(initialBreak.end);
  const [breakError, setBreakError] = useState('');
  const [savingBreak, setSavingBreak] = useState(false);

  // Leave form
  const [leaveFrom, setLeaveFrom] = useState(todayStr());
  const [leaveUntil, setLeaveUntil] = useState(todayStr());
  const [leaveNote, setLeaveNote] = useState('');
  const [savingLeave, setSavingLeave] = useState(false);
  const [leaveError, setLeaveError] = useState('');

  useEffect(() => {
    api.doctors(true).then(setDoctors).catch(() => setDoctors([]));
  }, []);

  const loadQueue = useCallback(async (showLoading = true) => {
    if (!selectedDoctor) return;
    if (showLoading) setLoadingQueue(true);
    try {
      const today = todayStr();

      const [appts, pending, qs] = await Promise.all([
        api.appointments({ doctorId: selectedDoctor.id, date: today, status: 'waiting,consulting', sort: 'queue_position', asc: true }),
        api.appointments({ doctorId: selectedDoctor.id, date: today, status: 'pending', sort: 'created_at', asc: true }),
        api.queueState(selectedDoctor.id),
      ]);

      setQueue(appts ?? []);
      setPendingAppointments(pending ?? []);
      setQueueState(qs ?? null);

      const averages = await getCategoryAverages(selectedDoctor.id);
      const delay = Number(qs?.pause_delay_minutes ?? 0);
      const consulting = appts?.find((p: Appointment) => p.status === 'consulting');
      const waiting = appts?.filter((p: Appointment) => p.status === 'waiting') ?? [];
      const newEta: Record<string, number> = {};

      waiting.forEach((patient: Appointment, i: number) => {
        const ahead: Appointment[] = [];
        if (consulting) ahead.push(consulting);
        ahead.push(...waiting.slice(0, i));
        newEta[patient.id] = calculateETA(ahead, averages, delay);
      });
      if (consulting) newEta[consulting.id] = 0;
      setEtaMap(newEta);
    } finally {
      if (showLoading) setLoadingQueue(false);
    }
  }, [selectedDoctor]);

  useEffect(() => {
    if (!selectedDoctor) return;
    loadQueue();
    const poll = setInterval(() => loadQueue(false), LIVE_REFRESH_MS);
    return () => { clearInterval(poll); };
  }, [selectedDoctor, loadQueue]);

  // Pre-fill leave form from current state when tab opens
  useEffect(() => {
    if (tab === 'schedule' && queueState?.is_on_leave) {
      setLeaveFrom(queueState.leave_from ?? todayStr());
      setLeaveUntil(queueState.leave_until ?? todayStr());
      setLeaveNote(queueState.leave_note ?? '');
    }
  }, [tab, queueState]);

  async function startConsulting(appt: Appointment) {
    setActionLoading(appt.id);
    const consulting = queue.find(p => p.status === 'consulting');
    if (consulting) await completeConsultation(consulting, true);
    await api.updateAppointment(appt.id, { status: 'consulting', consultation_start_at: new Date().toISOString() });
    await loadQueue();
    setActionLoading(null);
  }

  async function completeConsultation(appt: Appointment, silent = false) {
    if (!silent) setActionLoading(appt.id);
    await api.updateAppointment(appt.id, { status: 'completed', consultation_end_at: new Date().toISOString() });
    if (!silent) { await loadQueue(); setActionLoading(null); }
  }

  async function skipPatient(appt: Appointment) {
    setActionLoading(appt.id);
    const lastPosition = Math.max(0, ...queue.filter(p => p.status === 'waiting' && p.id !== appt.id).map(p => p.queue_position));
    await api.updateAppointment(appt.id, {
      status: 'waiting',
      queue_position: lastPosition + 1,
      consultation_start_at: null,
    });
    await loadQueue();
    setActionLoading(null);
  }

  async function deletePatient(appt: Appointment) {
    if (!window.confirm(`Delete token ${padToken(appt.token_number)} for ${appt.patient_name}?`)) return;
    setActionLoading(appt.id);
    await api.deleteAppointment(appt.id);
    await loadQueue();
    setActionLoading(null);
  }

  async function returnToWaiting(appt: Appointment) {
    setActionLoading(appt.id);
    const waiting = queue.filter(p => p.status === 'waiting');
    const newPos = (waiting[waiting.length - 1]?.queue_position ?? 0) + 1;
    await api.updateAppointment(appt.id, { status: 'waiting', queue_position: newPos, consultation_start_at: null });
    await loadQueue();
    setActionLoading(null);
  }

  async function saveBreak() {
    if (!selectedDoctor || !breakStart || !breakEnd) return;
    setBreakError('');
    const start = new Date(`${todayStr()}T${breakStart}:00`);
    const end = new Date(`${todayStr()}T${breakEnd}:00`);
    const mins = Math.round((end.getTime() - start.getTime()) / 60000);
    if (mins <= 0) {
      setBreakError('End time must be later than start time');
      return;
    }
    if (mins > 240) {
      setBreakError('A break can be a maximum of 4 hours');
      return;
    }
    setSavingBreak(true);
    await api.updateQueueState(selectedDoctor.id, {
      is_paused: true,
      pause_delay_minutes: mins,
      break_started_at: start.toISOString(),
      is_on_leave: false,
      updated_at: new Date().toISOString(),
    });
    const nextBreak = defaultBreakTimes();
    setBreakStart(nextBreak.start);
    setBreakEnd(nextBreak.end);
    await loadQueue();
    setSavingBreak(false);
  }

  async function endBreak() {
    if (!selectedDoctor) return;
    await api.updateQueueState(selectedDoctor.id, { is_paused: false, pause_delay_minutes: 0, break_started_at: null, updated_at: new Date().toISOString() });
    await loadQueue();
  }

  async function saveLeave() {
    if (!selectedDoctor) return;
    setLeaveError('');
    if (leaveUntil < leaveFrom) { setLeaveError('End date must be on or after start date'); return; }
    setSavingLeave(true);
    await api.updateQueueState(selectedDoctor.id, {
      is_on_leave: true,
      leave_from: leaveFrom,
      leave_until: leaveUntil,
      leave_note: leaveNote.trim(),
      is_paused: false,
      pause_delay_minutes: 0,
      updated_at: new Date().toISOString(),
    });
    await loadQueue();
    setSavingLeave(false);
  }

  async function cancelLeave() {
    if (!selectedDoctor) return;
    await api.updateQueueState(selectedDoctor.id, { is_on_leave: false, leave_from: null, leave_until: null, leave_note: '', updated_at: new Date().toISOString() });
    setLeaveFrom(todayStr());
    setLeaveUntil(todayStr());
    setLeaveNote('');
    await loadQueue();
  }

  const consultingPatient = queue.find(p => p.status === 'consulting');
  const waitingPatients = queue.filter(p => p.status === 'waiting');
  const onLeave = isOnLeaveToday(queueState);
  const onBreak = isOnBreak(queueState);

  async function approveAppointment(appt: Appointment) {
    setActionLoading(appt.id);
    setNotificationStatus('');
    setManualWhatsappUrl('');
    try {
      const approved = await api.approveAppointment(appt.id);
      setNotificationStatus(
        approved.whatsappSent
          ? `Token ${padToken(approved.appointment.token_number)} added to queue. QR sent on WhatsApp.`
          : `Token ${padToken(approved.appointment.token_number)} added to queue. Open WhatsApp below to send the tracking link.`
      );
      if (!approved.whatsappSent) setManualWhatsappUrl(approved.whatsappUrl);
      await loadQueue();
    } finally {
      setActionLoading(null);
    }
  }

  async function registerPatient(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDoctor) return;
    setRegisterError('');
    if (!registerForm.name.trim() || !registerForm.age || !/^[6-9]\d{9}$/.test(registerForm.phone)) {
      setRegisterError('Enter patient name, valid age, and 10-digit mobile number');
      return;
    }
    setRegistering(true);
    setManualWhatsappUrl('');
    try {
      const created = await api.createAppointment({
        doctor_id: selectedDoctor.id,
        patient_name: registerForm.name.trim(),
        patient_age: Number(registerForm.age),
        patient_phone: registerForm.phone,
        visit_category: registerForm.visitCategory as VisitCategory,
        appointment_date: todayStr(),
        source: 'receptionist',
      });
      setNotificationStatus(
        created.notification?.whatsappSent
          ? `Token ${padToken(created.token_number)} added to queue. QR sent on WhatsApp.`
          : `Token ${padToken(created.token_number)} added to queue. Open WhatsApp below to send the tracking link.`
      );
      if (!created.notification?.whatsappSent && created.notification?.whatsappUrl) {
        setManualWhatsappUrl(created.notification.whatsappUrl);
      }
      setRegisterForm({ name: '', age: '', phone: '', visitCategory: 'New Consultation' });
      await loadQueue();
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : 'Could not register patient');
    } finally {
      setRegistering(false);
    }
  }

  // ── Doctor picker ──────────────────────────────────────────────────────────
  if (!selectedDoctor) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <header className="bg-white border-b border-slate-200">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm">
                <Stethoscope className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-slate-800 leading-tight">Receptionist Portal</p>
                <p className="text-xs text-slate-400">{profile?.name}</p>
              </div>
            </div>
            <button onClick={signOut} className="flex items-center gap-2 text-slate-400 hover:text-red-500 text-sm transition-colors px-3 py-2 rounded-lg hover:bg-red-50">
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-6 py-10">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-800 mb-1">Good {getGreeting()},</h2>
            <p className="text-slate-400">Select a doctor to manage their queue and schedule.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {doctors.map(doctor => (
              <DoctorPickCard key={doctor.id} doctor={doctor} onClick={() => { setSelectedDoctor(doctor); setTab('queue'); }} />
            ))}
          </div>
        </main>
      </div>
    );
  }

  // ── Main dashboard ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center gap-3">
          <button
            onClick={() => setSelectedDoctor(null)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Stethoscope className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-slate-800 text-sm leading-tight truncate">{selectedDoctor.name}</p>
              <p className="text-xs text-slate-400 truncate">{selectedDoctor.specialty} · {selectedDoctor.room}</p>
            </div>
          </div>

          {/* Status badge */}
          {onLeave && (
            <span className="flex items-center gap-1.5 text-xs font-semibold bg-red-100 text-red-700 px-3 py-1 rounded-full flex-shrink-0">
              <CalendarOff className="w-3.5 h-3.5" /> On Leave
            </span>
          )}
          {onBreak && !onLeave && (
            <span className="flex items-center gap-1.5 text-xs font-semibold bg-amber-100 text-amber-700 px-3 py-1 rounded-full flex-shrink-0">
              <Coffee className="w-3.5 h-3.5" /> On Break {queueState?.pause_delay_minutes ? `(+${queueState.pause_delay_minutes}m)` : ''}
            </span>
          )}
          {!onLeave && !onBreak && (
            <span className="flex items-center gap-1.5 text-xs font-semibold bg-green-100 text-green-700 px-3 py-1 rounded-full flex-shrink-0">
              <Activity className="w-3 h-3" /> Active
            </span>
          )}

          <button onClick={signOut} className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0">
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="max-w-5xl mx-auto px-5 pb-0 flex gap-1">
          <TabBtn active={tab === 'queue'} onClick={() => setTab('queue')} icon={<ClipboardList className="w-4 h-4" />} label={`Queue${waitingPatients.length > 0 ? ` (${waitingPatients.length})` : ''}`} />
          <TabBtn active={tab === 'schedule'} onClick={() => setTab('schedule')} icon={<Settings2 className="w-4 h-4" />} label="Schedule" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-6">
        {tab === 'queue' && (
          <QueueTab
            consultingPatient={consultingPatient ?? null}
            waitingPatients={waitingPatients}
            pendingAppointments={pendingAppointments}
            etaMap={etaMap}
            actionLoading={actionLoading}
            loadingQueue={loadingQueue}
            registerForm={registerForm}
            setRegisterForm={setRegisterForm}
            registerError={registerError}
            notificationStatus={notificationStatus}
            manualWhatsappUrl={manualWhatsappUrl}
            registering={registering}
            onRegister={registerPatient}
            onApprove={approveAppointment}
            onStart={startConsulting}
            onComplete={completeConsultation}
            onSkip={skipPatient}
            onDelete={deletePatient}
            onReturn={returnToWaiting}
            onLeave={onLeave}
            onBreak={onBreak}
            queueState={queueState}
          />
        )}

        {tab === 'schedule' && (
          <ScheduleTab
            queueState={queueState}
            onLeave={onLeave}
            onBreak={onBreak}
            breakStart={breakStart}
            setBreakStart={setBreakStart}
            breakEnd={breakEnd}
            setBreakEnd={setBreakEnd}
            breakError={breakError}
            savingBreak={savingBreak}
            onSaveBreak={saveBreak}
            onEndBreak={endBreak}
            leaveFrom={leaveFrom}
            setLeaveFrom={setLeaveFrom}
            leaveUntil={leaveUntil}
            setLeaveUntil={setLeaveUntil}
            leaveNote={leaveNote}
            setLeaveNote={setLeaveNote}
            savingLeave={savingLeave}
            leaveError={leaveError}
            onSaveLeave={saveLeave}
            onCancelLeave={cancelLeave}
          />
        )}
      </main>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${active ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
    >
      {icon}{label}
    </button>
  );
}

function DoctorPickCard({ doctor, onClick }: { doctor: Doctor; onClick: () => void }) {
  const [qs, setQs] = useState<QueueState | null>(null);
  useEffect(() => {
    api.queueState(doctor.id).then(setQs).catch(() => setQs(null));
  }, [doctor.id]);

  const onLeave = isOnLeaveToday(qs);
  const onBreak = isOnBreak(qs);

  return (
    <button
      onClick={onClick}
      className="group bg-white rounded-2xl p-5 border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all text-left"
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${onLeave ? 'bg-red-100' : onBreak ? 'bg-amber-100' : 'bg-blue-100 group-hover:bg-blue-600 transition-colors'}`}>
          <User className={`w-5 h-5 ${onLeave ? 'text-red-500' : onBreak ? 'text-amber-500' : 'text-blue-600 group-hover:text-white transition-colors'}`} />
        </div>
        {onLeave ? (
          <span className="text-xs bg-red-50 text-red-600 font-semibold px-2 py-0.5 rounded-full">On Leave</span>
        ) : onBreak ? (
          <span className="text-xs bg-amber-50 text-amber-600 font-semibold px-2 py-0.5 rounded-full">On Break</span>
        ) : (
          <span className="text-xs bg-green-50 text-green-600 font-semibold px-2 py-0.5 rounded-full">Available</span>
        )}
      </div>
      <p className="font-bold text-slate-800 leading-tight">{doctor.name}</p>
      <p className="text-xs text-slate-400 mt-0.5">{doctor.specialty}</p>
      <p className="text-xs text-slate-300 mt-0.5">{doctor.room}</p>
      <div className="flex items-center gap-1 mt-4 text-slate-400 group-hover:text-blue-500 transition-colors">
        <span className="text-xs font-medium">Manage queue</span>
        <ChevronRight className="w-3.5 h-3.5" />
      </div>
    </button>
  );
}

interface QueueTabProps {
  consultingPatient: Appointment | null;
  waitingPatients: Appointment[];
  pendingAppointments: Appointment[];
  etaMap: Record<string, number>;
  actionLoading: string | null;
  loadingQueue: boolean;
  registerForm: { name: string; age: string; phone: string; visitCategory: string };
  setRegisterForm: React.Dispatch<React.SetStateAction<{ name: string; age: string; phone: string; visitCategory: string }>>;
  registerError: string;
  notificationStatus: string;
  manualWhatsappUrl: string;
  registering: boolean;
  onRegister: (e: React.FormEvent) => void;
  onApprove: (a: Appointment) => void;
  onLeave: boolean;
  onBreak: boolean;
  queueState: QueueState | null;
  onStart: (a: Appointment) => void;
  onComplete: (a: Appointment) => void;
  onSkip: (a: Appointment) => void;
  onDelete: (a: Appointment) => void;
  onReturn: (a: Appointment) => void;
}

function QueueTab({ consultingPatient, waitingPatients, pendingAppointments, etaMap, actionLoading, loadingQueue, registerForm, setRegisterForm, registerError, notificationStatus, manualWhatsappUrl, registering, onRegister, onApprove, onLeave, onBreak, queueState, onStart, onComplete, onSkip, onDelete, onReturn }: QueueTabProps) {
  if (loadingQueue) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Leave/Break notice */}
      {onLeave && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
          <CalendarOff className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-700 text-sm">Doctor is on leave</p>
            {queueState?.leave_note && <p className="text-xs text-red-500 mt-0.5">{queueState.leave_note}</p>}
            <p className="text-xs text-red-400 mt-0.5">
              {queueState?.leave_from} → {queueState?.leave_until}
            </p>
            <p className="text-xs text-red-400 mt-1">Hidden from patient booking. Go to Schedule tab to manage.</p>
          </div>
        </div>
      )}

      {onBreak && !onLeave && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
          <Coffee className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-amber-700 text-sm">Doctor is on a break</p>
            <p className="text-xs text-amber-500 mt-0.5">{queueState?.pause_delay_minutes} min added to all patient ETAs</p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_1fr] gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
            <Plus className="w-4 h-4 text-blue-600" />
            <h3 className="font-semibold text-slate-700 text-sm">Register Patient</h3>
          </div>
          <form onSubmit={onRegister} className="px-5 py-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <input value={registerForm.name} onChange={e => setRegisterForm(f => ({ ...f, name: e.target.value }))} placeholder="Patient name" className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="number" min={1} max={149} value={registerForm.age} onChange={e => setRegisterForm(f => ({ ...f, age: e.target.value }))} placeholder="Age" className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input value={registerForm.phone} onChange={e => setRegisterForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))} placeholder="Mobile number" className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <select value={registerForm.visitCategory} onChange={e => setRegisterForm(f => ({ ...f, visitCategory: e.target.value }))} className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {VISIT_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            {registerError && <p className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{registerError}</p>}
            <button disabled={registering} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60">
              {registering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add to Queue
            </button>
          </form>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-700 text-sm">Pending Approvals</h3>
            <span className="text-xs text-slate-400">{pendingAppointments.length} request{pendingAppointments.length !== 1 ? 's' : ''}</span>
          </div>
          {pendingAppointments.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">No pending patient requests</div>
          ) : (
            <div className="divide-y divide-slate-50 max-h-64 overflow-auto">
              {pendingAppointments.map(appt => (
                <div key={appt.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-800 truncate">{appt.patient_name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-slate-400">Age {appt.patient_age}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_PILL[appt.visit_category]}`}>{appt.visit_category}</span>
                      <span className="text-xs text-slate-400">{appt.patient_phone}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => onApprove(appt)}
                    disabled={actionLoading === appt.id}
                    className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-3 py-2 rounded-xl disabled:opacity-60"
                  >
                    {actionLoading === appt.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />}
                    Approve
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {notificationStatus && (
        <div className={`flex items-center gap-3 rounded-2xl border px-5 py-4 ${manualWhatsappUrl ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
          {manualWhatsappUrl
            ? <MessageCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            : <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />}
          <p className={`text-sm font-medium flex-1 ${manualWhatsappUrl ? 'text-amber-800' : 'text-green-700'}`}>{notificationStatus}</p>
          {manualWhatsappUrl && (
            <a
              href={manualWhatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              Open WhatsApp
            </a>
          )}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Consulting" value={consultingPatient ? padToken(consultingPatient.token_number) : '—'} accent="blue" />
        <StatCard label="Waiting" value={String(waitingPatients.length)} accent="slate" />
        <StatCard label="Total Active" value={String((consultingPatient ? 1 : 0) + waitingPatients.length)} accent="slate" />
      </div>

      {/* Currently consulting */}
      {consultingPatient && (
        <div className="bg-white rounded-2xl border border-green-200 overflow-hidden">
          <div className="px-5 py-3 bg-green-50 border-b border-green-100 flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">Now Consulting</span>
          </div>
          <div className="px-5 py-4 flex items-center gap-4">
            <div className="w-14 h-14 bg-green-600 rounded-2xl flex items-center justify-center flex-shrink-0">
              <span className="text-white font-black text-lg">{padToken(consultingPatient.token_number)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-800 truncate">{consultingPatient.patient_name}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-slate-400">Age {consultingPatient.patient_age}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_PILL[consultingPatient.visit_category]}`}>{consultingPatient.visit_category}</span>
                <span className="text-xs text-slate-400">📱 {consultingPatient.patient_phone}</span>
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <ConsultationTimer startedAt={consultingPatient.consultation_start_at} />
              <ActionBtn icon={<CheckCircle className="w-4 h-4" />} label="Done" color="green" loading={actionLoading === consultingPatient.id} onClick={() => onComplete(consultingPatient)} />
              <ActionBtn icon={<RotateCcw className="w-4 h-4" />} label="" color="slate" loading={actionLoading === consultingPatient.id} onClick={() => onReturn(consultingPatient)} title="Return to waiting" />
            </div>
          </div>
        </div>
      )}

      {/* Waiting queue */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-700 text-sm">Waiting Queue</h3>
          <span className="text-xs text-slate-400">{waitingPatients.length} patient{waitingPatients.length !== 1 ? 's' : ''}</span>
        </div>

        {waitingPatients.length === 0 ? (
          <div className="py-14 text-center">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <ClipboardList className="w-6 h-6 text-slate-300" />
            </div>
            <p className="text-slate-400 text-sm">No patients in queue</p>
            <p className="text-slate-300 text-xs mt-1">Patients appear here when they book via the patient portal</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {waitingPatients.map((appt, index) => (
              <div
                key={appt.id}
                className={`px-5 py-4 flex items-center gap-3 transition-colors ${index === 0 ? 'bg-amber-50/60' : 'hover:bg-slate-50'}`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${index === 0 ? 'bg-amber-500' : 'bg-slate-100'}`}>
                  <span className={`font-black text-sm ${index === 0 ? 'text-white' : 'text-slate-500'}`}>{padToken(appt.token_number)}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-800 text-sm truncate">{appt.patient_name}</p>
                    {index === 0 && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium flex-shrink-0">Next</span>}
                    {appt.visit_category === 'Emergency' && <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-slate-400">Age {appt.patient_age}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_PILL[appt.visit_category]}`}>{appt.visit_category}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-slate-400 flex-shrink-0 mr-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium tabular-nums">~{formatEta(etaMap[appt.id])}</span>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <ActionIconBtn title="Start consulting" color="blue" loading={actionLoading === appt.id} onClick={() => onStart(appt)}>
                    <Play className="w-3.5 h-3.5" />
                  </ActionIconBtn>
                  <ActionIconBtn title="Skip" color="amber" loading={actionLoading === appt.id} onClick={() => onSkip(appt)}>
                    <SkipForward className="w-3.5 h-3.5" />
                  </ActionIconBtn>
                  <ActionIconBtn title="Delete patient" color="red" loading={actionLoading === appt.id} onClick={() => onDelete(appt)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </ActionIconBtn>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ConsultationTimer({ startedAt }: { startedAt: string | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const totalSeconds = startedAt
    ? Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000))
    : 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const value = hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm font-bold tabular-nums text-green-700" title="Consultation duration">
      <Clock className="w-4 h-4" /> {value}
    </div>
  );
}

interface ScheduleTabProps {
  queueState: QueueState | null;
  onLeave: boolean;
  onBreak: boolean;
  breakStart: string;
  setBreakStart: (v: string) => void;
  breakEnd: string;
  setBreakEnd: (v: string) => void;
  breakError: string;
  savingBreak: boolean;
  onSaveBreak: () => void;
  onEndBreak: () => void;
  leaveFrom: string;
  setLeaveFrom: (v: string) => void;
  leaveUntil: string;
  setLeaveUntil: (v: string) => void;
  leaveNote: string;
  setLeaveNote: (v: string) => void;
  savingLeave: boolean;
  leaveError: string;
  onSaveLeave: () => void;
  onCancelLeave: () => void;
}

function ScheduleTab({ queueState, onLeave, onBreak, breakStart, setBreakStart, breakEnd, setBreakEnd, breakError, savingBreak, onSaveBreak, onEndBreak, leaveFrom, setLeaveFrom, leaveUntil, setLeaveUntil, leaveNote, setLeaveNote, savingLeave, leaveError, onSaveLeave, onCancelLeave }: ScheduleTabProps) {
  return (
    <div className="space-y-5 max-w-xl">
      {/* Current status summary */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h3 className="font-semibold text-slate-700 text-sm">Current Status</h3>
        </div>
        <div className="px-5 py-4">
          {onLeave ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <CalendarOff className="w-5 h-5 text-red-500" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-800 text-sm">On Leave</p>
                <p className="text-xs text-slate-500 mt-0.5">{queueState?.leave_from} → {queueState?.leave_until}</p>
                {queueState?.leave_note && <p className="text-xs text-slate-400 mt-0.5 italic">"{queueState.leave_note}"</p>}
              </div>
              <span className="text-xs bg-red-100 text-red-600 font-semibold px-2.5 py-1 rounded-full">Hidden from patients</span>
            </div>
          ) : onBreak ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Coffee className="w-5 h-5 text-amber-500" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-800 text-sm">On Break</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {queueState?.break_started_at
                    ? `${new Date(queueState.break_started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${queueState.pause_delay_minutes} minutes`
                    : `${queueState?.pause_delay_minutes} minutes added to patient ETAs`}
                </p>
              </div>
              <button onClick={onEndBreak} className="text-xs bg-green-100 hover:bg-green-200 text-green-700 font-semibold px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1">
                <PlayCircle className="w-3.5 h-3.5" /> Resume
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Activity className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="font-semibold text-slate-800 text-sm">Active & Available</p>
                <p className="text-xs text-slate-400 mt-0.5">Visible to patients for booking</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Break section */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
          <Coffee className="w-4 h-4 text-amber-500" />
          <h3 className="font-semibold text-slate-700 text-sm">Doctor Break</h3>
        </div>
        <div className="px-5 py-4 space-y-3">
          {onBreak ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">Doctor is currently on a break. End it early or update the duration.</p>
              <button onClick={onEndBreak} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
                <PlayCircle className="w-4 h-4" /> End Break Now
              </button>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-400">Choose the break start and end time. The duration is calculated automatically and added to patient ETAs.</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Start time</label>
                  <input
                    type="time"
                    value={breakStart}
                    onChange={e => setBreakStart(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">End time</label>
                  <input
                    type="time"
                    value={breakEnd}
                    onChange={e => setBreakEnd(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>
              {breakError && (
                <p className="text-red-600 text-xs flex items-center gap-1.5 bg-red-50 px-3 py-2 rounded-lg">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />{breakError}
                </p>
              )}
              <div className="flex justify-end">
                <button
                  onClick={onSaveBreak}
                  disabled={savingBreak || !breakStart || !breakEnd}
                  className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-5 py-3 rounded-xl transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  {savingBreak ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coffee className="w-4 h-4" />}
                  Set Break
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Leave section */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
          <CalendarOff className="w-4 h-4 text-red-500" />
          <h3 className="font-semibold text-slate-700 text-sm">Doctor Leave</h3>
          {onLeave && <span className="ml-auto text-xs bg-red-100 text-red-600 font-medium px-2 py-0.5 rounded-full">Active</span>}
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-slate-400">
            When on leave, the doctor remains visible on the patient booking screen with an “On Leave” label, but appointments cannot be booked.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Leave From</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="date"
                  value={leaveFrom}
                  onChange={e => setLeaveFrom(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Leave Until</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="date"
                  value={leaveUntil}
                  min={leaveFrom}
                  onChange={e => setLeaveUntil(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Reason / Note (optional)</label>
            <input
              type="text"
              value={leaveNote}
              onChange={e => setLeaveNote(e.target.value)}
              placeholder="e.g. Annual leave, Conference, Medical"
              maxLength={100}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>

          {leaveError && (
            <p className="text-red-600 text-xs flex items-center gap-1.5 bg-red-50 px-3 py-2 rounded-lg">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />{leaveError}
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={onSaveLeave}
              disabled={savingLeave}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50"
            >
              {savingLeave ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarOff className="w-4 h-4" />}
              {onLeave ? 'Update Leave' : 'Mark on Leave'}
            </button>
            {onLeave && (
              <button
                onClick={onCancelLeave}
                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
              >
                <X className="w-4 h-4" /> Cancel Leave
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: 'blue' | 'slate' }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 px-4 py-4 text-center">
      <p className={`text-2xl font-black ${accent === 'blue' ? 'text-blue-600' : 'text-slate-800'} tabular-nums`}>{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}

function ActionBtn({ icon, label, color, loading, onClick, title }: { icon: React.ReactNode; label: string; color: 'green' | 'slate'; loading: boolean; onClick: () => void; title?: string }) {
  const colors = {
    green: 'bg-green-600 hover:bg-green-700 text-white',
    slate: 'bg-slate-100 hover:bg-slate-200 text-slate-600',
  };
  return (
    <button title={title} onClick={onClick} disabled={loading} className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl transition-colors disabled:opacity-50 ${colors[color]}`}>
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
      {label && <span>{label}</span>}
    </button>
  );
}

function ActionIconBtn({ children, title, color, loading, onClick }: { children: React.ReactNode; title: string; color: 'blue' | 'amber' | 'red'; loading: boolean; onClick: () => void }) {
  const colors = {
    blue:  'bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white',
    amber: 'bg-amber-50 hover:bg-amber-500 text-amber-600 hover:text-white',
    red: 'bg-red-50 hover:bg-red-600 text-red-600 hover:text-white',
  };
  return (
    <button title={title} onClick={onClick} disabled={loading} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-40 ${colors[color]}`}>
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : children}
    </button>
  );
}
