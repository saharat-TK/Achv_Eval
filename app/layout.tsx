import type { Metadata } from 'next';
import './globals.css';
import ConfirmDialogProvider from '@/components/ConfirmDialogProvider';

export const metadata: Metadata = {
  title: 'Course Evaluation & Monitoring — MFU',
  description: 'ระบบประเมินและทวนสอบรายวิชา สำนักวิชาวิทยาศาสตร์สุขภาพ มฟล.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="app-compact">
        <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
      </body>
    </html>
  );
}
