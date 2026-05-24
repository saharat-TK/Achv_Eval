'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  bulkAddToAllowlist,
  type AllowlistEntryInput,
  type BulkAddFailure,
} from '@/app/admin/users/allowlist/actions';

interface ParsedRow extends AllowlistEntryInput {
  rowNumber: number;
  directorProgramLabel?: string;
}

export interface AllowlistProgramOption {
  id: string;
  code: string;
  nameTh: string;
}

function truthy(v: string | undefined): boolean {
  return ['true', '1', 'yes', 'y', '✓', 'x'].includes(
    (v ?? '').trim().toLowerCase(),
  );
}

/**
 * Lenient CSV parser — accepts comma- or tab-separated, quoted or not.
 * Re-implemented inline rather than pulling a dep; matches the
 * tolerance level of `CourseCsvUpload`.
 */
function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const split = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = !inQuote;
        }
      } else if (ch === delim && !inQuote) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((c) => c.trim());
  };
  const headers = split(lines[0]).map((h) => h.toLowerCase());
  const rows = lines.slice(1).map(split);
  return { headers, rows };
}

export default function AllowlistCsvUpload({
  programs,
}: {
  programs: AllowlistProgramOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    | {
        type: 'ok' | 'mixed';
        added: number;
        duplicates: number;
        invalid: BulkAddFailure[];
      }
    | { type: 'err'; text: string }
    | null
  >(null);

  function handleFile(file: File) {
    setParseError(null);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? '');
        const { headers, rows } = parseCsv(text);
        if (headers.length === 0 || rows.length === 0) {
          setParseError('ไฟล์ว่างหรือไม่มีข้อมูล');
          setParsed([]);
          return;
        }
        const emailIdx = headers.indexOf('email');
        if (emailIdx < 0) {
          setParseError('ไม่พบคอลัมน์ "email" ในไฟล์ CSV');
          setParsed([]);
          return;
        }
        const nameThIdx = headers.indexOf('nameth');
        const nameEnIdx = headers.indexOf('nameen');
        const notesIdx = headers.indexOf('notes');
        const lecturerIdx = headers.indexOf('lecturer');
        const directorIdx = headers.indexOf('director');
        const directorProgramIdx = headers.indexOf('directorprogram');

        // Resolve an academic program code → id (case-insensitive).
        const byCode = new Map(
          programs.map((p) => [p.code.trim().toLowerCase(), p]),
        );

        const out: ParsedRow[] = rows
          .map((r, i) => {
            const isLecturer = lecturerIdx >= 0 ? truthy(r[lecturerIdx]) : true;
            const isDirector = directorIdx >= 0 ? truthy(r[directorIdx]) : false;
            const progCode =
              directorProgramIdx >= 0 ? (r[directorProgramIdx] ?? '').trim() : '';
            const prog = progCode
              ? byCode.get(progCode.toLowerCase())
              : undefined;
            return {
              rowNumber: i + 2, // header is line 1
              email: r[emailIdx] ?? '',
              nameTh: nameThIdx >= 0 ? r[nameThIdx] : '',
              nameEn: nameEnIdx >= 0 ? r[nameEnIdx] : '',
              notes: notesIdx >= 0 ? r[notesIdx] : '',
              presetIsLecturer: isLecturer,
              presetIsDirector: isDirector,
              presetDirectorProgramId: prog?.id ?? null,
              directorProgramLabel: isDirector
                ? prog
                  ? `${prog.code}`
                  : progCode || '(ไม่พบหลักสูตร)'
                : '',
            };
          })
          .filter((r) => r.email.trim());

        setParsed(out);
      } catch {
        setParseError('อ่านไฟล์ไม่สำเร็จ');
        setParsed([]);
      }
    };
    reader.readAsText(file);
  }

  async function submit() {
    if (parsed.length === 0) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await bulkAddToAllowlist(
        parsed.map((p) => ({
          email: p.email,
          nameTh: p.nameTh,
          nameEn: p.nameEn,
          notes: p.notes,
          presetIsLecturer: p.presetIsLecturer,
          presetIsDirector: p.presetIsDirector,
          presetDirectorProgramId: p.presetDirectorProgramId,
        })),
      );
      if (!res.ok) {
        setResult({ type: 'err', text: res.error });
      } else {
        setResult({
          type: res.invalid.length === 0 ? 'ok' : 'mixed',
          added: res.added,
          duplicates: res.duplicates,
          invalid: res.invalid,
        });
        if (res.added > 0) setParsed([]);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-mfu-primary px-4 py-2 text-sm font-medium text-mfu-primary hover:bg-mfu-primary/5"
      >
        นำเข้าจาก CSV
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">
            นำเข้ารายชื่อจาก CSV
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            คอลัมน์ที่ต้องมี: <code>email</code>. คอลัมน์เสริม:{' '}
            <code>nameTh</code>, <code>nameEn</code>, <code>notes</code>,{' '}
            <code>lecturer</code>, <code>director</code>,{' '}
            <code>directorProgram</code> (รหัสหลักสูตร ไม่ใช่เล่มหลักสูตร) —
            ลำดับไม่สำคัญ.
            <code>lecturer</code> เริ่มต้นเป็นจริง, <code>director</code>{' '}
            เริ่มต้นเป็นเท็จ (รับค่า true/1/yes)
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setParsed([]);
            setResult(null);
            setParseError(null);
          }}
          className="text-xs text-slate-500 hover:text-slate-800"
        >
          ปิด
        </button>
      </div>

      <div className="mt-3">
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
          className="text-xs text-slate-600 file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-50"
        />
      </div>

      {parseError && (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {parseError}
        </p>
      )}

      {parsed.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-slate-600">
            พบ {parsed.length} แถวพร้อมนำเข้า (ตัวอย่าง 5 แถวแรก):
          </p>
          <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-[11px] text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">อีเมล</th>
                  <th className="px-3 py-2 font-medium">ชื่อไทย</th>
                  <th className="px-3 py-2 font-medium">ชื่ออังกฤษ</th>
                  <th className="px-3 py-2 font-medium">หมายเหตุ</th>
                  <th className="px-3 py-2 font-medium">อาจารย์</th>
                  <th className="px-3 py-2 font-medium">ประธานหลักสูตร</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parsed.slice(0, 5).map((r) => (
                  <tr key={r.rowNumber}>
                    <td className="px-3 py-2 text-slate-500">{r.rowNumber}</td>
                    <td className="px-3 py-2 text-slate-700">{r.email}</td>
                    <td className="px-3 py-2 text-slate-600">{r.nameTh}</td>
                    <td className="px-3 py-2 text-slate-600">{r.nameEn}</td>
                    <td className="px-3 py-2 text-slate-500">{r.notes}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {r.presetIsLecturer ? '✓' : '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {r.presetIsDirector
                        ? `✓ ${r.directorProgramLabel ?? ''}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'กำลังนำเข้า…' : `นำเข้า ${parsed.length} รายการ`}
            </button>
          </div>
        </div>
      )}

      {result && result.type !== 'err' && (
        <div
          className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
            result.type === 'ok'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          <p>
            เพิ่มสำเร็จ {result.added} รายการ · ซ้ำ {result.duplicates} รายการ
            {result.invalid.length > 0 ? (
              <>
                {' '}
                · ไม่ถูกต้อง {result.invalid.length} รายการ
              </>
            ) : null}
          </p>
          {result.invalid.length > 0 && (
            <ul className="mt-1 list-inside list-disc">
              {result.invalid.map((f, i) => (
                <li key={i}>
                  {f.email || '(ว่าง)'} — {f.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {result && result.type === 'err' && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {result.text}
        </p>
      )}
    </div>
  );
}
