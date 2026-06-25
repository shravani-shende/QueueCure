import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 4000);
const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.MONGODB_DB ?? 'hospital_queue';
const HOSPITAL_NAME = process.env.HOSPITAL_NAME ?? 'City Care Hospital';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? 'admin@hospital.test').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin@1234';
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION ?? 'v20.0';
const WHATSAPP_TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_NAME;
const WHATSAPP_TEMPLATE_LANGUAGE = process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? 'en';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const DEFAULT_DURATIONS = {
  'New Consultation': 15,
  'Follow-up': 8,
  'Report Review': 10,
  Emergency: 20,
};
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, '../dist');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 1200 });
let db;

class MemoryCursor {
  constructor(rows) {
    this.rows = rows;
  }

  sort(sortSpec) {
    const [[field, direction]] = Object.entries(sortSpec);
    this.rows.sort((a, b) => {
      if ((a[field] ?? '') < (b[field] ?? '')) return -1 * direction;
      if ((a[field] ?? '') > (b[field] ?? '')) return 1 * direction;
      return 0;
    });
    return this;
  }

  limit(n) {
    this.rows = this.rows.slice(0, n);
    return this;
  }

  async toArray() {
    return this.rows.map(row => ({ ...row }));
  }
}

class MemoryCollection {
  constructor(rows) {
    this.rows = rows;
  }

  matches(row, query = {}) {
    return Object.entries(query).every(([key, expected]) => {
      const actual = row[key];
      if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
        if ('$in' in expected) return expected.$in.includes(actual);
        if ('$ne' in expected) return actual !== expected.$ne;
        if ('$gt' in expected) return actual > expected.$gt;
      }
      return actual === expected;
    });
  }

  async countDocuments(query = {}) {
    return this.rows.filter(row => this.matches(row, query)).length;
  }

  find(query = {}) {
    return new MemoryCursor(this.rows.filter(row => this.matches(row, query)));
  }

  async findOne(query = {}) {
    return this.rows.find(row => this.matches(row, query)) ?? null;
  }

  async insertOne(doc) {
    this.rows.push({ ...doc });
    return { insertedId: doc.id };
  }

  async insertMany(docs) {
    this.rows.push(...docs.map(doc => ({ ...doc })));
    return { insertedCount: docs.length };
  }

  async updateOne(query, update, options = {}) {
    const row = this.rows.find(item => this.matches(item, query));
    if (row) {
      Object.assign(row, update.$set ?? update);
      return { modifiedCount: 1 };
    }
    if (options.upsert) {
      const doc = { ...query, ...(update.$set ?? update) };
      this.rows.push(doc);
      return { upsertedCount: 1 };
    }
    return { modifiedCount: 0 };
  }

  async updateMany(query, update) {
    let modifiedCount = 0;
    this.rows.forEach(row => {
      if (!this.matches(row, query)) return;
      if (update.$inc) {
        Object.entries(update.$inc).forEach(([field, amount]) => {
          row[field] = Number(row[field] ?? 0) + Number(amount);
        });
      }
      if (update.$set) Object.assign(row, update.$set);
      modifiedCount += 1;
    });
    return { modifiedCount };
  }

  async deleteOne(query) {
    const index = this.rows.findIndex(row => this.matches(row, query));
    if (index >= 0) this.rows.splice(index, 1);
    return { deletedCount: index >= 0 ? 1 : 0 };
  }
}

class MemoryDb {
  constructor() {
    this.collections = new Map();
  }

  collection(name) {
    if (!this.collections.has(name)) this.collections.set(name, []);
    return new MemoryCollection(this.collections.get(name));
  }
}

function id() {
  return crypto.randomUUID();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 120000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
  return `pbkdf2$${iterations}$${salt}$${hash}`;
}

function verifyPassword(password, storedHash = '') {
  const [scheme, iterationsText, salt, expectedHex] = storedHash.split('$');
  if (scheme !== 'pbkdf2' || !iterationsText || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = crypto.pbkdf2Sync(password, salt, Number(iterationsText), expected.length, 'sha256');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function publicProfile(profile) {
  if (!profile) return null;
  const { password_hash, ...safe } = profile;
  return safe;
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function cleanPhone(phone) {
  return String(phone ?? '').replace(/\D/g, '').slice(-10);
}

function padToken(n) {
  return String(n).padStart(3, '0');
}

function appOrigin(req) {
  if (PUBLIC_APP_URL) return PUBLIC_APP_URL.replace(/\/$/, '');
  const origin = req.headers.origin;
  if (origin) return origin.replace(/\/$/, '');
  const protocol = req.headers['x-forwarded-proto'] ?? req.protocol ?? 'http';
  return `${protocol}://${req.headers.host}`;
}

function trackingUrl(req, appt) {
  const origin = appOrigin(req);
  return `${origin}/#/track/${appt.doctor_id}/${appt.token_number}/${appt.appointment_date}`;
}

function qrCodeUrl(req, appt) {
  const link = trackingUrl(req, appt);
  return `https://quickchart.io/qr?size=320&margin=2&text=${encodeURIComponent(link)}`;
}

function whatsappUrl(req, appt, doctor) {
  const link = trackingUrl(req, appt);
  const qr = qrCodeUrl(req, appt);
  const message = encodeURIComponent(
    `${HOSPITAL_NAME} appointment.\n\nDoctor: ${doctor?.name ?? 'Doctor'}\nToken: ${padToken(appt.token_number)}\n\nOpen your tracking QR code: ${qr}\n\nDirect ETA tracking link: ${link}`
  );
  return `https://wa.me/91${cleanPhone(appt.patient_phone)}?text=${message}`;
}

async function sendWhatsAppQr(req, appt, doctor) {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    return { sent: false, reason: 'WhatsApp Cloud API is not configured' };
  }

  const phone = cleanPhone(appt.patient_phone);
  if (!phone) return { sent: false, reason: 'Patient phone number is invalid' };

  const caption = [
    `${HOSPITAL_NAME} appointment approved`,
    `Doctor: ${doctor?.name ?? 'Doctor'}`,
    `Token: ${padToken(appt.token_number)}`,
  ].join('\n');

  const message = WHATSAPP_TEMPLATE_NAME
    ? {
        messaging_product: 'whatsapp',
        to: `91${phone}`,
        type: 'template',
        template: {
          name: WHATSAPP_TEMPLATE_NAME,
          language: { code: WHATSAPP_TEMPLATE_LANGUAGE },
          components: [
            {
              type: 'header',
              parameters: [{ type: 'image', image: { link: qrCodeUrl(req, appt) } }],
            },
            {
              type: 'body',
              parameters: [
                { type: 'text', text: doctor?.name ?? 'Doctor' },
                { type: 'text', text: padToken(appt.token_number) },
              ],
            },
          ],
        },
      }
    : {
        messaging_product: 'whatsapp',
        to: `91${phone}`,
        type: 'image',
        image: {
          link: qrCodeUrl(req, appt),
          caption,
        },
      };

  const response = await fetch(
    `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    }
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { sent: false, reason: body?.error?.message ?? 'WhatsApp send failed' };
  }
  return { sent: true, messageId: body?.messages?.[0]?.id ?? null };
}

async function buildAppointmentNotification(req, appt, doctor) {
  const whatsapp = await sendWhatsAppQr(req, appt, doctor);
  return {
    whatsappSent: whatsapp.sent,
    whatsappError: whatsapp.sent ? null : whatsapp.reason,
    whatsappUrl: whatsappUrl(req, appt, doctor),
    trackingUrl: trackingUrl(req, appt),
    qrCodeUrl: qrCodeUrl(req, appt),
  };
}

async function categoryAverages(doctorId) {
  const out = { ...DEFAULT_DURATIONS };
  for (const category of Object.keys(DEFAULT_DURATIONS)) {
    const history = await db.collection('consultation_history')
      .find({ doctor_id: doctorId, visit_category: category })
      .sort({ completed_at: -1 })
      .limit(5)
      .toArray();
    const historyTotal = history.reduce((sum, item) => sum + Number(item.duration_minutes), 0);
    const defaultSlots = Math.max(0, 5 - history.length);
    out[category] = (historyTotal + (defaultSlots * DEFAULT_DURATIONS[category])) / 5;
  }
  return out;
}

async function recordCompletedConsultation(appt, endedAt) {
  if (!appt?.consultation_start_at || appt.consultation_recorded_at) return;
  const durationMinutes = Math.max(
    0.01,
    (new Date(endedAt).getTime() - new Date(appt.consultation_start_at).getTime()) / 60000
  );
  const record = {
    id: id(),
    appointment_id: appt.id,
    doctor_id: appt.doctor_id,
    visit_category: appt.visit_category,
    duration_minutes: durationMinutes,
    completed_at: endedAt,
  };
  await db.collection('consultation_history').insertOne(record);
  const history = await db.collection('consultation_history')
    .find({ doctor_id: appt.doctor_id, visit_category: appt.visit_category })
    .sort({ completed_at: -1 })
    .toArray();
  for (const oldRecord of history.slice(5)) {
    await db.collection('consultation_history').deleteOne({ id: oldRecord.id });
  }
}

async function sendReadySms(appt, doctor) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    return { sent: false, reason: 'Twilio SMS is not configured' };
  }
  const phone = cleanPhone(appt.patient_phone);
  if (!phone) return { sent: false, reason: 'Patient phone number is invalid' };
  const body = new URLSearchParams({
    To: `+91${phone}`,
    From: TWILIO_PHONE_NUMBER,
    Body: `${HOSPITAL_NAME}: Token ${padToken(appt.token_number)}, please get ready. Your turn is in about 1 minute with ${doctor?.name ?? 'the doctor'}.`,
  });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const result = await response.json().catch(() => ({}));
  return response.ok
    ? { sent: true, messageId: result.sid ?? null }
    : { sent: false, reason: result.message ?? 'SMS send failed' };
}

async function recalculateEtas(doctorId, date = todayStr(), sendNotifications = true) {
  const [active, state, averages, doctor] = await Promise.all([
    db.collection('appointments').find({
      doctor_id: doctorId,
      appointment_date: date,
      status: { $in: ['waiting', 'consulting'] },
    }).sort({ queue_position: 1 }).toArray(),
    db.collection('queue_state').findOne({ doctor_id: doctorId }),
    categoryAverages(doctorId),
    db.collection('doctors').findOne({ id: doctorId }),
  ]);
  const consulting = active.find(item => item.status === 'consulting');
  const waiting = active.filter(item => item.status === 'waiting');
  const delay = Number(state?.pause_delay_minutes ?? 0);
  let minutesAhead = delay;
  if (consulting) {
    const predicted = Number(averages[consulting.visit_category] ?? DEFAULT_DURATIONS[consulting.visit_category]);
    const elapsed = consulting.consultation_start_at
      ? Math.max(0, (Date.now() - new Date(consulting.consultation_start_at).getTime()) / 60000)
      : 0;
    minutesAhead += Math.max(1, predicted - elapsed);
    await db.collection('appointments').updateOne({ id: consulting.id }, { $set: { eta_minutes: 0 } });
  }
  const etas = {};
  for (let index = 0; index < waiting.length; index += 1) {
    const appt = waiting[index];
    const eta = Math.max(0, Math.ceil(minutesAhead));
    etas[appt.id] = eta;
    const update = { eta_minutes: eta, queue_position: (consulting ? 1 : 0) + index + 1 };
    if (sendNotifications && eta <= 1 && !appt.ready_sms_sent_at) {
      const sms = await sendReadySms(appt, doctor);
      if (sms.sent) update.ready_sms_sent_at = new Date().toISOString();
    }
    await db.collection('appointments').updateOne({ id: appt.id }, { $set: update });
    minutesAhead += Number(averages[appt.visit_category] ?? DEFAULT_DURATIONS[appt.visit_category]);
  }
  return { etas, averages };
}

async function seed() {
  const doctors = db.collection('doctors');
  const queueState = db.collection('queue_state');
  const profiles = db.collection('profiles');

  if (await doctors.countDocuments()) {
    const admin = await profiles.findOne({ role: 'admin' });
    await profiles.updateOne(
      { email: ADMIN_EMAIL },
      { $set: {
        id: admin?.id ?? 'demo-admin',
        name: admin?.name ?? 'Demo Admin',
        email: ADMIN_EMAIL,
        role: 'admin',
        is_active: true,
        password_hash: hashPassword(ADMIN_PASSWORD),
        created_at: admin?.created_at ?? new Date().toISOString(),
      } },
      { upsert: true }
    );
    return;
  }

  const seededDoctors = [
    ['Dr. Ananya Sharma', 'General Physician', 'Room 101'],
    ['Dr. Rajesh Verma', 'Cardiologist', 'Room 102'],
    ['Dr. Priya Mehta', 'Pediatrician', 'Room 103'],
    ['Dr. Suresh Kumar', 'Orthopedist', 'Room 104'],
    ['Dr. Kavitha Nair', 'Dermatologist', 'Room 105'],
    ['Dr. Amit Patel', 'ENT Specialist', 'Room 106'],
  ].map(([name, specialty, room]) => ({
    id: id(),
    name,
    specialty,
    room,
    is_active: true,
    created_at: new Date().toISOString(),
  }));

  await doctors.insertMany(seededDoctors);
  await queueState.insertMany(seededDoctors.map(doctor => ({
    doctor_id: doctor.id,
    is_paused: false,
    pause_delay_minutes: 0,
    break_started_at: null,
    is_on_leave: false,
    leave_from: null,
    leave_until: null,
    leave_note: '',
    updated_at: new Date().toISOString(),
  })));
  await profiles.insertOne({
    id: 'demo-admin',
    name: 'Demo Admin',
    email: ADMIN_EMAIL,
    role: 'admin',
    is_active: true,
    password_hash: hashPassword(ADMIN_PASSWORD),
    created_at: new Date().toISOString(),
  });
}

function buildSort(field = 'created_at', ascending = 'true') {
  return { [field]: ascending === 'true' ? 1 : -1 };
}

app.get('/api/health', (_req, res) => res.json({ ok: true, database: 'mongodb' }));

async function requireAuth(req, res, next) {
  try {
    const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const session = await db.collection('sessions').findOne({ token });
    if (!session) return res.status(401).json({ error: 'Invalid session' });
    const profile = await db.collection('profiles').findOne({ id: session.user_id, is_active: true });
    if (!profile) return res.status(401).json({ error: 'Account is inactive' });
    req.profile = profile;
    next();
  } catch (err) { next(err); }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.profile?.role !== role) return res.status(403).json({ error: 'Permission denied' });
    next();
  };
}

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const password = String(req.body.password ?? '');
    const profile = await db.collection('profiles').findOne({ email, is_active: true });
    if (!profile || !verifyPassword(password, profile.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    await db.collection('sessions').insertOne({
      token,
      user_id: profile.id,
      created_at: new Date().toISOString(),
    });
    res.json({ token, user: { id: profile.id, email: profile.email }, profile: publicProfile(profile) });
  } catch (err) { next(err); }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  res.json({ user: { id: req.profile.id, email: req.profile.email }, profile: publicProfile(req.profile) });
});

app.post('/api/auth/logout', requireAuth, async (req, res, next) => {
  try {
    const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    await db.collection('sessions').deleteOne({ token });
    res.status(204).end();
  } catch (err) { next(err); }
});

app.get('/api/profiles', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const query = {};
    if (req.query.role) query.role = String(req.query.role);
    const profiles = await db.collection('profiles').find(query).sort({ name: 1 }).toArray();
    res.json(profiles.map(publicProfile));
  } catch (err) { next(err); }
});

app.post('/api/profiles/receptionists', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const name = String(req.body.name ?? '').trim();
    const password = String(req.body.password ?? '');
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
    if (await db.collection('profiles').findOne({ email })) return res.status(409).json({ error: 'Email already exists' });
    const profile = {
      id: id(),
      name,
      email,
      role: 'receptionist',
      is_active: true,
      password_hash: hashPassword(password),
      created_at: new Date().toISOString(),
    };
    await db.collection('profiles').insertOne(profile);
    res.status(201).json(publicProfile(profile));
  } catch (err) { next(err); }
});

app.patch('/api/profiles/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const update = {};
    if (typeof req.body.is_active === 'boolean') update.is_active = req.body.is_active;
    if (req.body.name) update.name = String(req.body.name).trim();
    await db.collection('profiles').updateOne({ id: req.params.id }, { $set: update });
    res.json(publicProfile(await db.collection('profiles').findOne({ id: req.params.id })));
  } catch (err) { next(err); }
});

app.post('/api/profiles/:id/reset-password', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const password = String(req.body.password ?? '');
    if (!password) return res.status(400).json({ error: 'Password is required' });
    await db.collection('profiles').updateOne({ id: req.params.id }, { $set: { password_hash: hashPassword(password) } });
    res.status(204).end();
  } catch (err) { next(err); }
});

app.get('/api/doctors', async (req, res, next) => {
  try {
    const query = req.query.active === 'true' ? { is_active: true } : {};
    const doctors = await db.collection('doctors').find(query).sort({ name: 1 }).toArray();
    res.json(doctors);
  } catch (err) { next(err); }
});

app.post('/api/doctors', async (req, res, next) => {
  try {
    const doctor = {
      id: id(),
      name: req.body.name,
      specialty: req.body.specialty,
      room: req.body.room,
      is_active: true,
      created_at: new Date().toISOString(),
    };
    await db.collection('doctors').insertOne(doctor);
    await db.collection('queue_state').insertOne({
      doctor_id: doctor.id,
      is_paused: false,
      pause_delay_minutes: 0,
      break_started_at: null,
      is_on_leave: false,
      leave_from: null,
      leave_until: null,
      leave_note: '',
      updated_at: new Date().toISOString(),
    });
    res.status(201).json(doctor);
  } catch (err) { next(err); }
});

app.patch('/api/doctors/:id', async (req, res, next) => {
  try {
    await db.collection('doctors').updateOne({ id: req.params.id }, { $set: req.body });
    res.json(await db.collection('doctors').findOne({ id: req.params.id }));
  } catch (err) { next(err); }
});

app.get('/api/queue-state', async (_req, res, next) => {
  try {
    res.json(await db.collection('queue_state').find().toArray());
  } catch (err) { next(err); }
});

app.get('/api/queue-state/:doctorId', async (req, res, next) => {
  try {
    res.json(await db.collection('queue_state').findOne({ doctor_id: req.params.doctorId }));
  } catch (err) { next(err); }
});

app.patch('/api/queue-state/:doctorId', async (req, res, next) => {
  try {
    const update = { ...req.body, updated_at: new Date().toISOString() };
    await db.collection('queue_state').updateOne(
      { doctor_id: req.params.doctorId },
      { $set: update },
      { upsert: true }
    );
    await recalculateEtas(req.params.doctorId, todayStr());
    res.json(await db.collection('queue_state').findOne({ doctor_id: req.params.doctorId }));
  } catch (err) { next(err); }
});

app.get('/api/tracking/:doctorId/:tokenNumber/:date', async (req, res, next) => {
  try {
    const appointment = await db.collection('appointments').findOne({
      doctor_id: req.params.doctorId,
      token_number: Number(req.params.tokenNumber),
      appointment_date: req.params.date,
    });
    if (!appointment) return res.status(404).json({ error: 'Tracking link not found' });
    if (appointment.status === 'completed') {
      return res.json({ expired: true, appointment: null });
    }
    res.json({ expired: false, appointment });
  } catch (err) { next(err); }
});

app.get('/api/appointments', async (req, res, next) => {
  try {
    const query = {};
    if (req.query.doctorId) query.doctor_id = req.query.doctorId;
    if (req.query.date) query.appointment_date = req.query.date;
    if (req.query.status) query.status = { $in: String(req.query.status).split(',') };
    if (req.query.tokenNumber) query.token_number = Number(req.query.tokenNumber);
    const sortField = String(req.query.sort ?? 'queue_position');
    const appointments = await db.collection('appointments')
      .find(query)
      .sort(buildSort(sortField, String(req.query.asc ?? 'true')))
      .toArray();
    res.json(appointments);
  } catch (err) { next(err); }
});

app.post('/api/appointments', async (req, res, next) => {
  try {
    const appointmentDate = req.body.appointment_date ?? todayStr();
    const source = req.body.source ?? 'patient';
    const approved = source === 'receptionist';
    let queuePosition = approved ? await nextQueuePosition(req.body.doctor_id, appointmentDate) : 0;
    if (approved && req.body.visit_category === 'Emergency') {
      queuePosition = 1;
      await db.collection('appointments').updateMany(
        { doctor_id: req.body.doctor_id, appointment_date: appointmentDate, status: 'waiting' },
        { $inc: { queue_position: 1 } }
      );
    }
    const appointment = {
      id: id(),
      doctor_id: req.body.doctor_id,
      token_number: await nextToken(req.body.doctor_id, appointmentDate),
      patient_name: String(req.body.patient_name ?? '').trim(),
      patient_age: Number(req.body.patient_age),
      patient_phone: cleanPhone(req.body.patient_phone),
      visit_category: req.body.visit_category,
      status: approved ? 'waiting' : 'pending',
      queue_position: queuePosition,
      consultation_start_at: null,
      consultation_end_at: null,
      consultation_recorded_at: null,
      eta_minutes: null,
      ready_sms_sent_at: null,
      appointment_date: appointmentDate,
      created_at: new Date().toISOString(),
      source,
    };
    await db.collection('appointments').insertOne(appointment);
    await recalculateEtas(appointment.doctor_id, appointmentDate);
    const doctor = await db.collection('doctors').findOne({ id: appointment.doctor_id });
    const notification = await buildAppointmentNotification(req, appointment, doctor);
    if (notification.whatsappSent) {
      appointment.qr_sent_at = new Date().toISOString();
      await db.collection('appointments').updateOne({ id: appointment.id }, { $set: { qr_sent_at: appointment.qr_sent_at } });
    }
    res.status(201).json({ ...appointment, notification });
  } catch (err) { next(err); }
});

app.patch('/api/appointments/:id', async (req, res, next) => {
  try {
    const existing = await db.collection('appointments').findOne({ id: req.params.id });
    if (!existing) return res.status(404).json({ error: 'Appointment not found' });
    const update = { ...req.body };
    if (update.status === 'completed' && existing.status !== 'completed') {
      const endedAt = update.consultation_end_at ?? new Date().toISOString();
      update.consultation_end_at = endedAt;
      await recordCompletedConsultation(existing, endedAt);
      update.consultation_recorded_at = endedAt;
    }
    await db.collection('appointments').updateOne({ id: req.params.id }, { $set: update });
    const saved = await db.collection('appointments').findOne({ id: req.params.id });
    await recalculateEtas(saved.doctor_id, saved.appointment_date);
    res.json(saved);
  } catch (err) { next(err); }
});

app.delete('/api/appointments/:id', async (req, res, next) => {
  try {
    const existing = await db.collection('appointments').findOne({ id: req.params.id });
    await db.collection('appointments').deleteOne({ id: req.params.id });
    if (existing) await recalculateEtas(existing.doctor_id, existing.appointment_date);
    res.status(204).end();
  } catch (err) { next(err); }
});

app.post('/api/appointments/:id/approve', async (req, res, next) => {
  try {
    const appt = await db.collection('appointments').findOne({ id: req.params.id });
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    if (appt.status !== 'pending') return res.status(400).json({ error: 'Appointment is not pending' });

    const tokenNumber = appt.token_number > 0 ? appt.token_number : await nextToken(appt.doctor_id, appt.appointment_date);
    let queuePosition = await nextQueuePosition(appt.doctor_id, appt.appointment_date);

    if (appt.visit_category === 'Emergency') {
      queuePosition = 1;
      await db.collection('appointments').updateMany(
        { doctor_id: appt.doctor_id, appointment_date: appt.appointment_date, status: 'waiting' },
        { $inc: { queue_position: 1 } }
      );
    }

    const approved = {
      ...appt,
      token_number: tokenNumber,
      status: 'waiting',
      queue_position: queuePosition,
    };
    await db.collection('appointments').updateOne({ id: appt.id }, { $set: approved });
    await recalculateEtas(appt.doctor_id, appt.appointment_date);
    const doctor = await db.collection('doctors').findOne({ id: appt.doctor_id });
    const notification = appt.qr_sent_at
      ? {
          whatsappSent: true,
          whatsappError: null,
          whatsappUrl: whatsappUrl(req, approved, doctor),
          trackingUrl: trackingUrl(req, approved),
          qrCodeUrl: qrCodeUrl(req, approved),
        }
      : await buildAppointmentNotification(req, approved, doctor);
    res.json({
      appointment: approved,
      ...notification,
    });
  } catch (err) { next(err); }
});

app.get('/api/category-averages/:doctorId', async (req, res, next) => {
  try {
    res.json(await categoryAverages(req.params.doctorId));
  } catch (err) { next(err); }
});

app.get('/api/etas/:doctorId', async (req, res, next) => {
  try {
    res.json(await recalculateEtas(req.params.doctorId, String(req.query.date ?? todayStr())));
  } catch (err) { next(err); }
});

app.post('/api/consultation-history', async (req, res, next) => {
  try {
    const record = {
      id: id(),
      doctor_id: req.body.doctor_id,
      visit_category: req.body.visit_category,
      duration_minutes: Number(req.body.duration_minutes),
      completed_at: new Date().toISOString(),
    };
    await db.collection('consultation_history').insertOne(record);
    const history = await db.collection('consultation_history')
      .find({ doctor_id: record.doctor_id, visit_category: record.visit_category })
      .sort({ completed_at: -1 })
      .toArray();
    for (const oldRecord of history.slice(5)) {
      await db.collection('consultation_history').deleteOne({ id: oldRecord.id });
    }
    await recalculateEtas(record.doctor_id, todayStr());
    res.status(201).json(record);
  } catch (err) { next(err); }
});

async function nextToken(doctorId, date) {
  const last = await db.collection('appointments')
    .find({ doctor_id: doctorId, appointment_date: date, token_number: { $gt: 0 } })
    .sort({ token_number: -1 })
    .limit(1)
    .toArray();
  return last[0]?.token_number ? last[0].token_number + 1 : 1;
}

async function nextQueuePosition(doctorId, date) {
  const last = await db.collection('appointments')
    .find({ doctor_id: doctorId, appointment_date: date, status: { $in: ['waiting', 'consulting'] } })
    .sort({ queue_position: -1 })
    .limit(1)
    .toArray();
  return last[0]?.queue_position ? last[0].queue_position + 1 : 1;
}

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message ?? 'Server error' });
});

async function start() {
  let mode = 'MongoDB';
  try {
    await client.connect();
    db = client.db(DB_NAME);
  } catch (err) {
    mode = 'in-memory fallback';
    db = new MemoryDb();
    console.warn('MongoDB is not reachable. Using in-memory demo storage.');
    console.warn('Set MONGODB_URI in .env to use a real MongoDB database.');
    console.warn(err.message);
  }

  await seed();
  const refreshAllEtas = async () => {
    try {
      const doctors = await db.collection('doctors').find({ is_active: true }).toArray();
      await Promise.all(doctors.map(doctor => recalculateEtas(doctor.id, todayStr())));
    } catch (err) {
      console.error('ETA refresh failed:', err.message);
    }
  };
  await refreshAllEtas();
  setInterval(refreshAllEtas, 15000).unref();
  app.listen(PORT, () => console.log(`${mode} API listening on http://localhost:${PORT}`));
}

start();
