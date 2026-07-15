import SmoothScroll from "../components/SmoothScroll";
import Preloader from "../components/Preloader";
import Background3D from "../components/Background3D";
import CursorFluid from "../components/CursorFluid";
import CustomCursor from "../components/CustomCursor";
import ScrollProgress from "../components/ScrollProgress";
import Navbar from "../components/Navbar";
import Marquee from "../components/Marquee";
import TasterHero from "../components/sections/TasterHero";
import ProductReel from "../components/sections/ProductReel";
import HowItWorks from "../components/sections/HowItWorks";
import Features from "../components/sections/Features";
import Pricing from "../components/sections/Pricing";
import Contact from "../components/sections/Contact";
import Footer from "../components/sections/Footer";

export default function Home() {
  return (
    <SmoothScroll>
      {/* bone/greige page backdrop (founder-supplied swatch v2, 2026-07-02) — a soft
          light drift replacing the old flat cream; sits behind the 3D objects */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-30 bg-[linear-gradient(105deg,#d3ccbb_0%,#dcd6c6_50%,#e5dfd1_100%)]"
      />
      <Preloader />
      <Background3D />
      <CursorFluid />
      <CustomCursor />
      <ScrollProgress />
      <Navbar />
      <div className="theme-sand">
        <main className="overflow-x-clip">
          <TasterHero />
          <Marquee items={["ADVISE", "EXAMINE", "EXECUTE", "MRK18"]} variant="gradient" />
          <ProductReel />
          <HowItWorks />
          <Features />
          <Pricing />
          <Contact />
        </main>
        <Footer />
      </div>
    </SmoothScroll>
  );
}
