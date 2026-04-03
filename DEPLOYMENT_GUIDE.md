# Dolce Sicilia - Deployment Guide

## ✅ Changes Completed

### 🖼️ **Image Updates**

#### 1. **Hero Section**
- **Old:** `hero-tiramisu.jpg`
- **New:** `dolcesicilia-7.png`
- Full-screen background image with "Layers of Obsession" title

#### 2. **Tiramisu Collection** (Reduced from 5 to 3 products)
- **Classico (The Original)** → `dsc-1.png`
  - Year: 1987
  - Description: Traditional mascarpone cream, espresso, savoiardi biscuits, Valrhona cocoa
  
- **Pistacchio (Sicilian Gold)** → `dsc-2.png`
  - Year: 2020
  - Description: Bronte pistachios from Mount Etna blended into mascarpone cream
  
- **Arance Candite (Sicilian Sunshine)** → `dsc-3.png` ⭐ NEW!
  - Year: 2023
  - Description: Hand-candied Sicilian orange peels with Arab heritage influence

**Removed:** Cioccolato, Limoncello, Caramello

#### 3. **How It Works Carousel**
- Slide 1 (Handcrafted): `kitchen-scene.jpg` ✅ No change
- Slide 2 (Perfectly Portioned): `spoon-moment.jpg` ✅ No change
- Slide 3 (Delivered Fresh): **Updated to** `The-Chiesa-di-San-Michele-Arcangelo-in-Scicli-Sicily.jpg`

#### 4. **The Story Section**
- Heritage Tab: **Updated to** `heritage.png`
- Craft Tab: `kitchen-scene.jpg` ✅ No change
- Ingredients Tab: `chef-portrait.jpg` ✅ No change

#### 5. **Reviews Section**
- Card 1: `dolcesicilia-5.png`
- Card 2: `dolcesicilia-6.png`
- Card 3: `dolcesicilia-8.png`
- Card 4: `dolcesicilia-9.png`
- Story Image: `dolcesicilia-10.png`

### 📊 **Content Updates**
- Updated hero stats: "3 Signature Flavors" (was 5)
- Added authentic Sicilian "Arance Candite" description based on traditional candied orange peel recipes
- Updated navigation menu to show only 3 tiramisu varieties
- Updated footer links to match new collection

---

## 🚀 **Deploy to Vercel via GitHub**

### **Step 1: Create GitHub Repository**

1. Go to https://github.com/new
2. Repository name: `dolcesicilia` (or your preferred name)
3. **Important:** Keep it as "Public" or "Private" (your choice)
4. **Do NOT** check "Initialize with README" - we already have files
5. Click "Create repository"

### **Step 2: Push to GitHub**

In your terminal, run these commands:

```bash
cd /Users/lnesto/CascadeProjects/dolcesicilia

# Add your GitHub repository as remote (replace YOUR_USERNAME)
env -u GIT_CONFIG_PARAMETERS git remote add origin https://github.com/YOUR_USERNAME/dolcesicilia.git

# Rename branch to main (if needed)
env -u GIT_CONFIG_PARAMETERS git branch -M main

# Push to GitHub
env -u GIT_CONFIG_PARAMETERS git push -u origin main
```

**Note:** You may need to authenticate with GitHub. If prompted, use a Personal Access Token instead of password.

### **Step 3: Deploy to Vercel**

#### **Option A: Vercel Dashboard (Easiest)**

1. Go to https://vercel.com and sign in (or create account)
2. Click **"Add New..."** → **"Project"**
3. Click **"Import Git Repository"**
4. Select your `dolcesicilia` repository
5. **Project Settings:**
   - **Framework Preset:** Vite
   - **Root Directory:** Leave as is (Vercel will use our `vercel.json`)
   - **Build Command:** `cd app && npm install && npm run build`
   - **Output Directory:** `app/dist`
6. Click **"Deploy"**

Vercel will automatically:
- Build your site
- Deploy it to a `.vercel.app` URL
- Set up automatic deployments for future pushes

#### **Option B: Vercel CLI**

```bash
# Install Vercel CLI globally
npm install -g vercel

# Login to Vercel
vercel login

# Deploy to production
vercel --prod
```

### **Step 4: Get Your Live URL**

After deployment completes (usually 2-3 minutes), Vercel will provide:
- **Production URL:** `https://your-project-name.vercel.app`
- **Preview URLs:** For each GitHub commit

---

## 🌐 **Custom Domain (Optional)**

If you have a custom domain (e.g., `dolcesicilia.sg`):

1. In Vercel Dashboard → Your Project → **Settings** → **Domains**
2. Add your domain: `dolcesicilia.sg` and `www.dolcesicilia.sg`
3. Follow Vercel's DNS configuration instructions:
   - Add A record pointing to Vercel's IP
   - Or add CNAME record pointing to `cname.vercel-dns.com`
4. SSL certificate is automatically provisioned (free)

---

## 📝 **Configuration Files Created**

### **vercel.json**
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "cd app && npm install && npm run build",
  "outputDirectory": "app/dist",
  "framework": null,
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

### **.gitignore**
- Excludes `node_modules/`, `dist/`, `.env` files, and build artifacts

### **README.md**
- Full project documentation
- Local development instructions
- Tech stack information

---

## 🔄 **Future Updates**

After initial deployment, any time you want to update the site:

```bash
# Make your changes to files
# ...

# Stage and commit
env -u GIT_CONFIG_PARAMETERS git add .
env -u GIT_CONFIG_PARAMETERS git commit -m "Your update message"

# Push to GitHub (triggers automatic Vercel deployment)
env -u GIT_CONFIG_PARAMETERS git push
```

Vercel will automatically rebuild and deploy your changes within minutes.

---

## ✨ **What's Included**

- ✅ Responsive design (mobile, tablet, desktop)
- ✅ Modern UI with smooth animations
- ✅ Three signature tiramisu products
- ✅ Contact form ready (update endpoint in `config.ts`)
- ✅ Newsletter subscription ready
- ✅ SEO optimized
- ✅ Fast loading with Vite
- ✅ Production-ready build

---

## 🆘 **Troubleshooting**

### Build Fails on Vercel
- Check that `vercel.json` is in the root directory
- Verify all image paths start with `/images/`
- Check build logs for specific errors

### Images Not Loading
- Ensure all images are in `app/public/images/`
- Image paths in `config.ts` should be `/images/filename.ext`
- Clear browser cache and hard refresh (Cmd+Shift+R)

### Git Push Issues
- If you get auth errors, create a GitHub Personal Access Token
- Use the token instead of password when prompted

---

## 📧 **Support**

For technical questions about this deployment:
- Check Vercel documentation: https://vercel.com/docs
- GitHub guides: https://docs.github.com

---

**Repository Status:** ✅ Ready to push to GitHub and deploy
**Last Updated:** April 3, 2026
