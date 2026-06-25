import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Appointment, Doctor } from '../lib/types';
import { getCategoryAverages, calculateETA } from '../lib/eta';
import { Cross, Clock, Activity, Wifi } from 'lucide-react';

function padToken(n: number) {
  return String(n).padStart(3, '0');
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

const LIVE_REFRESH_MS = 3000;

export default function WaitingDisplay() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [queueData, setQueueData] = useState<Record<string, { consulting: Appointment | null; waiting: Appointment[] }>>({});
  const [etaMap, setEtaMap] = useState<Record<string, number[]>>({});
  const [currentTime, setCurrentTime] = useState(new Date());
  const [connected, setConnected] = useState(true);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function loadQueue() {
    const today = new Date().toISOString().split('T')[0];
    const docs = await api.doctors(true);
    if (!docs) return;
    setDoctors(docs);

    const newQueueData: Record<string, { consulting: Appointment | null; waiting: Appointment[] }> = {};
    const newEtaMap: Record<string, number[]> = {};

    for (const doc of docs) {
      const queue = await api.appointments({ doctorId: doc.id, date: today, status: 'waiting,consulting', sort: 'queue_position', asc: true });

      const consulting = queue?.find((p: Appointment) => p.status === 'consulting') ?? null;
      const waiting = queue?.filter((p: Appointment) => p.status === 'waiting') ?? [];

      newQueueData[doc.id] = { consulting, waiting };

      const averages = await getCategoryAverages(doc.id);
      const qs = await api.queueState(doc.id);
      const pauseDelay = Number(qs?.pause_delay_minutes ?? 0);

      const etas: number[] = [];
      waiting.forEach((_patient: Appointment, i: number) => {
        const ahead: Appointment[] = [];
        if (consulting) ahead.push(consulting);
        ahead.push(...waiting.slice(0, i));
        etas.push(calculateETA(ahead, averages, pauseDelay));
      });
      newEtaMap[doc.id] = etas;
    }

    setQueueData(newQueueData);
    setEtaMap(newEtaMap);
  }

  useEffect(() => {
    loadQueue();

    setConnected(true);
    const poll = setInterval(loadQueue, LIVE_REFRESH_MS);
    return () => {
      clearInterval(poll);
    };
  }, []);

  const displayDoctors = selectedDoctorId
    ? doctors.filter(d => d.id === selectedDoctorId)
    : doctors;

  const activeDoctors = displayDoctors.filter(d => {
    const q = queueData[d.id];
    return q && (q.consulting || q.waiting.length > 0);
  });

  const idleDoctors = displayDoctors.filter(d => {
    const q = queueData[d.id];
    return !q || (!q.consulting && q.waiting.length === 0);
  });

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center">
              <Cross className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">City Care Hospital</h1>
              <p className="text-slate-400 text-sm">Live Queue Display</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className={`flex items-center gap-2 text-sm ${connected ? 'text-green-400' : 'text-red-400'}`}>
              <Wifi className="w-4 h-4" />
              <span>{connected ? 'Live' : 'Reconnecting...'}</span>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-white font-mono">{formatTime(currentTime)}</p>
              <p className="text-slate-400 text-xs">{currentTime.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            </div>
          </div>
        </div>

        {/* Doctor filter */}
        <div className="flex gap-2 mt-4 flex-wrap">
          <button
            onClick={() => setSelectedDoctorId(null)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${!selectedDoctorId ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          >
            All Doctors
          </button>
          {doctors.map(d => (
            <button
              key={d.id}
              onClick={() => setSelectedDoctorId(d.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${selectedDoctorId === d.id ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
            >
              {d.name}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 p-6 overflow-auto">
        {activeDoctors.length === 0 && idleDoctors.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <Activity className="w-16 h-16 mb-4" />
            <p className="text-xl">No active queues</p>
            <p className="text-sm mt-1">Queues will appear here when patients are registered</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {activeDoctors.map(doctor => {
            const q = queueData[doctor.id];
            const etas = etaMap[doctor.id] ?? [];

            return (
              <div key={doctor.id} className="bg-slate-800 rounded-3xl overflow-hidden border border-slate-700">
                {/* Doctor header */}
                <div className="bg-blue-600 px-5 py-4">
                  <p className="font-bold text-white text-lg">{doctor.name}</p>
                  <p className="text-blue-200 text-sm">{doctor.specialty} · {doctor.room}</p>
                </div>

                {/* Currently consulting */}
                <div className="px-5 py-4 border-b border-slate-700">
                  <p className="text-xs text-slate-400 uppercase tracking-wide mb-3">Now Consulting</p>
                  {q.consulting ? (
                    <div className="flex items-center gap-4">
                      <div className="bg-green-500 rounded-2xl px-6 py-4 flex-shrink-0">
                        <p className="text-3xl font-black text-white tracking-wider">{padToken(q.consulting.token_number)}</p>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                          <span className="text-green-400 text-sm font-medium">In Progress</span>
                        </div>
                        <p className="text-slate-400 text-xs mt-1">{q.consulting.visit_category}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-500 text-sm">— No active consultation —</p>
                  )}
                </div>

                {/* Queue */}
                <div className="px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-slate-400 uppercase tracking-wide">Queue</p>
                    <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
                      {q.waiting.length} waiting
                    </span>
                  </div>

                  {q.waiting.length === 0 ? (
                    <p className="text-slate-500 text-sm">Queue is empty</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-auto">
                      {/* Next up - highlighted */}
                      {q.waiting[0] && (
                        <div className="flex items-center justify-between bg-amber-900/30 border border-amber-700/50 rounded-xl px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="font-black text-amber-400 text-xl">{padToken(q.waiting[0].token_number)}</span>
                            <div>
                              <span className="text-xs text-amber-400 font-medium">NEXT UP</span>
                              <p className="text-xs text-slate-400">{q.waiting[0].visit_category}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center gap-1 text-amber-400">
                              <Clock className="w-3 h-3" />
                              <span className="text-sm font-semibold">~{etas[0] ?? '--'} min</span>
                            </div>
                            <p className="text-xs text-slate-500">
                              {etas[0] !== undefined ? formatTime(new Date(Date.now() + etas[0] * 60000)) : '--'}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Rest of queue */}
                      {q.waiting.slice(1).map((patient, i) => (
                        <div key={patient.id} className="flex items-center justify-between px-4 py-2.5 rounded-xl">
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-slate-300 text-lg">{padToken(patient.token_number)}</span>
                            <span className="text-xs text-slate-500">{patient.visit_category}</span>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center gap-1 text-slate-400">
                              <Clock className="w-3 h-3" />
                              <span className="text-sm">~{etas[i + 1] ?? '--'} min</span>
                            </div>
                            <p className="text-xs text-slate-600">
                              {etas[i + 1] !== undefined ? formatTime(new Date(Date.now() + etas[i + 1] * 60000)) : '--'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {idleDoctors.map(doctor => (
            <div key={doctor.id} className="bg-slate-800/50 rounded-3xl overflow-hidden border border-slate-700/50">
              <div className="bg-slate-700/50 px-5 py-4">
                <p className="font-bold text-slate-400 text-lg">{doctor.name}</p>
                <p className="text-slate-500 text-sm">{doctor.specialty} · {doctor.room}</p>
              </div>
              <div className="px-5 py-6 text-center">
                <p className="text-slate-600 text-sm">No patients in queue</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      <footer className="bg-slate-800 border-t border-slate-700 px-8 py-3 text-center">
        <p className="text-slate-500 text-xs">Token numbers only are displayed. Patient names are kept private. · <a href="/" className="hover:text-slate-300 transition-colors">Patient Portal</a></p>
      </footer>
    </div>
  );
}
