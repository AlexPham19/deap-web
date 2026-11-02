import { seedData, uid, plusDays, type AppData, type Patient, type Message, type Rating, tokenState } from './domain.ts';
const KEY = 'deap-ktx-connect-v1';
export function readData(): AppData {
  try { const data = JSON.parse(localStorage.getItem(KEY) || 'null'); if (data?.version === 1 && Array.isArray(data.patients) && Array.isArray(data.messages) && Array.isArray(data.activity) && !Number.isNaN(Date.parse(data.now))) return data; } catch { /* An empty or unavailable store starts a fresh demo. */ }
  return seedData();
}
export function persist(data: AppData) { localStorage.setItem(KEY, JSON.stringify(data)); }
function log(d: AppData, patientId: string, text: string) { d.activity.unshift({ id: uid(), patientId, at: d.now, text }); }
export function createMessage(d: AppData, patientId: string, kind: Message['kind']): Message {
  const p = d.patients.find(p => p.id === patientId);
  if (!p) throw new Error('Patient not found.');
  if (kind === 'checkin' && !p.plan) throw new Error('Save an agreed plan before sending a check-in.');
  const message: Message = { id: uid(), patientId, kind, token: uid(), at: d.now, expiresAt: plusDays(d.now, 3), body: kind === 'assessment' ? `Hi ${p.name.split(' ')[0]} — your care team would like to understand what is getting in the way. Please complete this short check-in before your visit.` : `Hi ${p.name.split(' ')[0]} — how is your plan working for you? Your care team would love a quick check-in.` };
  d.messages.unshift(message); log(d, patientId, kind === 'assessment' ? 'Assessment link created · simulated SMS' : 'Check-in link created · simulated SMS');
  return message;
}
export function addPatient(d: AppData, fields: Pick<Patient, 'name' | 'dob' | 'phone'>) {
  if (!fields.name.trim() || !fields.phone.trim()) throw new Error('Name and demo phone number are required.');
  const p: Patient = { ...fields, name: fields.name.trim(), id: uid(), initials: fields.name.trim().split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase(), enrolledAt: d.now, barriers: [], other: '', primary: '', preferences: [], checkIns: [] };
  d.patients.unshift(p); log(d, p.id, 'Enrolled in the demo'); createMessage(d, p.id, 'assessment'); return p;
}
export function saveAssessment(d: AppData, patientId: string, values: Pick<Patient, 'barriers' | 'other' | 'primary' | 'preferences'>, token?: string) {
  const p = d.patients.find(p => p.id === patientId);
  if (!p || !values.barriers.length || !values.barriers.includes(values.primary) || (values.barriers.includes('other') && !values.other.trim())) throw new Error('Complete your barrier choices and select a focus.');
  const m = token ? d.messages.find(m => m.token === token && m.patientId === patientId && m.kind === 'assessment') : undefined;
  if (token && tokenState(m, d.now) !== 'valid') throw new Error('This link is no longer available. Ask your care team for a new link.');
  Object.assign(p, values, { assessedAt: d.now }); if (m) m.usedAt = d.now; log(d, patientId, 'Completed the barrier assessment');
}
export function savePlan(d: AppData, patientId: string, text: string, strategies: string[], reminderTime: string) {
  const p = d.patients.find(p => p.id === patientId);
  if (!p?.assessedAt || !text.trim()) throw new Error('Complete the assessment and write an agreed plan first.');
  p.plan = { text: text.trim(), strategies, reminderTime, at: d.now, nextCheckIn: plusDays(d.now, 7) }; log(d, patientId, 'Saved an agreed plan · follow-up in 7 days');
}
export function saveCheckIn(d: AppData, patientId: string, rating: Rating, note: string, token?: string) {
  const p = d.patients.find(p => p.id === patientId);
  if (!p?.plan) throw new Error('An agreed plan is needed before a check-in.');
  const m = token ? d.messages.find(m => m.token === token && m.patientId === patientId && m.kind === 'checkin') : undefined;
  if (token && tokenState(m, d.now) !== 'valid') throw new Error('This link is no longer available. Ask your care team for a new link.');
  if (!['green','yellow','red'].includes(rating)) throw new Error('Choose how things are going.');
  p.checkIns.push({ id: uid(), at: d.now, rating, note: note.trim() }); p.plan.nextCheckIn = plusDays(d.now, 7); if (m) m.usedAt = d.now;
  log(d, patientId, rating === 'green' ? 'Shared a check-in: doing well' : rating === 'yellow' ? 'Shared a check-in: a few bumps' : 'Shared a check-in: needs support');
}
export function advanceDemo(d: AppData) {
  d.now = plusDays(d.now, 7);
  for (const p of d.patients) if (p.plan && Date.parse(p.plan.nextCheckIn) <= Date.parse(d.now)) createMessage(d, p.id, 'checkin');
}
