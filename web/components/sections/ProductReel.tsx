/** The 20-second product tour — the full 82s reel hyperlapsed 4x into a fast,
 *  silent autoplay loop (1.8MB, 1080p), framed like the landing's panels.
 *  Muted + playsInline so mobile browsers allow the autoplay. */
export default function ProductReel() {
  return (
    <section aria-label="mrk18 — the product in 20 seconds" className="relative px-6 pb-16 pt-10">
      <div className="mx-auto max-w-6xl">
        {/* liquid-glass mat behind the video — the premium pane the card sits on */}
        <div className="glass rounded-[2rem] p-3 sm:p-5">
          <div className="overflow-hidden rounded-2xl border border-stroke bg-surface shadow-[0_18px_50px_rgba(27,24,21,0.16)]">
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
      </div>
    </section>
  );
}
