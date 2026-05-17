import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Course Evaluation & Monitoring — MFU',
  description: 'ระบบประเมินและทวนสอบรายวิชา สำนักวิชาวิทยาศาสตร์สุขภาพ มฟล.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
