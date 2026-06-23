import SmoothScroll from "../components/SmoothScroll";
import Preloader from "../components/Preloader";
import Background3D from "../components/Background3D";
import CursorFluid from "../components/CursorFluid";
import CustomCursor from "../components/CustomCursor";
import ScrollProgress from "../components/ScrollProgress";
import Navbar from "../components/Navbar";
import Marquee from "../components/Marquee";
import Hero from "../components/sections/Hero";
import DeviceShowcase from "../components/device/DeviceShowcase";
import HowItWorks from "../components/sections/HowItWorks";
import Features from "../components/sections/Features";
import Pricing from "../components/sections/Pricing";
import Contact from "../components/sections/Contact";
import Footer from "../components/sections/Footer";

export default function Home() {
  return (
    <SmoothScroll>
      {/* warm cream page backdrop ("Warm sand" Background) — sits behind the floating 3D objects */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-30 bg-[#f3ecdc]" />
      <Preloader />
      <Background3D />
      <CursorFluid />
      <CustomCursor />
      <ScrollProgress />
      <Navbar />
      <div className="theme-sand">
        <main className="overflow-x-clip">
          <Hero />
          <Marquee items={["ADVISE", "WATCHDOG", "EXECUTE", "MRK18"]} variant="gradient" />
          <DeviceShowcase />
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
