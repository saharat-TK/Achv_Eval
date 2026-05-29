/**
 * Shared minimal footer rendered in every authenticated workspace layout.
 */
export default function AppFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-slate-100 bg-white">
      <div className="mx-auto max-w-5xl px-6 py-4 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between text-xs text-slate-400">
        {/* School + copyright */}
        <p>
          สำนักวิชาวิทยาศาสตร์สุขภาพ มหาวิทยาลัยแม่ฟ้าหลวง
          <span className="mx-1.5">·</span>
          &copy;&nbsp;{year}
        </p>

        {/* Version · credit · contact */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span>v0.1&nbsp;·&nbsp;Phase&nbsp;4</span>
          <span className="text-slate-200" aria-hidden>|</span>
          <span>Design &amp; developed by Saharat ARREERAS</span>
          <span className="text-slate-200" aria-hidden>|</span>
          <a
            href="mailto:saharat.arr@mfu.ac.th"
            className="hover:text-mfu-primary transition-colors"
          >
            ติดต่อ
          </a>
        </div>
      </div>
    </footer>
  );
}
