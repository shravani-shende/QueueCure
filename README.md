
```md
# 🏥 City Care Hospital — Smart Queue Management System

A full-stack hospital/clinic queue management system that helps patients book appointments, track their live queue position, and see an estimated waiting time without standing in long physical queues.

This project is useful for hospitals, small clinics, reception desks, and patient waiting areas where queue management is still done using paper tokens, shouting names, or manual memory.

---

## 🚀 Project Links

- Deployment Link - https://queuecure-mil1.onrender.com


---

## 🔐 Admin Login

Use these credentials to access the admin panel:

```txt
Email: admin@hospital.test
Password: Admin@2024
```

---

## ❗ Problem Statement

Many clinics still manage patients using paper token slips, manual registers, and verbal announcements.

This creates problems like:

- Patients waiting for 2–3 hours without knowing their turn
- Receptionists manually remembering queue order
- Doctors having no clear dashboard
- Patients repeatedly asking, “How much time is left?”
- No live ETA or digital tracking

Our solution fixes this by creating a live digital queue system visible to both receptionists and patients.

---

## 💡 Our Solution

City Care Hospital Queue Management System allows:

- Patients to book appointments online
- Receptionists to add walk-in patients offline
- Admins to manage staff and doctors
- Patients to track their live token status using QR code
- Waiting rooms to show current token and queue status
- ETA to be calculated using real consultation data

---

## ⭐ Key Features

### 👨‍⚕️ Admin Panel

Admin can:

- Login securely
- Manage receptionist accounts
- Add, activate, or deactivate receptionists
- Reset receptionist passwords
- Manage hospital queue operations

---

### 🧾 Receptionist Dashboard

Receptionist can:

- Add offline/walk-in patients
- Approve online appointments
- Assign token numbers
- Call the next patient
- Start and complete consultations
- Manage doctor queue status
- Handle emergency patients

This makes it possible to add a patient and assign a token quickly.

---

### 📱 Patient Appointment Booking

Patients can book appointments online by selecting:

- Doctor
- Visit category
- Name
- Age
- Phone number

After approval, they receive a tracking link/QR code to monitor their queue status.

---

### 🔳 QR-Based Live Tracking

Each approved appointment generates a QR tracking link.

Patients can scan the QR code and see:

- Their token number
- Doctor details
- Current status
- Estimated waiting time
- Queue progress

This reduces crowding near the reception counter.

---

## ⏱️ ETA — Main Feature

ETA means Estimated Time of Arrival / Estimated Waiting Time.

In this project, ETA is not just a hardcoded guess. It is calculated based on queue data and consultation duration.

The system considers:

- Current patient being consulted
- Number of patients waiting ahead
- Visit category
- Average consultation time
- Doctor’s queue status
- Emergency cases
- Completed consultation history

Example:

If one patient is currently consulting and three patients are ahead, the system calculates how much time is likely remaining based on previous consultation durations.

So instead of telling every patient “please wait”, the system gives a meaningful estimated wait time like:

```txt
Estimated wait: 15 minutes
```

This is the most important part because it gives patients visibility and reduces anxiety.

In total, the working of ETA is

The ETA prediction system is based on category-specific rolling consultation histories. Each patient is assigned one of the predefined visit categories during registration: New Consultation, Follow-up, Report Review, or Emergency.

For every category, the system maintains a sliding window containing the durations of the last five completed consultations belonging to that category. Consultation duration is calculated automatically from the consultation start time and consultation end time.

Whenever a consultation is completed:

1. Calculate the actual consultation duration.
2. Identify the patient's category.
3. Append the duration to that category's history.
4. If the history exceeds five records, remove the oldest record.
5. Recompute the average duration for that category.

The category average therefore continuously adapts to the doctor's most recent consultation behavior. Because only the most recent five consultations are considered, the prediction automatically reflects whether the doctor is currently working faster or slower than usual.

To calculate ETA for a patient:

1. Retrieve all patients currently ahead in the queue.
2. For each patient ahead, determine their visit category.
3. Fetch the current predicted duration for that category (average of the last five consultations of that category).
4. Sum all predicted durations of patients ahead.
5. Add any active delay values such as doctor breaks or queue pauses.
6. Return the final value as the estimated waiting time.

Emergency patients are inserted into the queue with highest priority. When an emergency patient is added, the emergency category's predicted duration is included in ETA calculations for all affected patients and ETAs are recalculated immediately.

Doctor breaks and queue pauses are treated as explicit delay intervals. The duration of the delay is added to all waiting-time predictions until the queue resumes.

The ETA engine is event-driven. ETA recalculation is triggered whenever:

* A new patient is added.
* A patient is removed.
* A consultation is completed.
* An emergency patient is inserted.
* A doctor break starts or ends.
* Queue order changes.

This creates a continuously updating prediction model that relies on recent real consultation data rather than fixed averages or hardcoded assumptions.

---

## 🏥 Why This Is Useful for Hospitals and Clinics

This system helps hospitals and clinics by:

- Reducing reception workload
- Reducing patient confusion
- Avoiding crowding near the counter
- Making queue movement transparent
- Helping doctors and receptionists coordinate better
- Giving patients live updates on their phone
- Supporting both online and offline appointments

It is especially useful for small and medium clinics where queue handling is still manual.

---

## 🧑‍💻 Tech Stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS

### Backend

- Node.js
- Express.js

### Database

- MongoDB

### Other Integrations

- QR Code tracking
- WhatsApp-ready appointment links
- Twilio-ready SMS alerts

---

## 🧭 User Flow

1. Patient books an appointment online or visits the clinic.
2. Receptionist approves or adds the patient.
3. System assigns a token number.
4. Patient receives a QR/tracking link.
5. Receptionist calls the next token.
6. Patient tracking screen updates with live queue status.
7. ETA changes based on real queue movement.
8. Consultation is completed and queue moves forward.

---

## 📌 Highlight

This project directly solves the clinic queue problem by giving patients live visibility on their phones and giving receptionists one simple screen to manage the entire queue.

The strongest part of this solution is the ETA system, because it calculates waiting time from actual queue and consultation data instead of showing a fixed or random value.

---

## ▶️ How to Run Locally

```bash
npm install
npm run dev
```

Then open:

```txt
http://localhost:5173
```

For phone QR testing, use your laptop Wi-Fi IP:

```txt
http://172.17.10.20:5173
```

---

## ✅ Final Summary

City Care Hospital Queue Management System is a full-stack digital queue manager for hospitals and clinics.

It supports online booking, receptionist-assisted offline booking, admin management, QR-based patient tracking, and live ETA calculation.

The goal is simple:

> Make clinic waiting smarter, clearer, and less stressful for everyone. 🏥✨
```
