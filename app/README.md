# Villa Template

A luxury wine estate / winery website template featuring elegant animations, a dark theme with gold accents, and a comprehensive section-based layout.

## Features

- **Preloader** with animated brand reveal
- **Navigation** with desktop dropdowns and mobile menu with smooth transitions
- **Hero Section** with Ken Burns background, staggered reveal animations, and count-up statistics
- **Wine Showcase** with tab-based wine selector, animated bottle display with glow effects, feature cards, and quote block
- **Winery Carousel** with auto-advancing slides, Ken Burns effect, and slide indicators
- **Museum Section** with tabbed content, horizontal timeline, founder photo, and year badge
- **News Section** with article grid, testimonials with star ratings, and story section with quote overlay
- **Contact Form** with Formspree integration, contact info cards, and success/error states
- **Footer** with newsletter subscription, social links, link groups, and age verification notice
- **Scroll To Top** floating button
- All sections have scroll-triggered entrance animations (fade-up, slide-in-left, slide-in-right, scale-in)
- Fully responsive design
- All content driven by a single `config.ts` file

## Tech Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS
- Lucide React (icons)
- shadcn/ui components
- Formspree (contact form / newsletter)

## Quick Start

```bash
cd villa
npm install
npm run dev
```

Open `src/config.ts` and fill in all configuration objects with your content. All components render nothing when their primary config fields are empty.

## Configuration

All content is managed in `src/config.ts`. Below is a description of each config object.

### siteConfig

| Field | Type | Description |
|-------|------|-------------|
| title | string | Page title for the browser tab |
| description | string | Meta description for SEO |
| language | string | HTML lang attribute (e.g. `""`) |
| keywords | string | Meta keywords |
| ogImage | string | Open Graph image URL |
| canonical | string | Canonical URL |

### navigationConfig

| Field | Type | Description |
|-------|------|-------------|
| brandName | string | Brand name displayed in the navbar |
| brandSubname | string | Secondary brand name (script font) |
| tagline | string | Small tagline below brand name |
| navLinks | NavLink[] | Navigation links with name, href, icon (string), optional dropdown |
| ctaButtonText | string | CTA button text in the navbar |

### preloaderConfig

| Field | Type | Description |
|-------|------|-------------|
| brandName | string | Main brand name shown during loading |
| brandSubname | string | Script-font subname shown during loading |
| yearText | string | Establishment year text (e.g. "Est. 1887") |

### heroConfig

| Field | Type | Description |
|-------|------|-------------|
| scriptText | string | Decorative script text above title |
| mainTitle | string | Main hero heading |
| ctaButtonText | string | CTA button text |
| ctaTarget | string | CTA scroll target (e.g. "#wines") |
| stats | HeroStat[] | Array of { value: number, suffix: string, label: string } |
| decorativeText | string | Vertical decorative text on the left side |
| backgroundImage | string | Hero background image path |

### wineShowcaseConfig

| Field | Type | Description |
|-------|------|-------------|
| scriptText | string | Script-font section label |
| subtitle | string | Uppercase subtitle |
| mainTitle | string | Section heading |
| wines | Wine[] | Array of wine objects (id, name, subtitle, year, image, filter, glowColor, description, tastingNotes, alcohol, temperature, aging) |
| features | WineFeature[] | Array of { icon: string, title: string, description: string } |
| quote | WineQuote | { text: string, attribution: string, prefix: string } |

### wineryCarouselConfig

| Field | Type | Description |
|-------|------|-------------|
| scriptText | string | Script-font section label |
| subtitle | string | Uppercase subtitle |
| mainTitle | string | Section heading |
| locationTag | string | Location tag text with map pin |
| slides | CarouselSlide[] | Array of { image, title, subtitle, area, unit, description } |

### museumConfig

| Field | Type | Description |
|-------|------|-------------|
| scriptText | string | Script-font section label |
| subtitle | string | Uppercase subtitle |
| mainTitle | string | Section heading |
| introText | string | Introduction paragraph |
| timeline | TimelineEvent[] | Array of { year: string, event: string } |
| tabs | MuseumTab[] | Array of { id, name, icon (string), image, content: { title, description, highlight } } |
| openingHours | string | Opening hours text |
| openingHoursLabel | string | Label for opening hours |
| ctaButtonText | string | CTA button text |
| yearBadge | string | Year displayed in the badge |
| yearBadgeLabel | string | Label below the year badge |
| quote | MuseumQuote | { prefix, text, attribution } |
| founderPhotoAlt | string | Alt text for founder photo |
| founderPhoto | string | Founder photo image path |

### newsConfig

| Field | Type | Description |
|-------|------|-------------|
| scriptText | string | Script-font section label |
| subtitle | string | Uppercase subtitle |
| mainTitle | string | Section heading |
| viewAllText | string | "View all" button text |
| readMoreText | string | "Read more" link text |
| articles | NewsArticle[] | Array of { id, image, title, excerpt, date, category } |
| testimonialsScriptText | string | Testimonials script label |
| testimonialsSubtitle | string | Testimonials subtitle |
| testimonialsMainTitle | string | Testimonials heading |
| testimonials | Testimonial[] | Array of { name, role, text, rating } |
| storyScriptText | string | Story script label |
| storySubtitle | string | Story subtitle |
| storyTitle | string | Story heading |
| storyParagraphs | string[] | Story body paragraphs |
| storyTimeline | StoryTimelineItem[] | Array of { value, label } |
| storyQuote | StoryQuote | { prefix, text, attribution } |
| storyImage | string | Story section image path |
| storyImageCaption | string | Story image alt text |

### contactFormConfig

| Field | Type | Description |
|-------|------|-------------|
| scriptText | string | Script-font section label |
| subtitle | string | Uppercase subtitle |
| mainTitle | string | Section heading |
| introText | string | Intro text below heading |
| contactInfoTitle | string | Contact info sidebar heading |
| contactInfo | ContactInfoItem[] | Array of { icon (string), label, value, subtext } |
| form | ContactFormFields | Object with nameLabel, namePlaceholder, emailLabel, emailPlaceholder, phoneLabel, phonePlaceholder, visitDateLabel, visitorsLabel, visitorsOptions[], messageLabel, messagePlaceholder, submitText, submittingText, successMessage, errorMessage |
| privacyNotice | string | Privacy notice text below form |
| formEndpoint | string | Formspree endpoint URL |

### footerConfig

| Field | Type | Description |
|-------|------|-------------|
| brandName | string | Footer brand name |
| tagline | string | Brand tagline |
| description | string | Brand description paragraph |
| socialLinks | SocialLink[] | Array of { icon (string), label, href } |
| linkGroups | FooterLinkGroup[] | Array of { title, links: [{ name, href }] } |
| contactItems | FooterContactItem[] | Array of { icon (string), text } |
| newsletterLabel | string | Newsletter label text |
| newsletterPlaceholder | string | Newsletter input placeholder |
| newsletterButtonText | string | Newsletter submit button text |
| newsletterSuccessText | string | Success message after subscribing |
| newsletterErrorText | string | Error message if subscription fails |
| newsletterEndpoint | string | Formspree endpoint for newsletter |
| copyrightText | string | Copyright notice text |
| legalLinks | string[] | Array of legal link labels |
| icpText | string | ICP/regulatory text |
| backToTopText | string | Back to top button text |
| ageVerificationText | string | Age verification disclaimer |

### scrollToTopConfig

| Field | Type | Description |
|-------|------|-------------|
| ariaLabel | string | Accessibility label for the scroll-to-top button |

## Required Images

Place the following images in `public/images/`:

| Image | Usage |
|-------|-------|
| hero-banner.jpg | Hero section background |
| wine-bottle.png | Wine showcase bottle image (transparent PNG) |
| slider01.jpg | Winery carousel slide 1 |
| slider02.jpg | Winery carousel slide 2 |
| slider03.jpg | Winery carousel slide 3 |
| museum-tab1.jpg | Museum tab 1 image |
| museum-tab2.jpg | Museum tab 2 image |
| museum-tab3.jpg | Museum tab 3 image |
| museum.jpg | Story section image |
| news01.jpg | News article 1 image |
| news02.jpg | News article 2 image |
| news03.jpg | News article 3 image |
| photo-retro.png | Museum founder photo |

## Design

### Colors

- **Gold palette**: #d2a855 (primary), #dbb977, #e4cb99, #a88644, #7e6533
- **Wine/dark palette**: #141414 (page bg), #0e0e0e, #070707, #1d1d1d
- **Accent**: #c71717 (red)

### Fonts

- **Cormorant Garamond** (serif) - headings and display text
- **Poppins** (sans-serif) - body text
- **Qwitcher Grypen** (script/cursive) - decorative accents

### Animations

- Scroll-triggered entrance animations (fade-up, slide-in-left, slide-in-right, scale-in)
- Ken Burns effect on hero and carousel images
- Count-up statistics in hero
- Staggered reveal sequence in hero (bg -> title -> CTA -> stats)
- Preloader with fade-in/fade-out sequence

## Notes

- All components check for empty config and render nothing if unconfigured
- The `language` field in siteConfig should be set to `""` in the template and populated when deploying
- Icon fields in config use string names (e.g. "Wine", "MapPin") that are resolved via icon lookup maps in each component
- The contact form and newsletter use Formspree endpoints - replace with your own form IDs
- Images should be optimized for web (JPG for photos, PNG for transparent images)
