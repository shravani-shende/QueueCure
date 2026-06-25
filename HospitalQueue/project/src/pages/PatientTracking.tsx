import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Appointment, Doctor } from '../lib/types';
import { getCategoryAverages, calculateETA } from '../lib/eta';
import { Clock, CheckCircle, AlertTriangle, Loader2, Cross, Activity } from 'lucide-react';

function padToken(n: number) {
  return String(n).padStart(3, '0');
}

const LIVE_REFRESH_MS = 3000;

interface Props {
  doctorId: string;
  tokenNumber: number;
  date: string;
}

export default function PatientTracking({ doctorId, tokenNumber, date }: Props) {
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [expired, setExpired] = useState(false);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const [patientsAhead, setPatientsAhead] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentToken, setCurrentToken] = useState<number | null>(null);

  async function load() {
    const [tracking, docs] = await Promise.all([
      api.tracking(doctorId, tokenNumber, date),
      api.doctors(),
    ]);
    const appt = tracking.appointment;
    const doc = docs.find(d => d.id === doctorId) ?? null;

    setExpired(tracking.expired);
    setAppointment(appt);
    setDoctor(doc);

    if (appt && appt.status === 'waiting') {
      const queue = await api.appointments({ doctorId, date, status: 'waiting,consulting', sort: 'queue_position', asc: true });

      const consulting = queue?.find(p => p.status === 'consulting');
      setCurrentToken(consulting?.token_number ?? null);

      const waiting = queue?.filter(p => p.status === 'waiting') ?? [];
      const waitingIndex = waiting.findIndex(p => p.id === appt.id);
      const ahead = [
        ...(consulting ? [consulting] : []),
        ...waiting.slice(0, Math.max(0, waitingIndex)),
      ];
      setPatientsAhead(ahead.length);

      const averages = await getCategoryAverages(doctorId);
      const qs = await api.queueState(doctorId);

      setEta(calculateETA(ahead as Appointment[], averages, Number(qs?.pause_delay_minutes ?? 0)));
    } else if (appt?.status === 'consulting') {
      setCurrentToken(appt.token_number);
      setPatientsAhead(0);
      setEta(0);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();

    const poll = setInterval(load, LIVE_REFRESH_MS);
    return () => { clearInterval(poll); };
  }, [doctorId, tokenNumber, date]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (expired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4">
        <div className="max-w-sm w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-slate-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Tracking Link Expired</h2>
          <p className="text-sm text-slate-500 mt-2">This appointment has been completed, so its live queue and ETA are no longer available.</p>
          <a href="/#/" className="mt-5 inline-block text-sm font-semibold text-blue-600 hover:underline">Book another appointment</a>
        </div>
      </div>
    );
  }

  if (!appointment || !doctor) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-slate-800">Token Not Found</h2>
          <p className="text-slate-500 mt-2">This token does not exist or has expired.</p>
          <a href="/" className="mt-4 inline-block text-blue-600 hover:underline text-sm">Book a new appointment</a>
        </div>
      </div>
    );
  }

  const statusConfig = {
    pending: { color: 'blue', label: 'Pending Approval', icon: Clock },
    waiting: { color: 'blue', label: 'Waiting', icon: Clock },
    consulting: { color: 'green', label: 'Now Consulting', icon: Activity },
    completed: { color: 'slate', label: 'Completed', icon: CheckCircle },
    skipped: { color: 'amber', label: 'Skipped', icon: AlertTriangle },
  }[appointment.status];

  const StatusIcon = statusConfig.icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <Cross className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-slate-800 text-sm">City Care Hospital</h1>
            <p className="text-xs text-slate-500">Queue Tracker</p>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-8 space-y-4">
        {/* Token Card */}
        <div className={`rounded-3xl p-8 text-center ${
          appointment.status === 'consulting' ? 'bg-green-600' :
          appointment.status === 'completed' ? 'bg-slate-600' :
          appointment.status === 'skipped' ? 'bg-amber-500' :
          'bg-blue-600'
        } text-white`}>
          <p className="text-xs uppercase tracking-widest opacity-80 mb-2">Your Token</p>
          <p className="text-7xl font-black tracking-wider">{padToken(appointment.token_number)}</p>
          <div className="flex items-center justify-center gap-2 mt-4 opacity-90">
            <StatusIcon className="w-4 h-4" />
            <span className="text-sm font-medium">{statusConfig.label}</span>
          </div>
        </div>

        {/* Doctor Info */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Doctor</p>
          <p className="font-bold text-slate-800">{doctor.name}</p>
          <p className="text-sm text-slate-500">{doctor.specialty} · {doctor.room}</p>
        </div>

        {/* Queue Status */}
        {appointment.status === 'waiting' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-slate-200 text-center">
              <p className="text-3xl font-black text-blue-600">{patientsAhead}</p>
              <p className="text-xs text-slate-500 mt-1">Patients ahead</p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 text-center">
              <p className="text-3xl font-black text-blue-600">{eta !== null ? `~${eta}` : '--'}</p>
              <p className="text-xs text-slate-500 mt-1">Minutes wait</p>
            </div>
          </div>
        )}

        {appointment.status === 'waiting' && currentToken && (
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">Now being seen</p>
              <p className="font-bold text-slate-700">Token {padToken(currentToken)}</p>
            </div>
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
          </div>
        )}

        {appointment.status === 'consulting' && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Activity className="w-6 h-6 text-green-600 animate-pulse" />
            </div>
            <p className="font-bold text-green-800">Your turn has arrived!</p>
            <p className="text-sm text-green-600 mt-1">Please proceed to {doctor.room}</p>
          </div>
        )}

        {appointment.status === 'completed' && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-center">
            <CheckCircle className="w-10 h-10 text-slate-400 mx-auto mb-3" />
            <p className="font-semibold text-slate-700">Consultation completed</p>
            <p className="text-sm text-slate-500 mt-1">We hope you had a great experience!</p>
            <a href="/" className="mt-3 inline-block text-blue-600 hover:underline text-sm">Book again</a>
          </div>
        )}

        {appointment.status === 'skipped' && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center">
            <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
            <p className="font-semibold text-amber-800">Your token was skipped</p>
            <p className="text-sm text-amber-600 mt-1">Please contact the reception desk</p>
          </div>
        )}

        <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
          <p className="text-xs text-blue-600 text-center">This page updates automatically. No need to refresh.</p>
        </div>

        <p className="text-center text-xs text-slate-400">Visit type: {appointment.visit_category}</p>
      </main>
    </div>
  );
}
