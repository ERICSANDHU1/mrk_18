import Image from "next/image";

export default function Footer() {
  return (
    <footer className="border-t border-stroke px-6 py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 md:flex-row">
        <div className="flex items-center gap-3">
          <Image src="/logo.svg" alt="mrk18 logo" width={26} height={20} />
          <span className="text-gradient text-lg font-extrabold tracking-tight">mrk18</span>
        </div>
        <span className="text-[13px] text-muted">your AI CMO</span>
        <span className="text-[13px] text-muted">© 2026</span>
      </div>
    </footer>
  );
}
