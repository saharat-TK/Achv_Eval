'use client';

/** Triggers the browser print dialog — used on the print-friendly view. */
export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 print:hidden"
    >
      พิมพ์ / บันทึกเป็น PDF
    </button>
  );
}
