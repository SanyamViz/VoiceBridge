import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { resolve } from 'path';

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "voicespeak-test",
    firestore: {
      rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Firestore Security Rules: IDOR Protection', () => {
  const PATIENT_UID = 'patient123';
  const CAREGIVER_UID = 'caregiver456';
  const STRANGER_UID = 'stranger789';

  it('allows patients to read and write their own presence', async () => {
    const patientDb = testEnv.authenticatedContext(PATIENT_UID).firestore();
    await assertSucceeds(patientDb.collection('presence').doc(PATIENT_UID).set({ status: 'online' }));
    await assertSucceeds(patientDb.collection('presence').doc(PATIENT_UID).get());
  });

  it('denies strangers from reading patient presence', async () => {
    const strangerDb = testEnv.authenticatedContext(STRANGER_UID).firestore();
    await assertFails(strangerDb.collection('presence').doc(PATIENT_UID).get());
  });

  it('allows caregivers to read patient presence ONLY if a monitoring link exists', async () => {
    const caregiverDb = testEnv.authenticatedContext(CAREGIVER_UID).firestore();
    
    // Without link: fails
    await assertFails(caregiverDb.collection('presence').doc(PATIENT_UID).get());
    
    // Create link
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('monitoring_links').doc(`${CAREGIVER_UID}_${PATIENT_UID}`).set({ active: true });
    });
    
    // With link: succeeds
    await assertSucceeds(caregiverDb.collection('presence').doc(PATIENT_UID).get());
  });

  it('allows caregivers to read patient alerts ONLY if a monitoring link exists', async () => {
    const caregiverDb = testEnv.authenticatedContext(CAREGIVER_UID).firestore();
    const query = caregiverDb.collection('alerts').where('patientUid', '==', PATIENT_UID);
    
    // Without link
    await assertFails(query.get());
    
    // Create link
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('monitoring_links').doc(`${CAREGIVER_UID}_${PATIENT_UID}`).set({ active: true });
    });
    
    // With link
    await assertSucceeds(query.get());
  });
  
  it('allows caregivers to create monitoring links for themselves', async () => {
     const caregiverDb = testEnv.authenticatedContext(CAREGIVER_UID).firestore();
     await assertSucceeds(caregiverDb.collection('monitoring_links').doc(`${CAREGIVER_UID}_${PATIENT_UID}`).set({ active: true }));
     
     // But cannot create links for others
     await assertFails(caregiverDb.collection('monitoring_links').doc(`${STRANGER_UID}_${PATIENT_UID}`).set({ active: true }));
  });
});
