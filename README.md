# Kandor

A mobile web app that grades Indian grocery and personal-care products on **Eco**, **Health** and **Value** (A / B / C).

Point the phone camera at a product and Kandor recognises it:

- **Photo recognition:** tap **Identify** (or **Upload** a photo). The picture goes to Google Gemini, which works out which product it is.
  - **One of the 50 Kandor products:** its page opens with Kandor's own scores.
  - **Any other product (Lay's, Coca-Cola, Pepsi…):** Gemini scores it with Kandor's methodology (see below). The page is labelled **AI estimate**.
- **Barcodes:** read automatically from the live camera and looked up in Open Food Facts. This works even without Gemini.

There is no server or database. It is one page (`index.html`) plus one small function (`functions/api/identify.js`) that keeps the Gemini key secret.

```
index.html                  the whole app
functions/api/identify.js   photo → Gemini → "which product is this?" (+ AI scoring)
```

---

## Setup (about 10 minutes, all free)

### 1. Get a Gemini API key
1. Go to **https://aistudio.google.com/apikey** and sign in with your Google account.
2. Click **Create API key** and copy it.

Keep it private. Never paste it into `index.html` or commit it to GitHub.

### 2. Put the code on GitHub
1. On **https://github.com/new**, create a repository (e.g. `kandor`). Public or private both work.
2. Click **uploading an existing file**, drag in **everything in this folder**, including the `functions` folder, then click **Commit changes**.

### 3. Publish it on Cloudflare Pages
1. Sign in at **https://dash.cloudflare.com** (free account).
2. Go to **Workers & Pages → Create → Pages → Connect to Git** and pick the repository.
3. Set up the build:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/`
4. Click **Save and Deploy**. Cloudflare gives you a link like `https://kandor.pages.dev`.

### 4. Add the Gemini key
1. In the Cloudflare project, open **Settings → Variables and Secrets → Add**.
2. Fill it in:
   - **Type:** Secret
   - **Name:** `GEMINI_API_KEY`
   - **Value:** the key from step 1
3. Add it for **Production** (and Preview, if you want).
4. Go to **Deployments**, open the latest one, and choose **Retry deployment** so the key is picked up.

### 5. Test on an iPhone
1. Open the `pages.dev` link in **Safari** (not inside WhatsApp or Instagram).
2. Go to **Scan**, then **Allow** the camera.
3. Point at a product and tap **Identify**.

To check that the key is set up, open `https://<your-site>/api/identify`. It should show `{"configured":true}`.

From now on, every change pushed to GitHub redeploys the site automatically.

---

## Optional settings (Cloudflare → Settings → Variables)

| Name | What it does |
|---|---|
| `GEMINI_MODEL` | Gemini model to use. Default: `gemini-flash-latest`, falling back to `gemini-flash-lite-latest`. |
| `ALLOWED_ORIGINS` | Extra sites allowed to call `/api/identify` (comma-separated), e.g. a custom domain. The site's own address is always allowed. |

## Free-tier limits
- **Daily limit:** Gemini's free tier caps requests per day. When the cap is reached, the app says so and barcode scanning keeps working.
- **Photo use:** on the free tier, Google may use the photos sent to it to improve its products. Switch the Google project to paid billing before a public launch.

## Scoring methodology (used for AI estimates)
These are the same weights shown on the app's *Score methodology* screen:

- **Eco:** packaging 40% · sourcing 30% · carbon 20% · brand ethics 10%
- **Health:** ingredients 40% · nutrition 35% · processing (NOVA) 25%
- **Value:** price per unit 50% · benefit per rupee 30% · availability 20%
- **Grades:** 75–100 = A (green) · 50–74 = B (amber) · 0–49 = C (red)

Gemini gives each part a 0–100 score from the photo. The app then combines them with the weights above, in `RUBRIC` in `index.html`.

The 50 built-in products keep their hand-written scores. Edit them in the `DB` list at the top of the script in `index.html`.
