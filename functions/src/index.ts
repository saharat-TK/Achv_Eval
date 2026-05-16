import * as admin from 'firebase-admin';

admin.initializeApp();

export { analyzeCourse } from './analyzeCourse';
export { generateReportPdf } from './generateReportPdf';
