'use client';

import { useState } from 'react';

export interface DualListItem {
  id: string;
  code: string;
  nameTh: string;
}

type SelectionStyle = 'checkbox' | 'row';

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
  availableTitle = 'รายวิชาที่เลือกได้',
  selectedTitle = 'รายวิชาที่จะเปิดสอน',
  emptyAvailableText = 'ไม่มีรายวิชา',
  emptySelectedText = 'ยังไม่ได้เลือกรายวิชา',
  showCode = true,
  selectionStyle = 'checkbox',
  onAdd,
  onRemove,
}: {
  available: DualListItem[];
  selected: DualListItem[];
  alreadyOffered?: Set<string>;
  availableTitle?: string;
  selectedTitle?: string;
  emptyAvailableText?: string;
  emptySelectedText?: string;
  showCode?: boolean;
  selectionStyle?: SelectionStyle;
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
  const rowButton =
    'flex w-full items-center gap-2 border-l-4 px-3 py-1.5 text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-mfu-primary/40';
  const rowSelected =
    'border-l-[#00704A] bg-[#00704A]/10 text-[#00704A] hover:bg-[#00704A]/15';
  const rowUnselected =
    'border-l-transparent bg-white text-slate-700 hover:bg-slate-50';

  function renderItem(item: DualListItem) {
    return showCode ? (
      <>
        <span className="font-medium">{item.code}</span>
        <span className="truncate text-slate-500">{item.nameTh}</span>
      </>
    ) : (
      <span className="truncate font-medium">{item.nameTh || item.code}</span>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
      {/* Available */}
      <div className={col}>
        <div className={head}>{availableTitle} ({availableNotSelected.length})</div>
        <div className={body}>
          {availableNotSelected.length === 0 ? (
            <p className="px-3 py-4 text-xs text-slate-400">{emptyAvailableText}</p>
          ) : (
            availableNotSelected.map((a) => {
              const checked = availChecked.has(a.id);
              return selectionStyle === 'row' ? (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => setAvailChecked((s) => toggle(s, a.id))}
                  className={`${rowButton} ${checked ? rowSelected : rowUnselected}`}
                >
                  {renderItem(a)}
                  {alreadyOffered?.has(a.id) && (
                    <span className="ml-auto shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">
                      เปิดสอนแล้ว
                    </span>
                  )}
                </button>
              ) : (
                <label key={a.id} className={row}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setAvailChecked((s) => toggle(s, a.id))}
                  />
                  <span className="text-slate-700">{renderItem(a)}</span>
                  {alreadyOffered?.has(a.id) && (
                    <span className="ml-auto shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">
                      เปิดสอนแล้ว
                    </span>
                  )}
                </label>
              );
            })
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
        <div className={head}>{selectedTitle} ({selected.length})</div>
        <div className={body}>
          {selected.length === 0 ? (
            <p className="px-3 py-4 text-xs text-slate-400">{emptySelectedText}</p>
          ) : (
            selected.map((s) => {
              const checked = selChecked.has(s.id);
              return selectionStyle === 'row' ? (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => setSelChecked((set) => toggle(set, s.id))}
                  className={`${rowButton} ${checked ? rowSelected : rowUnselected}`}
                >
                  {renderItem(s)}
                </button>
              ) : (
                <label key={s.id} className={row}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setSelChecked((set) => toggle(set, s.id))}
                  />
                  <span className="text-slate-700">{renderItem(s)}</span>
                </label>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
