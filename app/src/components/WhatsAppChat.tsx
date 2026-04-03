import { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, ArrowLeft } from 'lucide-react';

const PHONE_NUMBER = '6591329303';

type Step = 'welcome' | 'flavor' | 'size' | 'quantity' | 'address' | 'confirm';

interface OrderState {
  flavor: string;
  size: string;
  price: number;
  quantity: number;
  address: string;
}

interface ChatMessage {
  from: 'bot' | 'user';
  text: string;
}

const FLAVORS = ['Classico', 'Pistacchio', 'Arance Candite'];

const SIZES = [
  { label: 'Single Portion (200g)', value: 'Single Portion', price: 19 },
  { label: '1kg Party Size (6-8 pax)', value: '1kg Party Size', price: 135 },
  { label: '2kg Party Size (12-16 pax)', value: '2kg Party Size', price: 205 },
];

const QUANTITIES = [1, 2, 3, 4, 5];

export function WhatsAppChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<Step>('welcome');
  const [order, setOrder] = useState<OrderState>({
    flavor: '',
    size: '',
    price: 0,
    quantity: 1,
    address: '',
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [addressInput, setAddressInput] = useState('');
  const [showPulse, setShowPulse] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, step]);

  useEffect(() => {
    const timer = setTimeout(() => setShowPulse(false), 8000);
    return () => clearTimeout(timer);
  }, []);

  const addBotMessage = (text: string) => {
    setMessages(prev => [...prev, { from: 'bot', text }]);
  };

  const addUserMessage = (text: string) => {
    setMessages(prev => [...prev, { from: 'user', text }]);
  };

  const handleOpen = () => {
    setIsOpen(true);
    setShowPulse(false);
    if (messages.length === 0) {
      setMessages([
        { from: 'bot', text: 'Ciao! 🇮🇹 Welcome to Dolce Sicilia.' },
        { from: 'bot', text: "I'll help you place your tiramisu order. Let's start — which flavor would you like?" },
      ]);
      setStep('flavor');
    }
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleRestart = () => {
    setMessages([
      { from: 'bot', text: 'Ciao! 🇮🇹 Welcome to Dolce Sicilia.' },
      { from: 'bot', text: "I'll help you place your tiramisu order. Let's start — which flavor would you like?" },
    ]);
    setStep('flavor');
    setOrder({ flavor: '', size: '', price: 0, quantity: 1, address: '' });
    setAddressInput('');
  };

  const selectFlavor = (flavor: string) => {
    addUserMessage(flavor);
    setOrder(prev => ({ ...prev, flavor }));
    setTimeout(() => {
      addBotMessage(`Great choice! ${flavor} it is. 🍰`);
      setTimeout(() => {
        addBotMessage('What size would you like?');
        setStep('size');
      }, 400);
    }, 300);
  };

  const selectSize = (label: string, value: string, price: number) => {
    addUserMessage(label);
    setOrder(prev => ({ ...prev, size: value, price }));
    setTimeout(() => {
      addBotMessage(`${value} — perfect! How many would you like?`);
      setStep('quantity');
    }, 400);
  };

  const selectQuantity = (qty: number) => {
    addUserMessage(`${qty}`);
    setOrder(prev => ({ ...prev, quantity: qty }));
    setTimeout(() => {
      addBotMessage(`${qty} × noted! 📝`);
      setTimeout(() => {
        addBotMessage('Where should we deliver? Please type your address below.');
        setStep('address');
      }, 400);
    }, 300);
  };

  const submitAddress = () => {
    const addr = addressInput.trim();
    if (!addr) return;
    addUserMessage(addr);
    setOrder(prev => ({ ...prev, address: addr }));
    setAddressInput('');
    setTimeout(() => {
      const total = order.price * order.quantity;
      addBotMessage(
        `Here's your order summary:\n\n` +
        `🍰 ${order.flavor} — ${order.size}\n` +
        `📦 Qty: ${order.quantity}\n` +
        `💰 Total: $${total}\n` +
        `📍 Deliver to: ${addr}\n\n` +
        `Shall I send this to our WhatsApp?`
      );
      setStep('confirm');
    }, 400);
  };

  const handleConfirm = () => {
    const total = order.price * order.quantity;
    const text = encodeURIComponent(
      `Hi Dolce Sicilia! I'd like to order:\n\n` +
      `🍰 Flavor: ${order.flavor}\n` +
      `📦 Size: ${order.size}\n` +
      `🔢 Quantity: ${order.quantity}\n` +
      `💰 Total: $${total}\n` +
      `📍 Delivery Address: ${order.address}\n\n` +
      `Thank you!`
    );
    window.open(`https://wa.me/${PHONE_NUMBER}?text=${text}`, '_blank');
    addUserMessage('Yes, send it!');
    setTimeout(() => {
      addBotMessage('Opening WhatsApp now… Grazie! 🙏');
    }, 300);
  };

  return (
    <>
      {/* Chat Window */}
      <div
        className={`fixed bottom-24 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[370px] transition-all duration-300 origin-bottom-right ${
          isOpen
            ? 'scale-100 opacity-100 visible'
            : 'scale-95 opacity-0 invisible pointer-events-none'
        }`}
      >
        <div className="rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: 'min(520px, calc(100vh - 160px))' }}>
          {/* Header */}
          <div className="bg-[#075E54] text-white px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">DS</div>
              <div>
                <div className="font-semibold text-sm leading-tight">Dolce Sicilia</div>
                <div className="text-[11px] text-white/70">Typically replies instantly</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {step !== 'flavor' && step !== 'welcome' && (
                <button
                  onClick={handleRestart}
                  className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
                  aria-label="Start over"
                  title="Start over"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={handleClose}
                className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
                aria-label="Close chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto px-3 py-4 space-y-2"
            style={{
              backgroundColor: '#ECE5DD',
              backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cdefs%3E%3Cpattern id=\'p\' width=\'40\' height=\'40\' patternUnits=\'userSpaceOnUse\'%3E%3Cpath d=\'M0 20h40M20 0v40\' stroke=\'%23d5cfc4\' stroke-width=\'.3\' fill=\'none\'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width=\'200\' height=\'200\' fill=\'url(%23p)\'/%3E%3C/svg%3E")',
            }}
          >
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-lg text-[13px] leading-relaxed shadow-sm whitespace-pre-line ${
                    msg.from === 'user'
                      ? 'bg-[#DCF8C6] text-gray-800 rounded-tr-none'
                      : 'bg-white text-gray-800 rounded-tl-none'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}

            {/* Option buttons rendered inline */}
            {step === 'flavor' && (
              <div className="flex flex-col gap-1.5 pt-1">
                {FLAVORS.map(f => (
                  <button
                    key={f}
                    onClick={() => selectFlavor(f)}
                    className="self-start bg-white border border-[#075E54]/20 text-[#075E54] text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#075E54] hover:text-white transition-colors shadow-sm"
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}

            {step === 'size' && (
              <div className="flex flex-col gap-1.5 pt-1">
                {SIZES.map(s => (
                  <button
                    key={s.value}
                    onClick={() => selectSize(s.label, s.value, s.price)}
                    className="self-start bg-white border border-[#075E54]/20 text-[#075E54] text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#075E54] hover:text-white transition-colors shadow-sm"
                  >
                    {s.label} — ${s.price}
                  </button>
                ))}
              </div>
            )}

            {step === 'quantity' && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {QUANTITIES.map(q => (
                  <button
                    key={q}
                    onClick={() => selectQuantity(q)}
                    className="bg-white border border-[#075E54]/20 text-[#075E54] text-[13px] font-medium w-10 h-10 rounded-lg hover:bg-[#075E54] hover:text-white transition-colors shadow-sm"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {step === 'confirm' && (
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleConfirm}
                  className="bg-[#25D366] text-white text-[13px] font-semibold px-5 py-2.5 rounded-lg hover:bg-[#1ebe57] transition-colors shadow-sm flex items-center gap-2"
                >
                  <Send className="w-3.5 h-3.5" />
                  Send via WhatsApp
                </button>
                <button
                  onClick={handleRestart}
                  className="bg-white border border-gray-300 text-gray-600 text-[13px] px-4 py-2.5 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                >
                  Start Over
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Address Input */}
          {step === 'address' && (
            <div className="bg-white px-3 py-2.5 flex gap-2 border-t border-gray-200 shrink-0">
              <input
                type="text"
                value={addressInput}
                onChange={e => setAddressInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submitAddress()}
                placeholder="Type your delivery address..."
                className="flex-1 text-[13px] px-3 py-2 rounded-full bg-gray-100 border-none outline-none focus:ring-1 focus:ring-[#075E54]/30 text-gray-800 placeholder:text-gray-400"
                autoFocus
              />
              <button
                onClick={submitAddress}
                disabled={!addressInput.trim()}
                className="w-9 h-9 rounded-full bg-[#075E54] text-white flex items-center justify-center hover:bg-[#064e46] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                aria-label="Send address"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Floating Button */}
      <button
        onClick={isOpen ? handleClose : handleOpen}
        className="fixed bottom-6 right-4 sm:right-6 z-50 w-14 h-14 rounded-full bg-[#25D366] text-white shadow-lg hover:bg-[#1ebe57] hover:shadow-xl transition-all duration-300 flex items-center justify-center hover:scale-105 active:scale-95"
        aria-label={isOpen ? 'Close WhatsApp chat' : 'Open WhatsApp chat'}
      >
        {isOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <MessageCircle className="w-6 h-6" />
        )}
        {showPulse && !isOpen && (
          <span className="absolute inset-0 rounded-full bg-[#25D366] animate-ping opacity-30" />
        )}
      </button>
    </>
  );
}
