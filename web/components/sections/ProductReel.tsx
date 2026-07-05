/** The 20-second product tour — the full 82s reel hyperlapsed 4x into a fast,
 *  silent autoplay loop (1.8MB, 1080p), framed like the landing's panels.
 *  Muted + playsInline so mobile browsers allow the autoplay. */
export default function ProductReel() {
  return (
    <section aria-label="mrk18 — the product in 20 seconds" className="relative px-6 pb-16 pt-4">
      <div className="mx-auto max-w-6xl">
        <div className="overflow-hidden rounded-2xl border border-stroke bg-surface shadow-[0_28px_80px_rgba(27,24,21,0.2)]">
          <video
            src="/film/mrk18-in-20s.mp4"
            poster="/film/mrk18-in-20s-poster.jpg"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            className="h-auto w-full"
          />
        </div>
      </div>
    </section>
  );
}
