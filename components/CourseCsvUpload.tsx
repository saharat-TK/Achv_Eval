'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { batchUploadCourses } from '@/app/admin/programs/[programId]/courses/actions';

const COLUMNS = ['code', 'nameTh', 'nameEn', 'creditStructure', 'type', 'yearOfStudy'];

/** Minimal CSV parser — handles quoted fields and escaped quotes. */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') inQ = false;
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === ',') {
        out.push(cur);
        cur = '';
      } else cur += c;
    }
    out.push(cur);
    return out;
  };

  const headers = parseLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? '').trim();
    });
    return row;
  });
}

export default function CourseCsvUpload({ programId }: { programId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; errors: string[] } | null>(
    null,
  );

  async function handleFile(file: File) {
    setBusy(true);
    setResult(null);
    try {
      const rows = parseCsv(await file.text());
      if (rows.length === 0) {
        setResult({ created: 0, errors: ['ไฟล์ว่างหรือไม่มีข้อมูล'] });
        return;
      }
      const res = await batchUploadCourses(programId, rows);
      setResult(res);
      if (res.created > 0) router.refresh();
    } catch {
      setResult({ created: 0, errors: ['อ่านไฟล์ไม่สำเร็จ'] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-700">
        นำเข้ารายวิชาจากไฟล์ CSV
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        คอลัมน์ (แถวแรกเป็นหัวตาราง): <code>{COLUMNS.join(', ')}</code>
        <br />
        ค่า <code>type</code> ใช้: theory, theory_practice, practice, field, s_u
      </p>
      <label className="mt-3 inline-block cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
        {busy ? 'กำลังนำเข้า…' : 'เลือกไฟล์ CSV'}
        <input
          type="file"
          accept=".csv"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />
      </label>

      {result && (
        <div className="mt-3 text-xs">
          {result.created > 0 && (
            <p className="text-green-700">นำเข้าสำเร็จ {result.created} รายวิชา</p>
          )}
          {result.errors.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-amber-700">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
