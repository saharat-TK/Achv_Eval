'use client';

import { useState } from 'react';

export interface DualListItem {
  id: string;
  code: string;
  nameTh: string;
}

/**
 * Two-column add/remove selector. The available (left) list is supplied by
 * the parent (it can change — e.g. when switching curriculum); the selected
 * (right) list is owned by the parent and persists across those changes.
 * `alreadyOffered` ids are shown with a marker but remain selectable.
 */
export default function DualListSelector({
  available,
  selected,
  alreadyOffered,
  onAdd,
  onRemove,
}: {
  available: DualListItem[];
  selected: DualListItem[];
  alreadyOffered?: Set<string>;
  onAdd: (items: DualListItem[]) => void;
  onRemove: (ids: string[]) => void;
}) {
  const [availChecked, setAvailChecked] = useState<Set<string>>(new Set());
  const [selChecked, setSelChecked] = useState<Set<string>>(new Set());

  const selectedIds = new Set(selected.map((s) => s.id));
  const availableNotSelected = available.filter((a) => !selectedIds.has(a.id));

  function toggle(set: Set<string>, id: string): Set<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  function addChecked() {
    const items = availableNotSelected.filter((a) => availChecked.has(a.id));
    if (items.length) onAdd(items);
    setAvailChecked(new Set());
  }
  function removeChecked() {
    const ids = selected.filter((s) => selChecked.has(s.id)).map((s) => s.id);
    if (ids.length) onRemove(ids);
    setSelChecked(new Set());
  }

  const col =
    'flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white';
  const head = 'border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500';
  const body = 'max-h-72 overflow-y-auto';
  const row = 'flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50';

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
      {/* Available */}
      <div className={col}>
        <div className={head}>รายวิชาที่เลือกได้ ({availableNotSelected.length})</div>
        <div className={body}>
          {availableNotSelected.length === 0 ? (
            <p className="px-3 py-4 text-xs text-slate-400">ไม่มีรายวิชา</p>
          ) : (
            availableNotSelected.map((a) => (
              <label key={a.id} className={row}>
                <input
                  type="checkbox"
                  checked={availChecked.has(a.id)}
                  onChange={() => setAvailChecked((s) => toggle(s, a.id))}
                />
                <span className="font-medium text-slate-700">{a.code}</span>
                <span className="truncate text-slate-500">{a.nameTh}</span>
                {alreadyOffered?.has(a.id) && (
                  <span className="ml-auto shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">
                    เปิดสอนแล้ว
                  </span>
                )}
              </label>
            ))
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-row items-center justify-center gap-2 sm:flex-col">
        <button
          type="button"
          onClick={addChecked}
          disabled={availChecked.size === 0}
          className="rounded-lg bg-mfu-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          เพิ่ม →
        </button>
        <button
          type="button"
          onClick={removeChecked}
          disabled={selChecked.size === 0}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          ← นำออก
        </button>
      </div>

      {/* Selected */}
      <div className={col}>
        <div className={head}>รายวิชาที่จะเปิดสอน ({selected.length})</div>
        <div className={body}>
          {selected.length === 0 ? (
            <p className="px-3 py-4 text-xs text-slate-400">ยังไม่ได้เลือกรายวิชา</p>
          ) : (
            selected.map((s) => (
              <label key={s.id} className={row}>
                <input
                  type="checkbox"
                  checked={selChecked.has(s.id)}
                  onChange={() => setSelChecked((set) => toggle(set, s.id))}
                />
                <span className="font-medium text-slate-700">{s.code}</span>
                <span className="truncate text-slate-500">{s.nameTh}</span>
              </label>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
