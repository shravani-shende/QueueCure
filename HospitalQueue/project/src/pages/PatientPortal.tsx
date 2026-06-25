import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Doctor, VisitCategory } from '../lib/types';
import {
  Cross, User, Phone, Calendar, Clock,
  CheckCircle, AlertTriangle, QrCode, Loader2, Monitor, Stethoscope, Shield,
  CalendarOff, ArrowRight, HeartPulse
} from 'lucide-react';

const VISIT_CATEGORIES: VisitCategory[] = ['New Consultation', 'Follow-up', 'Report Review', 'Emergency'];

type DoctorAvailability = Doctor & {
  onLeave: boolean;
  leaveUntil: string | null;
};

export default function PatientPortal() {
  const [doctors, setDoctors] = useState<DoctorAvailability[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [doctorsError, setDoctorsError] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [form, setForm] = useState({
    name: '', age: '', phone: '', visitCategory: '' as VisitCategory | '',
    appointmentDate: new Date().toISOString().split('T')[0],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [step, setStep] = useState<'select' | 'form' | 'done'>('select');

  useEffect(() => {
    async function loadDoctors() {
      try {
        const today = new Date().toISOString().split('T')[0];
        const [docs, qsAll] = await Promise.all([
          api.doctors(true),
          api.queueStates(),
        ]);
        const leaveByDoctor = new Map(
          (qsAll ?? [])
            .filter(qs =>
              qs.is_on_leave &&
              (qs.leave_from ?? today) <= today &&
              (qs.leave_until ?? today) >= today
            )
            .map(qs => [qs.doctor_id, qs.leave_until] as const)
        );
        setDoctors((docs ?? []).map(doctor => ({
          ...doctor,
          onLeave: leaveByDoctor.has(doctor.id),
          leaveUntil: leaveByDoctor.get(doctor.id) ?? null,
        })));
      } catch {
        setDoctorsError('Doctor list could not be loaded. Please start the API server.');
      } finally {
        setLoadingDoctors(false);
      }
    }
    loadDoctors();
  }, []);

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.age || isNaN(Number(form.age)) || Number(form.age) < 1 || Number(form.age) > 149)
      e.age = 'Enter a valid age (1–149)';
    if (!form.phone.match(/^[6-9]\d{9}$/))
      e.phone = 'Enter a valid 10-digit Indian mobile number';
    if (!form.visitCategory) e.visitCategory = 'Select a visit type';
    if (!form.appointmentDate) e.appointmentDate = 'Select a date';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDoctor || !validate()) return;
    setSubmitting(true);

    try {
      await api.createAppointment({
        doctor_id: selectedDoctor.id,
        patient_name: form.name.trim(),
        patient_age: Number(form.age),
        patient_phone: form.phone.trim(),
        visit_category: form.visitCategory as VisitCategory,
        appointment_date: form.appointmentDate,
        source: 'patient',
      });

      setRequestSent(true);
      setStep('done');
    } catch {
      setErrors({ form: 'An unexpected error occurred. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'done' && requestSent) {
    return <SuccessScreen onNew={() => { setStep('select'); setSelectedDoctor(null); setForm({ name: '', age: '', phone: '', visitCategory: '', appointmentDate: new Date().toISOString().split('T')[0] }); setRequestSent(false); }} />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hospital Header */}
      <header className="bg-white/95 border-b border-slate-200/80 sticky top-0 z-20 backdrop-blur-xl shadow-[0_1px_12px_rgba(15,23,42,0.04)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-[78px] flex items-center justify-between gap-4">
          <a href="/#/" className="group flex items-center gap-3 min-w-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
            <div className="relative w-12 h-12 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 flex-shrink-0 transition-transform group-hover:scale-105">
              <div className="absolute inset-0.5 rounded-[14px] ring-1 ring-white/30" />
              <Cross className="relative w-7 h-7 text-white" />
            </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-800 leading-tight">City Care Hospital</h1>
            <p className="hidden sm:block text-slate-500 text-xs truncate mt-0.5">123 Health Street, Mumbai — 400001 <span className="text-slate-300 mx-1">•</span> Mon–Sat, 8 AM–8 PM</p>
          </div>
          </a>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="hidden lg:flex items-center gap-2 text-xs font-medium text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 ring-4 ring-emerald-50" />
              Open today
            </div>
          <nav aria-label="Staff access" className="flex items-center gap-1 rounded-2xl border border-slate-200/80 bg-slate-100/80 p-1 shadow-inner">
            <a
              href="/#/receptionist"
              title="Receptionist portal"
              className="flex items-center gap-2 text-xs text-slate-500 hover:text-blue-700 hover:bg-white hover:shadow-sm px-2.5 sm:px-3 py-2.5 rounded-xl transition-all font-semibold"
            >
              <Stethoscope className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Receptionist</span>
            </a>
            <a
              href="/#/admin"
              title="Admin portal"
              className="flex items-center gap-2 text-xs text-slate-500 hover:text-blue-700 hover:bg-white hover:shadow-sm px-2.5 sm:px-3 py-2.5 rounded-xl transition-all font-semibold"
            >
              <Shield className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Admin</span>
            </a>
            <a
              href="/#/display"
              title="Waiting room display"
              className="flex items-center gap-2 text-xs text-slate-500 hover:text-blue-700 hover:bg-white hover:shadow-sm px-2.5 sm:px-3 py-2.5 rounded-xl transition-all font-semibold"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Display</span>
            </a>
          </nav>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-500 px-6 py-9 sm:px-10 sm:py-12 text-white shadow-xl shadow-blue-100 mb-9">
          <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10" />
          <div className="absolute right-24 -bottom-20 h-44 w-44 rounded-full bg-cyan-300/20" />
          <div className="relative max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold mb-4 ring-1 ring-white/20">
              <HeartPulse className="w-3.5 h-3.5" /> Simple, faster hospital visits
            </div>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-3">Book your appointment without the wait.</h2>
            <p className="text-blue-50 max-w-xl leading-relaxed">Choose your doctor, request approval, and receive your tracking QR on WhatsApp after reception confirms your visit.</p>
            <div className="flex flex-wrap gap-2.5 mt-6 text-xs font-semibold text-white">
              <span className="flex items-center gap-2 rounded-xl bg-white/20 px-3.5 py-2.5 ring-1 ring-white/35 shadow-sm backdrop-blur-sm">
                <CheckCircle className="w-4 h-4 text-cyan-100" /> Reception approval
              </span>
              <span className="flex items-center gap-2 rounded-xl bg-white/20 px-3.5 py-2.5 ring-1 ring-white/35 shadow-sm backdrop-blur-sm">
                <Clock className="w-4 h-4 text-cyan-100" /> Live wait time
              </span>
              <span className="flex items-center gap-2 rounded-xl bg-white/20 px-3.5 py-2.5 ring-1 ring-white/35 shadow-sm backdrop-blur-sm">
                <QrCode className="w-4 h-4 text-cyan-100" /> Easy tracking
              </span>
            </div>
          </div>
        </div>

        {step === 'select' && (
          <section>
            <div className="flex items-end justify-between gap-4 mb-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-1">Available care</p>
                <h3 className="text-2xl font-bold text-slate-800">Select a doctor</h3>
                <p className="text-sm text-slate-500 mt-1">Leave schedules are shown before you book.</p>
              </div>
              <span className="hidden sm:block text-sm text-slate-400">{doctors.filter(d => !d.onLeave).length} available today</span>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
            {loadingDoctors && (
              <div className="md:col-span-2 py-12 flex items-center justify-center gap-2 text-sm text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin text-blue-500" /> Loading doctors...
              </div>
            )}
            {!loadingDoctors && doctors.map(doctor => (
              <button
                key={doctor.id}
                type="button"
                disabled={doctor.onLeave}
                onClick={() => { if (!doctor.onLeave) { setSelectedDoctor(doctor); setStep('form'); } }}
                className={`group rounded-2xl p-5 border text-left flex items-center gap-4 transition-all ${doctor.onLeave
                  ? 'bg-white/70 border-red-100 cursor-not-allowed'
                  : 'bg-white border-slate-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-100/70'
                }`}
              >
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors ${doctor.onLeave ? 'bg-red-50' : 'bg-blue-50 group-hover:bg-blue-600'}`}>
                  {doctor.onLeave
                    ? <CalendarOff className="w-6 h-6 text-red-500" />
                    : <User className="w-6 h-6 text-blue-600 group-hover:text-white transition-colors" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-slate-800">{doctor.name}</p>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${doctor.onLeave ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'}`}>
                      {doctor.onLeave ? 'On Leave' : 'Available'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">{doctor.specialty} · {doctor.room}</p>
                  {doctor.onLeave && <p className="text-xs text-red-500 mt-1.5">Not accepting appointments today</p>}
                </div>
                {!doctor.onLeave && <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />}
              </button>
            ))}
            {!loadingDoctors && doctorsError && (
              <div className="md:col-span-2 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {doctorsError}
              </div>
            )}
            {!loadingDoctors && !doctorsError && doctors.length === 0 && (
              <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-400">
                No doctors are available right now.
              </div>
            )}
            </div>
          </section>
        )}

        {step === 'form' && selectedDoctor && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8">
            <button
              onClick={() => setStep('select')}
              className="text-blue-600 text-sm mb-6 hover:underline flex items-center gap-1"
            >
              ← Back to doctors
            </button>

            <div className="flex items-center gap-3 mb-8 pb-6 border-b border-slate-100">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <User className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="font-bold text-slate-800">{selectedDoctor.name}</p>
                <p className="text-sm text-slate-500">{selectedDoctor.specialty} · {selectedDoctor.room}</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <FormField label="Patient Name" error={errors.name}>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Full name"
                      className={inputClass(errors.name)}
                      style={{ paddingLeft: '2.5rem' }}
                    />
                  </div>
                </FormField>

                <FormField label="Age" error={errors.age}>
                  <input
                    type="number"
                    value={form.age}
                    onChange={e => setForm(f => ({ ...f, age: e.target.value }))}
                    placeholder="Age in years"
                    min={1} max={149}
                    className={inputClass(errors.age)}
                  />
                </FormField>

                <FormField label="Mobile Number" error={errors.phone}>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                      placeholder="10-digit mobile number"
                      className={inputClass(errors.phone)}
                      style={{ paddingLeft: '2.5rem' }}
                    />
                  </div>
                </FormField>

                <FormField label="Appointment Date" error={errors.appointmentDate}>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="date"
                      value={form.appointmentDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={e => setForm(f => ({ ...f, appointmentDate: e.target.value }))}
                      className={inputClass(errors.appointmentDate)}
                      style={{ paddingLeft: '2.5rem' }}
                    />
                  </div>
                </FormField>
              </div>

              <FormField label="Visit Type" error={errors.visitCategory}>
                <div className="grid grid-cols-2 gap-3">
                  {VISIT_CATEGORIES.map(cat => (
                    <button
                      type="button"
                      key={cat}
                      onClick={() => setForm(f => ({ ...f, visitCategory: cat }))}
                      className={`p-3 rounded-xl border-2 text-sm font-medium transition-all text-left ${
                        form.visitCategory === cat
                          ? cat === 'Emergency'
                            ? 'border-red-500 bg-red-50 text-red-700'
                            : 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {cat === 'Emergency' && <AlertTriangle className="w-4 h-4 inline mr-1 text-red-500" />}
                      {cat}
                    </button>
                  ))}
                </div>
              </FormField>

              {errors.form && (
                <div className="bg-red-50 text-red-700 text-sm rounded-xl p-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {errors.form}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                {submitting ? 'Requesting...' : 'Request Appointment'}
              </button>
            </form>
          </div>
        )}
      </main>

      {/* Staff Footer */}
      <footer className="border-t border-slate-200 bg-white mt-10">
        <div className="max-w-4xl mx-auto px-4 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-400">City Care Hospital Queue Management System</p>
          <div className="flex items-center gap-4">
            <a href="/#/receptionist" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 transition-colors">
              <Stethoscope className="w-3.5 h-3.5" /> Receptionist Login
            </a>
            <span className="text-slate-300">·</span>
            <a href="/#/admin" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors">
              <Shield className="w-3.5 h-3.5" /> Admin Panel
            </a>
            <span className="text-slate-300">·</span>
            <a href="/#/display" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors">
              <Monitor className="w-3.5 h-3.5" /> Waiting Display
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FormField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function inputClass(error?: string) {
  return `w-full px-4 py-3 rounded-xl border ${error ? 'border-red-400 bg-red-50' : 'border-slate-200'} focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 placeholder-slate-400 text-sm`;
}

function SuccessScreen({ onNew }: { onNew: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 flex flex-col items-center justify-center px-4">
      <div className="bg-white rounded-3xl shadow-lg border border-slate-200 p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-9 h-9 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">Request Sent</h2>
          <p className="text-slate-500 text-sm mt-1">Waiting for receptionist approval</p>
        </div>

        <div className="bg-blue-50 rounded-2xl p-5 border border-blue-100 text-center mb-6">
          <p className="text-sm font-semibold text-blue-800">Reception will approve your appointment.</p>
          <p className="text-xs text-blue-600 mt-1">Your tracking QR is sent as a WhatsApp image. Reception approval will place you in the live queue.</p>
        </div>

        <div className="space-y-3">
          <button
            onClick={onNew}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 rounded-xl text-sm transition-colors"
          >
            Book another appointment
          </button>
        </div>
      </div>
    </div>
  );
}
