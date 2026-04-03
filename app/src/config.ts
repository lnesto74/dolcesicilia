// =============================================================================
// DOLCE SICILIA - Premium Tiramisu Brand Configuration
// =============================================================================
// Authentic Sicilian tiramisu, handcrafted daily in Singapore
// Founded by Chef Isabella Romano, third-generation pastry chef from Palermo
// =============================================================================

// -----------------------------------------------------------------------------
// Site Config
// -----------------------------------------------------------------------------
export interface SiteConfig {
  title: string;
  description: string;
  language: string;
  keywords: string;
  ogImage: string;
  canonical: string;
}

export const siteConfig: SiteConfig = {
  title: "Dolce Sicilia | Authentic Sicilian Tiramisu Singapore",
  description: "Handcrafted Sicilian tiramisu made fresh daily by an Italian pastry chef. Delivery across Singapore. Experience layers of obsession.",
  language: "en",
  keywords: "tiramisu singapore, authentic italian dessert, sicilian tiramisu delivery, best tiramisu singapore, artisan dessert",
  ogImage: "/images/hero-tiramisu.jpg",
  canonical: "https://dolcesicilia.sg",
};

// -----------------------------------------------------------------------------
// Navigation Config
// -----------------------------------------------------------------------------
export interface NavDropdownItem {
  name: string;
  href: string;
}

export interface NavLink {
  name: string;
  href: string;
  icon: string;
  dropdown?: NavDropdownItem[];
}

export interface NavigationConfig {
  brandName: string;
  brandSubname: string;
  tagline: string;
  navLinks: NavLink[];
  ctaButtonText: string;
}

export const navigationConfig: NavigationConfig = {
  brandName: "Dolce Sicilia",
  brandSubname: "Sicilia",
  tagline: "A Spoon of Sicily",
  navLinks: [
    { name: "Home", href: "#", icon: "Home" },
    { 
      name: "Our Tiramisu", 
      href: "#collection", 
      icon: "Wine",
      dropdown: [
        { name: "Classico", href: "#collection" },
        { name: "Pistacchio", href: "#collection" },
        { name: "Arance Candite", href: "#collection" },
      ]
    },
    { name: "Sizes & Pricing", href: "#pricing", icon: "ShoppingBag" },
    { name: "Our Story", href: "#story", icon: "BookOpen" },
    { name: "Reviews", href: "#reviews", icon: "Users" },
    { name: "Contact", href: "#contact", icon: "Mail" },
  ],
  ctaButtonText: "Order Now",
};

// -----------------------------------------------------------------------------
// Preloader Config
// -----------------------------------------------------------------------------
export interface PreloaderConfig {
  brandName: string;
  brandSubname: string;
  yearText: string;
}

export const preloaderConfig: PreloaderConfig = {
  brandName: "Dolce Sicilia",
  brandSubname: "",
  yearText: "A Spoon of Sicily",
};

// -----------------------------------------------------------------------------
// Hero Config
// -----------------------------------------------------------------------------
export interface HeroStat {
  value: number;
  suffix: string;
  label: string;
}

export interface HeroConfig {
  scriptText: string;
  mainTitle: string;
  ctaButtonText: string;
  ctaTarget: string;
  stats: HeroStat[];
  decorativeText: string;
  backgroundImage: string;
}

export const heroConfig: HeroConfig = {
  scriptText: "Handcrafted by an Italian. Not inspired—authentic.",
  mainTitle: "Layers of\nObsession",
  ctaButtonText: "Order Your Tiramisu",
  ctaTarget: "#collection",
  stats: [
    { value: 3, suffix: "", label: "Signature Flavors" },
    { value: 100, suffix: "%", label: "Handmade Daily" },
    { value: 30, suffix: "min", label: "Delivery Time" },
  ],
  decorativeText: "Sicilian Craftsmanship",
  backgroundImage: "/images/dolcesicilia-7.png",
};

// -----------------------------------------------------------------------------
// Pricing Config
// -----------------------------------------------------------------------------
export interface PricingPackage {
  id: string;
  name: string;
  size: string;
  price: number;
  priceLabel: string;
  image: string;
  description: string;
  features: string[];
  featured: boolean;
}

export interface PricingConfig {
  scriptText: string;
  subtitle: string;
  mainTitle: string;
  packages: PricingPackage[];
  additionalInfo: string;
}

export const pricingConfig: PricingConfig = {
  scriptText: "Sizes & Pricing",
  subtitle: "PERFECT FOR EVERY OCCASION",
  mainTitle: "Choose Your Indulgence",
  packages: [
    {
      id: "single",
      name: "Single Portion",
      size: "Individual Serving",
      price: 19,
      priceLabel: "Per Portion",
      image: "/images/dolcesicilia-3.png",
      description: "Perfect for one. Handcrafted layers of mascarpone, espresso, and cocoa in an elegant individual serving.",
      features: [
        "200g portion",
        "Made fresh daily",
        "Individual jar packaging",
        "Perfect for personal indulgence"
      ],
      featured: false,
    },
    {
      id: "1kg",
      name: "1kg Party Size",
      size: "Serves 6-8",
      price: 135,
      priceLabel: "Party Size",
      image: "/images/dolcesicilia-5.png",
      description: "Ideal for gatherings, celebrations, or sharing with loved ones. A full kilogram of authentic Sicilian tiramisu.",
      features: [
        "1kg tiramisu",
        "Serves 6-8 people",
        "Beautiful presentation box",
        "Perfect for dinner parties",
        "Complimentary serving spoons"
      ],
      featured: true,
    },
    {
      id: "2kg",
      name: "2kg Party Size",
      size: "Serves 12-16",
      price: 205,
      priceLabel: "Large Party Size",
      image: "/images/dolcesicilia-5.png",
      description: "For grand celebrations. Two kilograms of handcrafted perfection to delight a crowd.",
      features: [
        "2kg tiramisu",
        "Serves 12-16 people",
        "Premium gift packaging",
        "Ideal for events & celebrations",
        "Complimentary serving utensils",
        "Free delivery within Singapore"
      ],
      featured: false,
    },
  ],
  additionalInfo: "All sizes available in Classico, Pistacchio, and Arance Candite flavors. Orders require 24-hour advance notice for optimal freshness.",
};

// -----------------------------------------------------------------------------
// Wine Showcase Config (adapted for Tiramisu Collection)
// -----------------------------------------------------------------------------
export interface Wine {
  id: string;
  name: string;
  subtitle: string;
  year: string;
  image: string;
  filter: string;
  glowColor: string;
  description: string;
  tastingNotes: string;
  alcohol: string;
  temperature: string;
  aging: string;
}

export interface WineFeature {
  icon: string;
  title: string;
  description: string;
}

export interface WineQuote {
  text: string;
  attribution: string;
  prefix: string;
}

export interface WineShowcaseConfig {
  scriptText: string;
  subtitle: string;
  mainTitle: string;
  wines: Wine[];
  features: WineFeature[];
  quote: WineQuote;
}

export const wineShowcaseConfig: WineShowcaseConfig = {
  scriptText: "The Collection",
  subtitle: "THREE SIGNATURE CREATIONS",
  mainTitle: "Our Tiramisu",
  wines: [
    {
      id: "classico",
      name: "Classico",
      subtitle: "The Original",
      year: "1987",
      image: "/images/dsc-1.png",
      filter: "",
      glowColor: "bg-amber-900/20",
      description: "The tiramisu that started it all. Mascarpone cream from Lombardy, espresso-roasted Arabica beans, savoiardi biscuits from Verona, and a dusting of Valrhona cocoa. This is how nonna made it in Palermo.",
      tastingNotes: "Velvety, rich, with perfect coffee-mascarpone balance",
      alcohol: "Marsala wine",
      temperature: "Chilled 4°C",
      aging: "Made fresh daily",
    },
    {
      id: "pistacchio",
      name: "Pistacchio",
      subtitle: "Sicilian Gold",
      year: "2020",
      image: "/images/dsc-2.png",
      filter: "brightness(1.1) sepia(0.2) hue-rotate(30deg) saturate(1.2)",
      glowColor: "bg-green-700/20",
      description: "Bronte pistachios, the green gold of Sicily, blended into silken mascarpone cream. Each spoonful carries the volcanic terroir of Mount Etna. A tribute to my homeland.",
      tastingNotes: "Nutty, creamy, with distinctive pistachio depth",
      alcohol: "Pistachio liqueur",
      temperature: "Chilled 4°C",
      aging: "Made fresh daily",
    },
    {
      id: "arancecandite",
      name: "Arance Candite",
      subtitle: "Sicilian Sunshine",
      year: "2023",
      image: "/images/dsc-3.png",
      filter: "brightness(1.12) sepia(0.15) hue-rotate(-5deg) saturate(1.15)",
      glowColor: "bg-orange-500/20",
      description: "A tribute to Sicily's ancient Arab heritage. Hand-candied Sicilian orange peels, soaked for three days and simmered in sugar syrup, folded into mascarpone cream. Layers of bright citrus balanced with delicate sweetness—tradition preserved in every spoonful.",
      tastingNotes: "Bright citrus with candied sweetness, aromatic orange zest",
      alcohol: "Orange liqueur",
      temperature: "Chilled 4°C",
      aging: "Made fresh daily",
    },
  ],
  features: [
    {
      icon: "Sparkles",
      title: "Fresh Daily",
      description: "Every tiramisu is handcrafted each morning. No preservatives. No shortcuts. Just pure, fresh ingredients.",
    },
    {
      icon: "Thermometer",
      title: "Perfectly Chilled",
      description: "Delivered at optimal 4°C temperature to ensure the cream maintains its signature velvety texture.",
    },
    {
      icon: "Clock",
      title: "30-Min Delivery",
      description: "From our kitchen to your door in 30 minutes. Because fresh tiramisu waits for no one.",
    },
  ],
  quote: {
    prefix: "La Dolce Vita",
    text: "Tiramisu is not dessert. It is a pause. A moment where nothing matters but this—the first spoonful, the texture, the memory it carries. This is why we make it by hand.",
    attribution: "Chef Enzo Caruso",
  },
};

// -----------------------------------------------------------------------------
// Winery Carousel Config (adapted for Experience/Delivery)
// -----------------------------------------------------------------------------
export interface CarouselSlide {
  image: string;
  title: string;
  subtitle: string;
  area: string;
  unit: string;
  description: string;
}

export interface WineryCarouselConfig {
  scriptText: string;
  subtitle: string;
  mainTitle: string;
  locationTag: string;
  slides: CarouselSlide[];
}

export const wineryCarouselConfig: WineryCarouselConfig = {
  scriptText: "The Experience",
  subtitle: "FROM SICILY TO SINGAPORE",
  mainTitle: "How It Works",
  locationTag: "Delivering across Singapore",
  slides: [
    {
      image: "/images/kitchen-scene.jpg",
      title: "Handcrafted",
      subtitle: "Every Morning",
      area: "5AM",
      unit: "Start",
      description: "Chef Isabella begins her day at dawn, whisking mascarpone, brewing espresso, and layering each tiramisu by hand. The same recipe her grandmother taught her in Palermo.",
    },
    {
      image: "/images/spoon-moment.jpg",
      title: "Perfectly",
      subtitle: "Portioned",
      area: "200g",
      unit: "Each",
      description: "Individual portions designed for one—or for sharing, if you're feeling generous. Each jar is sealed to lock in freshness and flavor until the first spoonful.",
    },
    {
      image: "/images/The-Chiesa-di-San-Michele-Arcangelo-in-Scicli-Sicily.jpg",
      title: "Delivered",
      subtitle: "Fresh & Fast",
      area: "30",
      unit: "Minutes",
      description: "Our temperature-controlled delivery ensures your tiramisu arrives perfectly chilled. From our kitchen to your doorstep—Sicilian craftsmanship, Singapore convenience.",
    },
  ],
};

// -----------------------------------------------------------------------------
// Museum Config (adapted for Our Story)
// -----------------------------------------------------------------------------
export interface TimelineEvent {
  year: string;
  event: string;
}

export interface MuseumTabContent {
  title: string;
  description: string;
  highlight: string;
}

export interface MuseumTab {
  id: string;
  name: string;
  icon: string;
  image: string;
  content: MuseumTabContent;
}

export interface MuseumQuote {
  prefix: string;
  text: string;
  attribution: string;
}

export interface MuseumConfig {
  scriptText: string;
  subtitle: string;
  mainTitle: string;
  introText: string;
  timeline: TimelineEvent[];
  tabs: MuseumTab[];
  openingHours: string;
  openingHoursLabel: string;
  ctaButtonText: string;
  yearBadge: string;
  yearBadgeLabel: string;
  quote: MuseumQuote;
  founderPhotoAlt: string;
  founderPhoto: string;
}

export const museumConfig: MuseumConfig = {
  scriptText: "The Journey",
  subtitle: "FROM SICILY TO SINGAPORE",
  mainTitle: "A Story in Silence",
  introText: "I did not learn pastry in a school. I learned it in silence.\n\nIn Sicily, desserts are not written down. They are remembered. Passed from hands to hands, from mornings to evenings, from one generation to the next.",
  timeline: [
    { year: "Sicily", event: "Learned through watching, not words" },
    { year: "Europe", event: "Refined through discipline" },
    { year: "Asia", event: "Found respect for craft" },
    { year: "Singapore", event: "Tradition breathes again" },
  ],
  tabs: [
    {
      id: "heritage",
      name: "The Beginning",
      icon: "History",
      image: "/images/story.png",
      content: {
        title: "In Sicily, Time is an Ingredient",
        description: "In my childhood, I watched more than I spoke. Cream folding into coffee. Almonds ground slowly, patiently. Nothing rushed. Nothing wasted. But life does not stay in one place.",
        highlight: "Memory, not recipes",
      },
    },
    {
      id: "craft",
      name: "The Journey",
      icon: "BookOpen",
      image: "/images/story.png",
      content: {
        title: "Finding Balance",
        description: "I left the island carrying very little—no recipes, only memory. No certainty, only direction. I worked in kitchens far from home, where everything moved faster, cleaner, sharper. Where discipline was different. Where perfection was expected, not hoped for.",
        highlight: "Refined by the world",
      },
    },
    {
      id: "ingredients",
      name: "The Purpose",
      icon: "Award",
      image: "/images/story.png",
      content: {
        title: "Craftsmanship Without Borders",
        description: "In Asia, I found a quiet dedication to craft. A belief that doing something well is a form of respect. Singapore became the place where my journey found balance. Here, tradition could breathe again—not as nostalgia, but as something alive.",
        highlight: "Served with purpose",
      },
    },
  ],
  openingHours: "Order 10:00 AM - 9:00 PM",
  openingHoursLabel: "Daily Ordering",
  ctaButtonText: "Order Now",
  yearBadge: "Sicily",
  yearBadgeLabel: "To Singapore",
  quote: {
    prefix: "",
    text: "Dolce Sicilia is not about reinventing tiramisu. It is about protecting its soul, while allowing it to travel. Each layer carries a memory—of Sicily, of distance, of discipline. Lighter. Cleaner. Intentional. But never disconnected from where it began.",
    attribution: "Chef",
  },
  founderPhotoAlt: "The story of Dolce Sicilia",
  founderPhoto: "/images/story.png",
};

// -----------------------------------------------------------------------------
// News Config (adapted for Testimonials & Social Proof)
// -----------------------------------------------------------------------------
export interface NewsArticle {
  id: number;
  image: string;
  title: string;
  excerpt: string;
  date: string;
  category: string;
}

export interface Testimonial {
  name: string;
  role: string;
  text: string;
  rating: number;
}

export interface StoryQuote {
  prefix: string;
  text: string;
  attribution: string;
}

export interface StoryTimelineItem {
  value: string;
  label: string;
}

export interface NewsConfig {
  scriptText: string;
  subtitle: string;
  mainTitle: string;
  viewAllText: string;
  readMoreText: string;
  articles: NewsArticle[];
  testimonialsScriptText: string;
  testimonialsSubtitle: string;
  testimonialsMainTitle: string;
  testimonials: Testimonial[];
  storyScriptText: string;
  storySubtitle: string;
  storyTitle: string;
  storyParagraphs: string[];
  storyTimeline: StoryTimelineItem[];
  storyQuote: StoryQuote;
  storyImage: string;
  storyImageCaption: string;
}

export const newsConfig: NewsConfig = {
  scriptText: "Stories",
  subtitle: "FROM OUR TABLE TO YOURS",
  mainTitle: "Loved by Many",
  viewAllText: "Explore More Stories",
  readMoreText: "Continue Reading",
  articles: [
    {
      id: 1,
      image: "/images/dolcesicilia-5.png",
      title: "A Taste That Travels Back to Italy",
      excerpt: "There is a moment, when the first spoonful touches your tongue, when time bends. The Classico does this—mascarpone so airy it barely registers as weight, espresso that lingers just long enough, cocoa that whispers rather than shouts. Chef Enzo Caruso's hand is felt in the restraint, in what is left unsaid. This is memory made edible.",
      date: "Winter 2024",
      category: "Feature",
    },
    {
      id: 2,
      image: "/images/dolcesicilia-6.png",
      title: "The Green Gold of Mount Etna",
      excerpt: "Bronte pistachios carry the volcanic soil in their flavor—earthy, intense, irreplaceable. Most tiramisu substitutes compromise. Enzo does not. Each nut is hand-selected, ground slowly to preserve its oils, folded into cream with the precision of a man who learned patience in Sicily and perfected it abroad. The result is not fusion. It is evolution.",
      date: "Autumn 2024",
      category: "Craft",
    },
    {
      id: 3,
      image: "/images/dolcesicilia-8.png",
      title: "When Freshness Arrives at Your Door",
      excerpt: "In a city that never slows, quality delivered at speed feels radical. The 30-minute window is not a gimmick—it is engineering. Temperature-controlled transport, routes mapped to precision, timing calibrated to the minute. The tiramisu arrives as it should: cold, pristine, ready. Modern life, met with old-world standards.",
      date: "Late Summer 2024",
      category: "Experience",
    },
    {
      id: 4,
      image: "/images/dolcesicilia-9.png",
      title: "Craftsmanship in Every Layer",
      excerpt: "There are desserts made for volume, and desserts made for one person at a time. Dolce Sicilia is the latter. No industrial mixers. No shortcuts through chemistry. Each mascarpone fold is deliberate, each cocoa dusting applied by hand. Enzo's training—Palermo to Paris, Singapore to refinement—shows in what cannot be rushed. You taste the hours in the lightness.",
      date: "Summer 2024",
      category: "Artisan",
    },
  ],
  testimonialsScriptText: "Voices",
  testimonialsSubtitle: "WORDS FROM OUR GUESTS",
  testimonialsMainTitle: "What They Say",
  testimonials: [
    {
      name: "Cheryl Wong",
      role: "Home Cook, Singapore",
      text: "I thought I understood tiramisu until I tried Enzo's. The mascarpone doesn't sit heavy—it dissolves. The coffee lingers without bitterness. I've stopped trying to replicate it at home. Some things are meant to be left to those who know.",
      rating: 5,
    },
    {
      name: "Luca Ferretti",
      role: "From Bologna, Now Singapore",
      text: "When I opened the box, I smelled home. Not the sugary versions sold as 'Italian' here—the real thing. Balanced, restrained, respectful of the ingredients. Enzo trained where it matters. You can taste that.",
      rating: 5,
    },
    {
      name: "Priya Menon",
      role: "Monthly Subscriber",
      text: "Every third Friday. The Classico arrives at 7 PM, cold as it should be, wrapped carefully. It's become part of how I end my week. The consistency is what keeps me coming back—not just the flavor, but the reliability. That's rare.",
      rating: 5,
    },
  ],
  storyScriptText: "The Path",
  storySubtitle: "FROM SILENCE TO SINGAPORE",
  storyTitle: "Crafted with Intent",
  storyParagraphs: [
    "Every morning, before the city stirs, the work begins. Egg yolks and sugar, whisked until they hold light. Mascarpone folded with the care learned in kitchens where precision is not optional. Espresso brewed dark and deliberate, each shot timed to the second.",
    "This is not theater. This is discipline shaped by years across continents—Sicily's patience, Europe's rigor, Asia's respect for craft. When you taste Dolce Sicilia, you are not tasting invention. You are tasting continuity.",
  ],
  storyTimeline: [
    { value: "50,000+", label: "Portions Served" },
    { value: "4.9", label: "Guest Rating" },
    { value: "30", label: "Min Delivery" },
  ],
  storyQuote: {
    prefix: "",
    text: "I do not compromise. Every portion that leaves this kitchen carries my name, my training, and the memory of those who taught me. That is the contract.",
    attribution: "Chef Enzo Caruso",
  },
  storyImage: "/images/dolcesicilia-10.png",
  storyImageCaption: "Chef Isabella in her Singapore kitchen",
};

// -----------------------------------------------------------------------------
// Contact Form Config
// -----------------------------------------------------------------------------
export interface ContactInfoItem {
  icon: string;
  label: string;
  value: string;
  subtext: string;
}

export interface ContactFormFields {
  nameLabel: string;
  namePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  phoneLabel: string;
  phonePlaceholder: string;
  visitDateLabel: string;
  visitorsLabel: string;
  visitorsOptions: string[];
  messageLabel: string;
  messagePlaceholder: string;
  submitText: string;
  submittingText: string;
  successMessage: string;
  errorMessage: string;
}

export interface ContactFormConfig {
  scriptText: string;
  subtitle: string;
  mainTitle: string;
  introText: string;
  contactInfoTitle: string;
  contactInfo: ContactInfoItem[];
  form: ContactFormFields;
  privacyNotice: string;
  formEndpoint: string;
}

export const contactFormConfig: ContactFormConfig = {
  scriptText: "Get in Touch",
  subtitle: "WE'D LOVE TO HEAR FROM YOU",
  mainTitle: "Contact Us",
  introText: "Have a question about our tiramisu? Want to place a large order for an event? Or just want to say ciao? We'd love to hear from you.",
  contactInfoTitle: "How to Reach Us",
  contactInfo: [
    {
      icon: "MapPin",
      label: "Kitchen Location",
      value: "Tanjong Pagar, Singapore",
      subtext: "Pickup available by appointment",
    },
    {
      icon: "Phone",
      label: "Phone / WhatsApp",
      value: "+65 9123 4567",
      subtext: "Daily 10:00 AM - 9:00 PM",
    },
    {
      icon: "Mail",
      label: "Email",
      value: "ciao@dolcesicilia.sg",
      subtext: "We reply within 24 hours",
    },
    {
      icon: "Clock",
      label: "Ordering Hours",
      value: "10:00 AM - 9:00 PM",
      subtext: "Daily, including weekends",
    },
  ],
  form: {
    nameLabel: "Your Name",
    namePlaceholder: "Enter your name",
    emailLabel: "Email Address",
    emailPlaceholder: "your@email.com",
    phoneLabel: "Phone Number",
    phonePlaceholder: "+65 XXXX XXXX",
    visitDateLabel: "Preferred Delivery Date",
    visitorsLabel: "How Many Portions?",
    visitorsOptions: ["1-2", "3-5", "6-10", "10-20", "20+"],
    messageLabel: "Your Message",
    messagePlaceholder: "Tell us what you need...",
    submitText: "Send Message",
    submittingText: "Sending...",
    successMessage: "Grazie! We'll be in touch soon.",
    errorMessage: "Something went wrong. Please try again.",
  },
  privacyNotice: "By submitting this form, you agree to our privacy policy. We never share your information.",
  formEndpoint: "https://formspree.io/f/YOUR_FORM_ID",
};

// -----------------------------------------------------------------------------
// Footer Config
// -----------------------------------------------------------------------------
export interface SocialLink {
  icon: string;
  label: string;
  href: string;
}

export interface FooterLink {
  name: string;
  href: string;
}

export interface FooterLinkGroup {
  title: string;
  links: FooterLink[];
}

export interface FooterContactItem {
  icon: string;
  text: string;
}

export interface FooterConfig {
  brandName: string;
  tagline: string;
  description: string;
  socialLinks: SocialLink[];
  linkGroups: FooterLinkGroup[];
  contactItems: FooterContactItem[];
  newsletterLabel: string;
  newsletterPlaceholder: string;
  newsletterButtonText: string;
  newsletterSuccessText: string;
  newsletterErrorText: string;
  newsletterEndpoint: string;
  copyrightText: string;
  legalLinks: string[];
  icpText: string;
  backToTopText: string;
  ageVerificationText: string;
}

export const footerConfig: FooterConfig = {
  brandName: "Dolce Sicilia",
  tagline: "A Spoon of Sicily",
  description: "Handcrafted Sicilian tiramisu made fresh daily by Chef Isabella Romano. Delivery across Singapore. Experience layers of obsession.",
  socialLinks: [
    { icon: "Instagram", label: "Instagram", href: "https://instagram.com/dolcesicilia.sg" },
    { icon: "Facebook", label: "Facebook", href: "https://facebook.com/dolcesicilia.sg" },
  ],
  linkGroups: [
    {
      title: "Our Collection",
      links: [
        { name: "Classico", href: "#collection" },
        { name: "Pistacchio", href: "#collection" },
        { name: "Arance Candite", href: "#collection" },
      ],
    },
    {
      title: "Company",
      links: [
        { name: "Our Story", href: "#story" },
        { name: "Reviews", href: "#reviews" },
        { name: "Contact", href: "#contact" },
        { name: "Careers", href: "#" },
      ],
    },
  ],
  contactItems: [
    { icon: "MapPin", text: "Tanjong Pagar, Singapore" },
    { icon: "Phone", text: "+65 9123 4567" },
    { icon: "Mail", text: "ciao@dolcesicilia.sg" },
  ],
  newsletterLabel: "Join Our Sweet List",
  newsletterPlaceholder: "your@email.com",
  newsletterButtonText: "Subscribe",
  newsletterSuccessText: "Grazie! You're on the list.",
  newsletterErrorText: "Something went wrong. Please try again.",
  newsletterEndpoint: "https://formspree.io/f/YOUR_NEWSLETTER_ID",
  copyrightText: "© 2024 Dolce Sicilia. All rights reserved.",
  legalLinks: ["Privacy Policy", "Terms of Service"],
  icpText: "",
  backToTopText: "Back to Top",
  ageVerificationText: "",
};

// -----------------------------------------------------------------------------
// Scroll To Top Config
// -----------------------------------------------------------------------------
export interface ScrollToTopConfig {
  ariaLabel: string;
}

export const scrollToTopConfig: ScrollToTopConfig = {
  ariaLabel: "Back to top",
};
