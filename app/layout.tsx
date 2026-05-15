import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Course Evaluation & Monitoring — MFU',
  description: 'ระบบประเมินและทวนสอบรายวิชา สำนักวิชาวิทยาศาสตร์สุขภาพ มฟล.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
