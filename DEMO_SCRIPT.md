# Mekai — Demonstration Script

## Introduction (1–2 minutes)

> **"Good [morning/afternoon], today I'll be demonstrating Mekai — a manga reading and translation platform built for Japanese language learners.**
>
> **The problem Mekai solves is simple: reading raw Japanese manga is hard. You see a speech bubble, you don't know what it says, and switching between the manga and a dictionary or translator breaks your flow.**
>
> **Mekai solves this by putting OCR-powered translation directly inside the reader. You draw a box over any speech bubble, and Mekai extracts the Japanese text, translates it to English, and shows the result right on the page — all in a couple of seconds, without ever leaving the reader.**
>
> **The platform has two user roles:**
> - **Translators** — upload manga and chapters, and publish official translations that readers can see.
> - **Readers** — browse the shared library, read chapters, use the OCR tool to translate on the fly, and save words to a personal Word Vault for vocabulary building.
>
> **Under the hood, the system uses:**
> - A **React + TypeScript** frontend with Vite and TailwindCSS.
> - **Supabase** for authentication, database, real-time sync, and file storage.
> - A **Python companion API** running manga-ocr (locally) or PaddleOCR (in production) for text extraction, and OPUS-MT for Japanese-to-English translation.
> - **OpenRouter AI** for optional detailed word and sentence explanations.
>
> **Let me walk you through the system."**

---

## Part 1 — Landing Page

> **"This is the Mekai landing page. It introduces the platform's core features: manga reading, OCR translation, the Word Vault, and the translator workflow. There's also a 'How to Use' section that walks new users through the three-step process — select a bubble, get the translation, save to your vault. The page supports light and dark themes. Let's sign up."**

**Actions:**
1. Show the landing page — scroll through features and tutorial.
2. Toggle the theme (light ↔ dark).
3. Click **"Get Started"** or **"Log In"** to go to the auth page.

---

## Part 2 — Authentication

> **"This is the auth page. Users can sign in or sign up. During sign up, they choose a username, enter their email and password, and select their role — Reader or Translator. The password field shows real-time validation: minimum 8 characters, uppercase letter, number, and special character. Let me sign up as a Reader first."**

**Actions:**
1. Switch to the **Sign Up** tab.
2. Fill in username, email, password. Show the live password strength checklist.
3. Select the **Reader** role.
4. Submit — user is signed in and redirected to the Reader Dashboard.

---

## Part 3 — Reader Dashboard

> **"This is the Reader Dashboard — the main hub for readers. It has two tabs: the Online Library, which shows all shared manga published by translators, and My Private Uploads, where readers can upload their own manga for personal use. The library updates in real-time — if a translator uploads a new chapter right now, it would appear here automatically without refreshing. Let me open a manga."**

**Actions:**
1. Show the **Online Library** tab with shared manga cards.
2. Use the **search bar** to filter.
3. Briefly switch to the **My Private Uploads** tab — show the "Add Private Manga" button.
4. Click on a manga card to go to the Manga Entry Page.

---

## Part 4 — Manga Entry Page

> **"This is the manga detail page. It shows the cover, title, description, genre tags, chapter count, and last updated time. Below that is the chapter list. Since I'm a reader viewing shared manga, I can only read — I can't edit or upload. Let me open a chapter."**

**Actions:**
1. Show the manga metadata (cover, genres, visibility badge).
2. Scroll to the chapter list.
3. Click a chapter to open the Manga Reader.

---

## Part 5 — Manga Reader (Core Feature)

> **"This is the manga reader — the heart of Mekai. The chapter's CBZ file is downloaded and extracted in the browser. I can read in two modes: Scroll mode, which shows all pages vertically, and Page mode, which uses a swiper for one page at a time with keyboard navigation. I can also choose between RTL reading direction — which is the traditional manga right-to-left — and LTR for western-style comics. The reader also saves my reading progress automatically, so if I leave and come back, it picks up where I left off."**

**Actions:**
1. Show the reader with pages loaded.
2. Open the **Settings menu** (gear icon) → toggle between **Scroll** and **Page** mode.
3. Show **reading direction** switch (RTL ↔ LTR).
4. In Page mode, use **arrow keys** to navigate.

---

## Part 6 — OCR Translation (Live Demo)

> **"Now for the main feature. I'll enable OCR mode from the settings menu. Notice the crosshair cursor — this means I can draw a selection box over any speech bubble. Let me select this one."**
>
> *(Draw a selection box over a speech bubble)*
>
> **"As soon as I release, a 'Translating…' spinner appears on the selected region. Behind the scenes, Mekai crops the image, runs Otsu binarization to isolate ink pixels, filters noise using connected-component analysis, then sends the cleaned image to the manga-ocr engine. The returned Japanese text is then passed to the OPUS-MT translation model. The whole pipeline takes about 2–3 seconds."**
>
> *(Translation overlay appears)*
>
> **"The English translation now appears directly on the bubble as a fitted text overlay. I can tap it to open the details panel, which shows the original Japanese text, the English translation, and the romaji pronunciation. From here I can copy the text, listen to the Japanese pronunciation via text-to-speech, or get an AI-powered explanation that breaks down the grammar and meaning."**

**Actions:**
1. Open **Settings** → click **Enable OCR**.
2. Draw a selection box over a speech bubble.
3. Wait for the spinner → translation overlay appears on the bubble.
4. Tap the overlay → **Details Bottom Sheet** slides up.
5. Show: original Japanese, translation, romaji.
6. Click **Copy** to copy the translation.
7. Click the **speaker icon** for text-to-speech pronunciation.
8. Click **AI Explain** to get a detailed sentence breakdown (if OpenRouter is configured).
9. Close the bottom sheet.

---

## Part 7 — Translation History

> **"Every translation I make is automatically saved to my history for this chapter. I can open the History drawer from the settings menu. It shows all my past translations for this chapter, newest first. From here I can jump to any entry — clicking 'Locate' scrolls or navigates to that page and highlights the bubble. I can also copy, speak, save to my Word Vault, or delete entries from here."**

**Actions:**
1. Open **Settings** → click **History**.
2. The **History Drawer** slides in from the right.
3. Show a list of past translations with Japanese text, English, and romaji.
4. Click **Locate** on an entry → reader jumps to that page and highlights the overlay.
5. Click the **bookmark icon** to save an entry to Word Vault.
6. Close the drawer.

---

## Part 8 — Word Vault

> **"Let me navigate to the Word Vault. This is the reader's personal vocabulary collection. Every word or phrase I saved from the reader shows up here. I can search through my saved words, listen to their pronunciation, and — if OpenRouter is configured — get an AI-powered explanation for any word. The explanation includes the meaning, reading, part of speech, example sentences, and grammar notes. The vault syncs in real-time across tabs and devices via Supabase."**

**Actions:**
1. Navigate to **Word Vault** from the navbar.
2. Show saved entries with original Japanese, translation, romaji, and source chapter.
3. Use the **search bar** to filter.
4. Click the **speaker icon** on an entry for pronunciation.
5. Click **AI Explain** on a word → show the explanation modal with detailed breakdown.
6. Delete an entry to show removal.

---

## Part 9 — Profile Settings

> **"In Profile Settings, users can update their username, upload or remove their avatar, and change their password. The avatar upload accepts JPEG, PNG, WebP, or GIF up to 2 MB. Password changes require re-authentication with the current password first, and the new password must meet the same strength requirements as sign-up."**

**Actions:**
1. Open **Profile Settings** from the profile dropdown.
2. Show the current profile info (email, role — read-only; username — editable).
3. Change the username and save.
4. Upload a new avatar.
5. Briefly show the password change form with the requirements checklist.

---

## Part 10 — Translator Flow

> **"Now let me sign out and sign in as a Translator to show the other side of the platform."**
>
> *(Sign in as a translator account)*
>
> **"This is the Translator Dashboard. Translators see only the manga they own. They can create new manga with a title, description, cover image, and genre tags. Let me open one of my manga."**
>
> *(Open a manga entry page)*
>
> **"As a translator and owner, I have full controls: I can edit the manga metadata, upload new chapters as CBZ files, and delete the manga entirely. Let me upload a chapter."**
>
> *(Upload a chapter)*
>
> **"Now let me open this chapter in the reader. As a translator, when I use the OCR tool, my translations are not only saved to my personal history — they're also published automatically. That means any reader who opens this chapter will see my translations as pre-placed overlays on the bubbles, without needing to run OCR themselves. I can also delete published translations by dismissing the overlay."**

**Actions:**
1. Sign out → sign in as **Translator**.
2. Show the **Translator Dashboard** with owned manga.
3. Click **Create Manga** → fill in the form with title, description, cover, genres.
4. Open a manga → show **Edit** and **Delete** buttons (owner-only).
5. Click **Upload Chapter** → upload a CBZ file.
6. Open a chapter in the reader → enable OCR → translate a bubble.
7. Explain that the translation is **published** for all readers.
8. Show the dismiss (delete) action on a published overlay.

---

## Part 11 — Real-Time Sync

> **"One more thing worth highlighting — Mekai uses Supabase's real-time subscriptions. If I have the Reader Dashboard open in one tab and a translator uploads a new chapter in another, the reader's dashboard updates automatically without a page refresh. The same applies to the Word Vault — saving a word from the reader in one tab instantly appears in the Word Vault page in another tab."**

**Actions:**
1. Open two browser tabs side by side.
2. In one tab: translator uploads a chapter or creates a manga.
3. In the other tab: reader dashboard updates in real-time.
4. (Optional) Show Word Vault real-time sync across tabs.

---

## Closing (30 seconds)

> **"To summarize — Mekai is a full-stack manga reading and translation platform that combines OCR-powered instant translation, a personal vocabulary vault, and a translator workflow with real-time sync. The tech stack includes React, TypeScript, Supabase, and a Python backend with manga-ocr and OPUS-MT. The system is deployed with the frontend on Vercel and the OCR/translation API on Railway.**
>
> **Thank you. I'm happy to take any questions."**

---

## Pre-Demo Checklist

- [ ] Python API server running (`uv run python main.py` in `py-mekai-api/`)
- [ ] Frontend dev server running (`npm run dev`)
- [ ] At least one manga with chapters uploaded (both shared and private)
- [ ] A **Reader** account and a **Translator** account ready
- [ ] OpenRouter API key set in `.env` (for AI explanations — optional but impressive)
- [ ] Browser in **dark mode** (looks better for demos)
- [ ] Two browser tabs/windows ready for real-time sync demo
