import { api } from './api';
import { Appointment, CategoryAverages, VisitCategory } from './types';

const DEFAULT_DURATIONS: CategoryAverages = {
  'New Consultation': 15,
  'Follow-up': 8,
  'Report Review': 10,
  'Emergency': 20,
};

export async function getCategoryAverages(doctorId: string): Promise<CategoryAverages> {
  try {
    return await api.categoryAverages(doctorId);
  } catch {
    return { ...DEFAULT_DURATIONS };
  }
}

export function calculateETA(
  patientsAhead: Pick<Appointment, 'visit_category' | 'status' | 'consultation_start_at'>[],
  categoryAverages: CategoryAverages,
  pauseDelayMinutes: number
): number {
  const queueTime = patientsAhead.reduce((total, patient) => {
    const predicted = categoryAverages[patient.visit_category] ?? DEFAULT_DURATIONS[patient.visit_category];
    if (patient.status === 'consulting' && patient.consultation_start_at) {
      const elapsedMinutes = Math.max(0, (Date.now() - new Date(patient.consultation_start_at).getTime()) / 60000);
      return total + Math.max(1, predicted - elapsedMinutes);
    }
    return total + predicted;
  }, 0);
  return Math.ceil(queueTime + pauseDelayMinutes);
}

export async function recalculateAllETAs(doctorId: string): Promise<void> {
  const [waiting, queueStateData] = await Promise.all([
    api.appointments({
      doctorId,
      date: new Date().toISOString().split('T')[0],
      status: 'waiting,consulting',
      sort: 'queue_position',
      asc: true,
    }),
    api.queueState(doctorId),
  ]);

  if (!waiting) return;

  const categoryAverages = await getCategoryAverages(doctorId);
  const pauseDelay = Number(queueStateData?.pause_delay_minutes ?? 0);

  const consultingPatient = waiting.find((p: Appointment) => p.status === 'consulting');
  const waitingPatients = waiting.filter((p: Appointment) => p.status === 'waiting');

  const updates: PromiseLike<unknown>[] = [];

  waitingPatients.forEach((patient: Appointment, index: number) => {
    const patientsAhead: Appointment[] = [];
    if (consultingPatient) patientsAhead.push(consultingPatient);
    patientsAhead.push(...waitingPatients.slice(0, index));

    const eta = calculateETA(patientsAhead, categoryAverages, pauseDelay);
    updates.push(
      api.updateAppointment(patient.id, { queue_position: (consultingPatient ? 1 : 0) + index + 1 })
    );
    void eta;
  });

  await Promise.all(updates);
}

export async function recordConsultationEnd(
  doctorId: string,
  visitCategory: VisitCategory,
  startedAt: string
): Promise<void> {
  const durationMinutes = (Date.now() - new Date(startedAt).getTime()) / 60000;

  await api.addConsultationHistory({
    doctor_id: doctorId,
    visit_category: visitCategory,
    duration_minutes: Math.max(0.5, durationMinutes),
  });
}
