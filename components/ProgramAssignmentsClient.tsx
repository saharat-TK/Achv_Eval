'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import DualListSelector, { type DualListItem } from '@/components/DualListSelector';
import {
  clearProgramAssignments,
  saveProgramAssignments,
} from '@/app/admin/users/program-assignments/actions';
import type {
  AcademicProgramAssignmentRow,
  AssignmentPerson,
} from '@/lib/data/programAssignments';

interface ProgramOption {
  id: string;
  code: string;
  nameTh: string;
}

function statusText(person: AssignmentPerson): string {
  if (person.status === 'pending') return 'รอลงทะเบียน';
  if (person.status === 'inactive') return 'ปิดใช้งาน';
  return 'ใช้งาน';
}

function statusClass(person: AssignmentPerson): string {
  if (person.status === 'pending') return 'bg-amber-100 text-amber-800';
  if (person.status === 'inactive') return 'bg-slate-100 text-slate-600';
  return 'bg-green-100 text-green-800';
}

function personName(person: AssignmentPerson): string {
  return person.nameTh || person.email;
}

function toDualItem(person: AssignmentPerson): DualListItem {
  const label = personName(person);
  return {
    id: person.key,
    code: label,
    nameTh: label,
  };
}

export default function ProgramAssignmentsClient({
  programs,
  people,
  rows,
}: {
  programs: ProgramOption[];
  people: AssignmentPerson[];
  rows: AcademicProgramAssignmentRow[];
}) {
  const router = useRouter();
  const [modal, setModal] = useState<{
    mode: 'add' | 'edit';
    programId: string;
    directorKey: string;
    lecturers: DualListItem[];
  } | null>(null);
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [menuDir, setMenuDir] = useState<'up' | 'down'>('down');
  const [lecturerSearch, setLecturerSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleMenu(rowId: string, e: React.MouseEvent<HTMLElement>) {
    if (menuKey === rowId) {
      setMenuKey(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setMenuDir(spaceBelow < 96 ? 'up' : 'down');
    setMenuKey(rowId);
  }

  function openModal(row?: AcademicProgramAssignmentRow) {
    const programId = row?.id ?? programs[0]?.id ?? '';
    setMenuKey(null);
    setError(null);
    setLecturerSearch('');
    setModal({
      mode: row ? 'edit' : 'add',
      programId,
      directorKey: row?.director?.key ?? '',
      lecturers: (row?.lecturers ?? []).map(toDualItem),
    });
  }

  async function save() {
    if (!modal) return;
    setBusy(true);
    setError(null);
    const res = await saveProgramAssignments({
      academicProgramId: modal.programId,
      directorKey: modal.directorKey || null,
      lecturerKeys: modal.lecturers.map((person) => person.id),
    });
    setBusy(false);
    if (res.ok) {
      setModal(null);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  async function clear(row: AcademicProgramAssignmentRow) {
    setMenuKey(null);
    const ok = window.confirm(`ล้างการมอบหมายของ ${row.code} — ${row.nameTh}`);
    if (!ok) return;
    setBusy(true);
    setError(null);
    const res = await clearProgramAssignments(row.id);
    setBusy(false);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  const selectedProgram = programs.find((program) => program.id === modal?.programId);
  const availablePeople = useMemo(() => {
    const term = lecturerSearch.trim().toLocaleLowerCase('th');
    const filtered = term
      ? people.filter((person) =>
          [person.nameTh, person.email]
            .filter(Boolean)
            .some((value) => value.toLocaleLowerCase('th').includes(term)),
        )
      : people;
    return filtered.map(toDualItem);
  }, [lecturerSearch, people]);

  return (
    <div className="mt-4 space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => openModal()}
          disabled={programs.length === 0}
          className="rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          + มอบหมาย
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="rounded-tl-xl px-4 py-3 font-medium">หลักสูตร</th>
              <th className="px-4 py-3 font-medium">ประธานหลักสูตร</th>
              <th className="px-4 py-3 font-medium">อาจารย์ประจำหลักสูตร</th>
              <th className="w-14 rounded-tr-xl px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const hasAssignments = row.directors.length > 0 || row.lecturers.length > 0;
              return (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{row.code}</p>
                    <p className="text-xs text-slate-500">{row.nameTh}</p>
                  </td>
                  <td className="px-4 py-3">
                    {row.directors.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {row.directors.map((person) => (
                          <PersonPill key={person.key} person={person} />
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">ยังไม่ได้มอบหมาย</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.lecturers.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {row.lecturers.map((person) => (
                          <PersonPill key={person.key} person={person} />
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">ยังไม่ได้มอบหมาย</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {hasAssignments ? (
                      <div className="relative inline-block">
	                        <button
	                          type="button"
	                          onClick={(e) => toggleMenu(row.id, e)}
	                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
	                          aria-label="จัดการ"
	                        >
	                          ⋮
	                        </button>
	                        {menuKey === row.id && (
	                          <div
	                            className={`absolute right-0 z-50 w-28 overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-lg ${
	                              menuDir === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
	                            }`}
	                          >
                            <button
                              type="button"
                              onClick={() => openModal(row)}
                              className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                            >
                              แก้ไข
                            </button>
                            <button
                              type="button"
                              onClick={() => clear(row)}
                              disabled={busy}
                              className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              ลบ
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openModal(row)}
                        className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        +
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={() => !busy && setModal(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="my-8 w-full max-w-3xl rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-800">
                มอบหมายอาจารย์ประจำหลักสูตร
              </h2>
              <button
                type="button"
                onClick={() => {
                  setLecturerSearch('');
                  setModal(null);
                }}
                disabled={busy}
                className="text-sm text-slate-500 hover:text-slate-800 disabled:opacity-50"
              >
                ปิด
              </button>
            </div>

            <div className="mt-4 max-w-xl space-y-3">
              <label className="block text-xs text-slate-600">
                หลักสูตร
                <select
                  value={modal.programId}
                  disabled={modal.mode === 'edit'}
                  onChange={(e) =>
                    setModal((current) =>
                      current ? { ...current, programId: e.target.value } : current,
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-mfu-primary focus:outline-none disabled:bg-slate-50"
                >
                  {programs.map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.code} — {program.nameTh}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-slate-600">
                ประธานหลักสูตร
                <select
                  value={modal.directorKey}
                  onChange={(e) =>
                    setModal((current) =>
                      current ? { ...current, directorKey: e.target.value } : current,
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-mfu-primary focus:outline-none"
                >
                  <option value="">— ยังไม่มอบหมาย —</option>
                  {people.map((person) => (
                    <option key={person.key} value={person.key}>
                      {personName(person)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-slate-600">
                ค้นหาอาจารย์
                <input
                  type="search"
                  value={lecturerSearch}
                  onChange={(e) => setLecturerSearch(e.target.value)}
                  placeholder="ค้นหาชื่ออาจารย์"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-mfu-primary focus:outline-none"
                />
              </label>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-right text-xs font-medium text-slate-500">
                อาจารย์ประจำหลักสูตร {selectedProgram ? `· ${selectedProgram.code}` : ''}
              </p>
              <DualListSelector
                available={availablePeople}
                selected={modal.lecturers}
                availableTitle="รายชื่อที่เลือกได้"
                selectedTitle="รายชื่อที่เลือกแล้ว"
                emptyAvailableText="ไม่มีรายชื่อ"
                emptySelectedText="ยังไม่ได้เลือกรายชื่อ"
                showCode={false}
                selectionStyle="row"
                onAdd={(items) =>
                  setModal((current) =>
                    current
                      ? {
                          ...current,
                          lecturers: [
                            ...current.lecturers,
                            ...items.filter(
                              (item) => !current.lecturers.some((l) => l.id === item.id),
                            ),
                          ],
                        }
                      : current,
                  )
                }
                onRemove={(ids) =>
                  setModal((current) =>
                    current
                      ? {
                          ...current,
                          lecturers: current.lecturers.filter(
                            (lecturer) => !ids.includes(lecturer.id),
                          ),
                        }
                      : current,
                  )
                }
              />
            </div>

            {error && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setLecturerSearch('');
                  setModal(null);
                }}
                disabled={busy}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy || !modal.programId}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? 'กำลังบันทึก…' : 'มอบหมาย'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PersonPill({ person }: { person: AssignmentPerson }) {
  return (
    <span
      title={person.email}
      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700"
    >
      <span className="font-medium">{personName(person)}</span>
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${statusClass(person)}`}>
        {statusText(person)}
      </span>
    </span>
  );
}
