import React from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import { Nav } from "./sections/Nav.js";
import { Hero } from "./sections/Hero.js";
import { AppDemo } from "./sections/AppDemo.js";
import { Providers } from "./sections/Providers.js";
import { Features } from "./sections/Features.js";
import { HowItWorks } from "./sections/HowItWorks.js";
import { Privacy } from "./sections/Privacy.js";
import { Pricing } from "./sections/Pricing.js";
import { Faq } from "./sections/Faq.js";
import { Closing, Footer } from "./sections/Closing.js";
import "./site.css";

function Site() {
  return (
    // Reduced-motion visitors get the same page without transforms.
    <MotionConfig reducedMotion="user">
      <Nav />
      <main>
        <Hero />
        <AppDemo />
        <Providers />
        <Features />
        <HowItWorks />
        <Privacy />
        <Pricing />
        <Faq />
        <Closing />
      </main>
      <Footer />
    </MotionConfig>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Site />
  </React.StrictMode>,
);
