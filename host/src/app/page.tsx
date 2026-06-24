import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { TrustStrip } from "@/components/TrustStrip";
import { WhyHost } from "@/components/WhyHost";
import { Calculator } from "@/components/Calculator";
import { ProductRange } from "@/components/ProductRange";
import { HowItWorks } from "@/components/HowItWorks";
import { Reward } from "@/components/Reward";
import { IdealFor } from "@/components/IdealFor";
import { WhatWeNeed } from "@/components/WhatWeNeed";
import { FAQ } from "@/components/FAQ";
import { HostContact } from "@/components/HostContact";
import { Footer } from "@/components/Footer";
import { StickyBottomBar } from "@/components/StickyBottomBar";
import { WhatsAppFab } from "@/components/WhatsAppFab";

export default function HomePage() {
  return (
    <>
      <Header />
      <main className="pb-20 sm:pb-0">
        <Hero />
        <TrustStrip />
        <WhyHost />
        <Calculator />
        <ProductRange />
        <HowItWorks />
        <Reward />
        <IdealFor />
        <WhatWeNeed />
        <FAQ />
        <HostContact />
      </main>
      <Footer />
      <StickyBottomBar />
      <WhatsAppFab />
    </>
  );
}
