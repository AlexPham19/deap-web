export type Rating = 'green' | 'yellow' | 'red';
export type Status = 'attention' | 'due' | 'track' | 'awaiting';
export interface CheckIn { id: string; at: string; rating: Rating; note: string }
export interface Plan { text: string; strategies: string[]; at: string; nextCheckIn: string; reminderTime: string }
export interface Patient {
  id: string; name: string; initials: string; dob: string; phone: string; enrolledAt: string;
  barriers: string[]; other: string; primary: string; preferences: string[];
  assessedAt?: string; plan?: Plan; checkIns: CheckIn[];
}
export interface Message {
  id: string; patientId: string; kind: 'assessment' | 'checkin'; token: string;
  at: string; expiresAt: string; usedAt?: string; body: string;
}
export interface Activity { id: string; patientId: string; at: string; text: string }
export interface AppData { version: 1; now: string; patients: Patient[]; messages: Message[]; activity: Activity[]; largeText: boolean }
export const DAY = 86400000;
export const uid = () => crypto.randomUUID();
export const plusDays = (date: string, days: number) => new Date(new Date(date).getTime() + days * DAY).toISOString();
export const statusLabels: Record<Status, string> = { attention: 'Needs attention', due: 'Follow-up due', track: 'On track', awaiting: 'Awaiting assessment' };
export const barriers = [
  { id: 'forget', title: 'I forget', description: 'Remembering is hard on busy days.' },
  { id: 'routine', title: 'My routine changes', description: 'School, work, or activities get in the way.' },
  { id: 'taste', title: 'I dislike the taste', description: 'The taste makes taking medicine difficult.' },
  { id: 'swallow', title: 'Pills are hard to swallow', description: 'Taking the medicine feels difficult.' },
  { id: 'effects', title: 'Side effects bother me', description: 'I want to discuss how my medicine makes me feel.' },
  { id: 'other', title: 'Something else', description: 'Tell your care team in your own words.' }
];
export const strategies = [
  { id: 'reminder', title: 'A reminder at a time that fits', description: 'Choose a reminder time to discuss with your team.' },
  { id: 'routine', title: 'Connect it to a daily routine', description: 'Use an activity you already do as a cue.' },
  { id: 'cue', title: 'A visible reminder', description: 'Choose a safe visual cue with your care team.' },
  { id: 'support', title: 'Someone in my corner', description: 'Ask a person you trust to help you remember.' },
  { id: 'team', title: 'Talk it through with my care team', description: 'Discuss taste, swallowing, side effects, or another concern.' }
];
export function strategyOptions(primary: string) {
  return primary === 'taste' || primary === 'swallow' || primary === 'effects' || primary === 'other'
    ? strategies.filter(s => s.id === 'team' || s.id === 'support') : strategies.filter(s => s.id !== 'team');
}
export const barrierTitle = (p: Patient, id = p.primary) => id === 'other' ? (p.other || 'Something else') : barriers.find(b => b.id === id)?.title || 'Not assessed yet';
export function patientStatus(p: Patient, now: string): Status {
  if (!p.assessedAt) return 'awaiting';
  const last = p.checkIns.at(-1);
  if (last && last.rating !== 'green') return 'attention';
  if (!p.plan || new Date(p.plan.nextCheckIn).getTime() <= new Date(now).getTime()) return 'due';
  return 'track';
}
export function tokenState(m: Message | undefined, now: string): 'missing' | 'used' | 'expired' | 'valid' {
  if (!m) return 'missing';
  if (m.usedAt) return 'used';
  return new Date(m.expiresAt).getTime() <= new Date(now).getTime() ? 'expired' : 'valid';
}
export function seedData(): AppData {
  const now = new Date().toISOString();
  const make = (id: string, name: string, initials: string, dob: string): Patient => ({ id, name, initials, dob, phone: '(555) 000-0001', enrolledAt: plusDays(now, -21), barriers: [], other: '', primary: '', preferences: [], checkIns: [] });
  const jordan = make('jordan', 'Jordan Miller', 'JM', '2008-03-14');
  Object.assign(jordan, { barriers: ['forget', 'routine'], primary: 'forget', preferences: ['reminder', 'routine'], assessedAt: plusDays(now, -14), plan: { text: 'Use my 7am phone alarm and connect my medicine routine to brushing my teeth.', strategies: ['reminder', 'routine'], at: plusDays(now, -7), nextCheckIn: plusDays(now, 1), reminderTime: '07:00' }, checkIns: [{ id: 'ci-jordan', at: plusDays(now, -6), rating: 'green', note: 'The morning alarm is helping. My routine feels easier.' }] });
  const morgan = make('morgan', 'Morgan Lee', 'ML', '2007-09-22');
  Object.assign(morgan, { barriers: ['routine', 'forget'], primary: 'routine', preferences: ['reminder', 'support'], assessedAt: plusDays(now, -18), plan: { text: 'Use a reminder and ask my caregiver to help when my schedule changes.', strategies: ['reminder', 'support'], at: plusDays(now, -9), nextCheckIn: plusDays(now, -2), reminderTime: '08:00' }, checkIns: [{ id: 'ci-morgan', at: plusDays(now, -2), rating: 'red', note: 'My shifts changed this week. I am struggling to keep the routine.' }] });
  const alex = make('alex', 'Alex Rivera', 'AR', '2010-06-05');
  Object.assign(alex, { barriers: ['taste'], primary: 'taste', preferences: ['team'], assessedAt: plusDays(now, -8), plan: { text: 'Write down what makes the taste difficult and talk with my transplant team.', strategies: ['team'], at: plusDays(now, -8), nextCheckIn: plusDays(now, -1), reminderTime: '09:00' } });
  const taylor = make('taylor', 'Taylor Brooks', 'TB', '2009-02-17');
  const sam = make('sam', 'Sam Parker', 'SP', '2011-01-12');
  Object.assign(sam, { barriers: ['forget'], primary: 'forget', preferences: ['cue', 'support'], assessedAt: plusDays(now, -5), plan: { text: 'Use a reminder card and check in with my caregiver about the routine.', strategies: ['cue', 'support'], at: plusDays(now, -5), nextCheckIn: plusDays(now, 2), reminderTime: '07:30' }, checkIns: [{ id: 'ci-sam', at: plusDays(now, -1), rating: 'green', note: 'The reminder card helps me notice the routine.' }] });
  return { version: 1, now, patients: [morgan, alex, jordan, taylor, sam], messages: [], largeText: false, activity: [
    { id: 'a1', patientId: 'sam', at: plusDays(now, -1), text: 'Shared a check-in: doing well' },
    { id: 'a2', patientId: 'morgan', at: plusDays(now, -2), text: 'Asked for support with a changing routine' },
    { id: 'a3', patientId: 'jordan', at: plusDays(now, -6), text: 'Shared a check-in: doing well' }
  ] };
}
