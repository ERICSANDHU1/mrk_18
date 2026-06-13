import SmoothScroll from "../components/SmoothScroll";
import Preloader from "../components/Preloader";
import Background3D from "../components/Background3D";
import CustomCursor from "../components/CustomCursor";
import ScrollProgress from "../components/ScrollProgress";
import Navbar from "../components/Navbar";
import Marquee from "../components/Marquee";
import Hero from "../components/sections/Hero";
import Problem from "../components/sections/Problem";
import HowItWorks from "../components/sections/HowItWorks";
import Features from "../components/sections/Features";
import Pricing from "../components/sections/Pricing";
import Contact from "../components/sections/Contact";
import Footer from "../components/sections/Footer";

export default function Home() {
  return (
    <SmoothScroll>
      <Preloader />
      <Background3D />
      <CustomCursor />
      <ScrollProgress />
      <Navbar />
      <main className="overflow-x-clip">
        <Hero />
        <Marquee items={["ADVISE", "WATCHDOG", "EXECUTE", "MRK18"]} variant="gradient" />
        <Problem />
        <HowItWorks />
        <Features />
        <Pricing />
        <Contact />
      </main>
      <Footer />
    </SmoothScroll>
  );
}
