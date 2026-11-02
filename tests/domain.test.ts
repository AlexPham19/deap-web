import test from 'node:test';
import assert from 'node:assert/strict';
import { seedData, patientStatus, tokenState, plusDays } from '../src/domain.ts';
import { addPatient, saveAssessment, savePlan, saveCheckIn, advanceDemo, createMessage } from '../src/services.ts';
test('complete enrollment → assessment → plan → scheduled check-in flow', () => {
  const d = seedData(); const p = addPatient(d, { name: 'Demo Person', dob: '2010-01-01', phone: '(555) 000-0002' });
  assert.equal(patientStatus(p, d.now), 'awaiting'); const assessment = d.messages[0];
  saveAssessment(d, p.id, { barriers: ['forget'], primary: 'forget', other: '', preferences: ['reminder'] }, assessment.token);
  assert.equal(tokenState(assessment, d.now), 'used'); assert.equal(patientStatus(p, d.now), 'due');
  savePlan(d, p.id, 'A plan agreed with my team', ['reminder'], '07:00'); assert.equal(patientStatus(p, d.now), 'track');
  advanceDemo(d); assert.equal(patientStatus(p, d.now), 'due');
  const m = d.messages.find(m => m.patientId === p.id && m.kind === 'checkin')!;
  saveCheckIn(d, p.id, 'red', 'My routine changed.', m.token); assert.equal(patientStatus(p, d.now), 'attention');
  assert.throws(() => saveCheckIn(d, p.id, 'green', '', m.token));
  const next = createMessage(d, p.id, 'checkin'); saveCheckIn(d, p.id, 'green', 'Better this week.', next.token);
  assert.equal(patientStatus(p, d.now), 'track');
});
test('an expired token cannot submit and expiry starts at exactly 72 hours', () => {
  const d = seedData(); const m = createMessage(d, 'taylor', 'assessment'); d.now = plusDays(d.now, 3);
  assert.equal(tokenState(m, d.now), 'expired');
  assert.throws(() => saveAssessment(d, 'taylor', { barriers: ['forget'], primary: 'forget', other: '', preferences: [] }, m.token));
});
test('no response remains follow-up due rather than reporting missed medication', () => {
  const d = seedData(); const p = d.patients.find(p => p.id === 'alex')!;
  assert.equal(p.checkIns.length, 0); assert.equal(patientStatus(p, d.now), 'due');
});
test('assessment requires a valid primary choice and other-barrier text', () => {
  const d = seedData(); assert.throws(() => saveAssessment(d, 'taylor', { barriers: ['forget'], primary: 'effects', other: '', preferences: [] }));
  assert.throws(() => saveAssessment(d, 'taylor', { barriers: ['other'], primary: 'other', other: '', preferences: [] }));
});
