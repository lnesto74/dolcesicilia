# Dolce Sicilia - Authentic Sicilian Tiramisu

Handcrafted Sicilian tiramisu made fresh daily by Chef Isabella Romano. Delivery across Singapore.

## 🍰 Features

- **Three Signature Creations**: Classico, Pistacchio, and Arance Candite
- **Handmade Daily**: 100% handcrafted with premium imported ingredients
- **Fast Delivery**: 30-minute delivery across Singapore
- **Authentic Recipes**: Third-generation Sicilian pastry chef recipes

## 🚀 Deploying to Vercel

### Prerequisites

- GitHub account
- Vercel account (free tier available at https://vercel.com)

### Deployment Steps

#### 1. Initialize Git Repository

```bash
git init
git add .
git commit -m "Initial commit: Dolce Sicilia website"
```

#### 2. Create GitHub Repository

1. Go to https://github.com/new
2. Create a new repository (e.g., "dolcesicilia")
3. **Do NOT** initialize with README, .gitignore, or license

#### 3. Push to GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/dolcesicilia.git
git branch -M main
git push -u origin main
```

#### 4. Deploy to Vercel

**Option A: Using Vercel Dashboard (Recommended)**

1. Go to https://vercel.com and sign in
2. Click "Add New" → "Project"
3. Import your GitHub repository
4. Vercel will auto-detect the configuration from `vercel.json`
5. Click "Deploy"

**Option B: Using Vercel CLI**

```bash
npm install -g vercel
vercel login
vercel --prod
```

### Environment Configuration

The site is configured to build from the `/app` directory with Vite.

- **Build Command**: `cd app && npm install && npm run build`
- **Output Directory**: `app/dist`
- **Framework**: Vite + React + TypeScript

### Custom Domain (Optional)

1. In Vercel dashboard, go to your project
2. Navigate to Settings → Domains
3. Add your custom domain (e.g., dolcesicilia.sg)
4. Follow Vercel's DNS configuration instructions

## 🛠️ Local Development

```bash
cd app
npm install
npm run dev
```

The site will be available at `http://localhost:5173`

## 📁 Project Structure

```
dolcesicilia/
├── app/
│   ├── public/
│   │   └── images/         # All website images
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── sections/       # Page sections (Hero, Collection, etc.)
│   │   ├── config.ts       # Site configuration
│   │   └── App.tsx         # Main app component
│   ├── package.json
│   └── vite.config.ts
├── vercel.json             # Vercel deployment configuration
└── README.md
```

## 🎨 Customization

All content can be customized in `/app/src/config.ts`:

- Hero section text and images
- Tiramisu collection details
- Story and heritage content
- Contact information
- Social media links

## 📦 Tech Stack

- **Frontend**: React 19 + TypeScript
- **Styling**: Tailwind CSS
- **Build Tool**: Vite
- **Deployment**: Vercel
- **UI Components**: Custom components with Radix UI primitives

## 📄 License

© 2024 Dolce Sicilia. All rights reserved.

## 🤝 Support

For questions or support, contact:
- Email: ciao@dolcesicilia.sg
- Phone: +65 9123 4567

---

*Made with ❤️ in Singapore, inspired by Sicily*
