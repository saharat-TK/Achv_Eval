'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ToastProvider';
import type { AssignmentPerson } from '@/lib/data/programAssignments';
import type { VerificationProgramRow } from '@/lib/data/verificationCommittee';
import {
  clearVerificationCommittee,
  saveVerificationCommittee,
} from '@/app/admin/users/verification-committee/actions';

interface Opt {
  key: string;
  name: string;
  status?: AssignmentPerson['status'];
}
interface Slot {
  name: string;
  key: string | null;
}

const STATUS_SUFFIX: Record<AssignmentPerson['status'], string> = {
  active: '',
  inactive: ' (ปิดใช้งาน)',
  pending: ' (รอลงทะเบียน)',
};

function personToOpt(p: AssignmentPerson): Opt {
  return { key: p.key, name: p.nameTh || p.email, status: p.status };
}

// ---------- Person picker (combobox) ----------

function PersonPicker({
  value,
  options,
  placeholder,
  excludeKeys,
  onChange,
}: {
  value: Slot;
  options: Opt[];
  placeholder: string;
  excludeKeys?: Set<string>;
  onChange: (s: Slot) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value.name);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [box, setBox] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
    flip: boolean;
  } | null>(null);

  useEffect(() => setQuery(value.name), [value.name]);

  function close() {
    setOpen(false);
    setQuery(value.name); // discard unmatched typing — picks must be from the roster
  }

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom - 8;
      const spaceAbove = r.top - 8;
      const flip = spaceBelow < 200 && spaceAbove > spaceBelow;
      setBox({
        left: r.left,
        width: r.width,
        top: flip ? r.top - 4 : r.bottom + 4,
        maxHeight: Math.max(120, Math.min(320, flip ? spaceAbove : spaceBelow)),
        flip,
      });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDoc);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      document.removeEventListener('mousedown', onDoc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value.name]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      options
        .filter((o) => !excludeKeys?.has(o.key) || o.key === value.key)
        .filter((o) => (q ? o.name.toLowerCase().includes(q) : true)),
    [options, excludeKeys, value.key, q],
  );

  useEffect(() => setActiveIndex(-1), [query, open]);
  useEffect(() => {
    if (activeIndex >= 0)
      document.getElementById(`${listId}-opt-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, listId]);

  function commit(o: Opt) {
    onChange({ name: o.name, key: o.key });
    setQuery(o.name);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative min-w-0 flex-1">
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined}
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (!open) return setOpen(true);
              setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter' && open && activeIndex >= 0 && matches[activeIndex]) {
              e.preventDefault();
              commit(matches[activeIndex]);
            } else if (e.key === 'Escape') {
              close();
            }
          }}
          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-mfu-primary focus:outline-none"
        />
        {value.name && (
          <button
            type="button"
            onClick={() => {
              onChange({ name: '', key: null });
              setQuery('');
            }}
            aria-label="ลบ"
            className="shrink-0 rounded px-1 text-slate-500 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mfu-primary/40"
          >
            ✕
          </button>
        )}
      </div>
      {open && matches.length > 0 && box && (
        <ul
          id={listId}
          role="listbox"
          style={{
            position: 'fixed',
            left: box.left,
            top: box.top,
            width: box.width,
            maxHeight: box.maxHeight,
            transform: box.flip ? 'translateY(-100%)' : undefined,
          }}
          className="z-50 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          {matches.map((o, idx) => {
            const active = idx === activeIndex;
            return (
              <li
                key={o.key}
                id={`${listId}-opt-${idx}`}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(o);
                }}
                className={`cursor-pointer px-3 py-1.5 text-slate-700 ${
                  active ? 'bg-slate-100' : 'hover:bg-slate-50'
                }`}
              >
                {o.name}
                {o.status && o.status !== 'active' && (
                  <span className="text-slate-500">{STATUS_SUFFIX[o.status]}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------- Confirm dialog ----------

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <h3 className="text-base font-semibold text-slate-800">{title}</h3>
        <p className="mt-2 text-sm text-slate-600">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={async () => {
              setBusy(true);
              await onConfirm();
              setBusy(false);
            }}
            disabled={busy}
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'กำลังดำเนินการ…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Row kebab menu ----------

function RowMenu({ hasCommittee, onManage, onClear }: {
  hasCommittee: boolean;
  onManage: () => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="จัดการ"
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mfu-primary/40"
      >
        ⋮
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onManage();
            }}
            className="block w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
          >
            จัดการคณะกรรมการ
          </button>
          {hasCommittee && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onClear();
              }}
              className="block w-full px-3 py-2 text-left text-red-600 hover:bg-red-50"
            >
              ล้างคณะกรรมการ
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Committee modal ----------

function CommitteeModal({
  row,
  rosterOptions,
  onClose,
  onSaved,
}: {
  row: VerificationProgramRow;
  rosterOptions: Opt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [members, setMembers] = useState<Slot[]>(
    row.verifiers.map((v) => ({ name: v.nameTh || v.email, key: v.key })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = useMemo(
    () => new Set(members.map((s) => s.key).filter((k): k is string => !!k)),
    [members],
  );

  function setMemberAt(i: number, s: Slot) {
    setMembers((prev) => prev.map((p, idx) => (idx === i ? s : p)));
  }

  async function save() {
    setBusy(true);
    setError(null);
    const keys = members.map((s) => s.key).filter((k): k is string => !!k);
    const res = await saveVerificationCommittee(row.id, keys);
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <h3 className="text-base font-semibold text-slate-800">จัดการคณะกรรมการรับรองผล</h3>
        <p className="mt-1 text-xs text-slate-500">
          {row.code} — {row.nameTh}
        </p>

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-600">กรรมการรับรองผล</label>
            <button
              type="button"
              onClick={() => setMembers((p) => [...p, { name: '', key: null }])}
              className="text-xs text-mfu-primary hover:underline"
            >
              + เพิ่ม
            </button>
          </div>
          <div className="mt-1 space-y-2">
            {members.length === 0 && (
              <p className="text-xs text-slate-500">ยังไม่ได้เพิ่มกรรมการรับรองผล</p>
            )}
            {members.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <PersonPicker
                  value={s}
                  options={rosterOptions}
                  placeholder="เลือกผู้ใช้งานหรือรายชื่อรอลงทะเบียน"
                  excludeKeys={chosen}
                  onChange={(v) => setMemberAt(i, v)}
                />
                <button
                  type="button"
                  onClick={() => setMembers((p) => p.filter((_, idx) => idx !== i))}
                  aria-label="ลบแถว"
                  className="shrink-0 px-1 text-slate-500 hover:text-red-600"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          กรรมการที่เลือกจะได้รับสิทธิ์คณะกรรมการรับรองผลของหลักสูตรนี้โดยอัตโนมัติ
        </p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mfu-primary/40 disabled:opacity-50"
          >
            {busy ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Main ----------

export default function VerificationCommitteeClient({
  people,
  rows,
}: {
  people: AssignmentPerson[];
  rows: VerificationProgramRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const rosterOptions = useMemo(() => people.map(personToOpt), [people]);
  const [editing, setEditing] = useState<VerificationProgramRow | null>(null);
  const [clearing, setClearing] = useState<VerificationProgramRow | null>(null);

  return (
    <div className="mt-6 space-y-3">
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          ยังไม่มีหลักสูตร
        </div>
      ) : (
        rows.map((row) => (
          <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-800">
                  {row.code} — {row.nameTh}
                </div>
              </div>
              <RowMenu
                hasCommittee={row.verifiers.length > 0}
                onManage={() => setEditing(row)}
                onClear={() => setClearing(row)}
              />
            </div>

            {row.verifiers.length > 0 ? (
              <div className="mt-3 flex gap-2 text-sm">
                <span className="w-44 shrink-0 text-slate-500">กรรมการรับรองผล</span>
                <span className="min-w-0 text-slate-700">
                  {row.verifiers
                    .map((v) => (v.nameTh || v.email) + STATUS_SUFFIX[v.status])
                    .join(', ')}
                </span>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">ยังไม่กำหนดคณะกรรมการรับรองผล</p>
            )}
          </div>
        ))
      )}

      {editing && (
        <CommitteeModal
          row={editing}
          rosterOptions={rosterOptions}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast({ title: 'บันทึกคณะกรรมการแล้ว', variant: 'success' });
            router.refresh();
          }}
        />
      )}

      {clearing && (
        <ConfirmDialog
          title="ล้างคณะกรรมการรับรองผล"
          body={`ลบคณะกรรมการของ ${clearing.code} — ${clearing.nameTh} และถอนสิทธิ์คณะกรรมการรับรองผลที่ได้รับจากคณะกรรมการนี้`}
          confirmLabel="ล้างข้อมูล"
          onCancel={() => setClearing(null)}
          onConfirm={async () => {
            const res = await clearVerificationCommittee(clearing.id);
            if (res.ok) {
              setClearing(null);
              toast({ title: 'ล้างคณะกรรมการแล้ว', variant: 'success' });
              router.refresh();
            } else {
              toast({ title: 'ล้างข้อมูลไม่สำเร็จ', description: res.error, variant: 'error' });
            }
          }}
        />
      )}
    </div>
  );
}
