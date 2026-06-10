import * as admin from 'firebase-admin';

admin.initializeApp();

export { analyzeCourse } from './analyzeCourse';
export { generateCombinedReport } from './generateCombinedReport';
export {
  synthesizeAssessmentReport,
  generateAssessmentSummaryReport,
} from './assessmentSummaryReport';
export { generateFinalVerificationReport } from './generateFinalVerificationReport';
export { purgeProgram } from './purgeProgram';
export { purgeCourse } from './purgeCourse';
export { purgeDepartment } from './purgeDepartment';
export { purgeOffering } from './purgeOffering';
