import * as admin from 'firebase-admin';

admin.initializeApp();

export { analyzeCourse } from './analyzeCourse';
export { generateCombinedReport } from './generateCombinedReport';
export { generateFinalVerificationReport } from './generateFinalVerificationReport';
export { purgeProgram } from './purgeProgram';
