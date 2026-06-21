import { useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Navigation } from './sections/Navigation';
import { Hero } from './sections/Hero';
import { WineShowcase } from './sections/WineShowcase';
import { Pricing } from './sections/Pricing';
import { WineryCarousel } from './sections/WineryCarousel';
import { Museum } from './sections/Museum';
import { News } from './sections/News';
import { ContactForm } from './sections/ContactForm';
import { Footer } from './sections/Footer';
import { Preloader } from './components/Preloader';
import { ScrollToTop } from './components/ScrollToTop';
import { WhatsAppChat } from './components/WhatsAppChat';
import { CustomerImport } from './pages/CustomerImport';
import { CustomerResults } from './pages/CustomerResults';
import { CustomerOrders } from './pages/CustomerOrders';
import { CustomerSegments } from './pages/CustomerSegments';
import { CustomerMessagesHub } from './pages/CustomerMessagesHub';
import { CustomerWholesale } from './pages/CustomerWholesale';
import { CustomerWhatsAppOrders } from './pages/CustomerWhatsAppOrders';
import { WaTrackCustomer } from './pages/WaTrackCustomer';
import { WaTrackDriver } from './pages/WaTrackDriver';

function MarketingSite() {
  const [isLoading, setIsLoading] = useState(true);

  const handlePreloaderComplete = useCallback(() => {
    setIsLoading(false);
  }, []);

  return (
    <>
      {isLoading && <Preloader onComplete={handlePreloaderComplete} />}

      <div className={`min-h-screen bg-cream-500 ${isLoading ? 'overflow-hidden max-h-screen' : ''}`}>
        <Navigation />

        <main>
          <Hero isReady={!isLoading} />
          <WineShowcase />
          <Pricing />
          <WineryCarousel />
          <Museum />
          <News />
          <ContactForm />
        </main>

        <Footer />
        <ScrollToTop />
        <WhatsAppChat />
      </div>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/customers" element={<CustomerImport />} />
        <Route path="/customers/orders" element={<CustomerOrders />} />
        <Route path="/customers/segments" element={<CustomerSegments />} />
        <Route path="/customers/messages" element={<CustomerMessagesHub />} />
        <Route path="/customers/wholesale" element={<CustomerWholesale />} />
        <Route path="/customers/whatsapp-orders" element={<CustomerWhatsAppOrders />} />
        <Route path="/track/driver/:token" element={<WaTrackDriver />} />
        <Route path="/track/:orderNumber" element={<WaTrackCustomer />} />
        <Route path="/customers/results" element={<CustomerResults />} />
        <Route path="/customers/campaigns" element={<Navigate to="/customers/messages" replace />} />
        <Route path="/customers/campaign" element={<Navigate to="/customers/messages" replace />} />
        <Route path="/customers/queue" element={<Navigate to="/customers/messages" replace />} />
        <Route path="/*" element={<MarketingSite />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
