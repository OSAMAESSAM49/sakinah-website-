# سكينة · Sakinah

بحث هادئ في **القرآن الكريم** و**الكتب الستة** بكلمة واحدة.

الموقع **ثابت بالكامل** (HTML + CSS + JavaScript) ولا يحتاج سيرفر:
محرك البحث يعمل داخل المتصفح (`docs/engine.js` كـ Web Worker)، ويحمّل البيانات مرة واحدة من `docs/data/`
(حوالي 6.6 ميجا مضغوطة). لذلك يُستضاف مجانًا على **GitHub Pages**.

## النشر على GitHub Pages

**الطريقة الأسهل (من المتصفح):**
1. اعمل مستودع جديد على GitHub (Public).
2. **Add file → Upload files** وارفع **محتويات** فولدر `docs/` (مش الفولدر نفسه):
   `index.html`، `app.js`، `engine.js`، `styles.css`، وفولدرات `assets/` و `fonts/` و `data/`.
3. **Settings → Pages → Branch: `main` / `(root)` → Save**.
4. بعد دقيقة الموقع يبقى على: `https://<username>.github.io/<repo>/`

**أو بـ git (المشروع كله):** ارفع المشروع، ومن **Settings → Pages** اختار `main` و `/docs`.

## التشغيل على الجهاز

```bash
node server.js
```
ثم افتح http://localhost:3000 (أو دبل كليك على `start-sakinah.bat`).
فتح `index.html` مباشرة مش هيشتغل، لأن المتصفح بيمنع الـ Web Workers من `file://`.

## الهيكل

| الملف | الوظيفة |
|---|---|
| `docs/` | **الموقع كله** — ده اللي بيترفع |
| `docs/engine.js` | محرك البحث العربي (يتجاهل التشكيل ويفهم السوابق واللواحق) |
| `docs/data/` | المصحف + الكتب الستة بصيغة مضغوطة |
| `tools/build-data.js` | يولّد `docs/data/` من البيانات الخام (`npm run build-data`) |
| `lib/data.js` | تحميل البيانات الخام، استخراج الراوي، ترجمة درجات الحديث |
| `server.js` | سيرفر صغير للمعاينة المحلية فقط |

## المصادر

- القرآن الكريم: [alquran.cloud](https://alquran.cloud)
- الحديث: [fawazahmed0/hadith-api](https://github.com/fawazahmed0/hadith-api)
- الأحكام: الصحيحان صحيحة، والسنن الأربع بحكم الألباني أولًا ثم غيره
- التفسير (الميسر، السعدي، ابن كثير، الطبري، القرطبي، البغوي، الوسيط): [spa5k/tafsir_api](https://github.com/spa5k/tafsir_api) — يُحمَّل عند الطلب
- التلاوات: [Islamic Network CDN](https://alquran.cloud/cdn) (العفاسي، الحصري، المنشاوي، عبد الباسط، المعيقلي، السديس)
- قراءة الحديث: الصوت العربي المدمج في جهاز المستخدم (Web Speech API)

> الراوي يُستخرج آليًا من السند، وقد يخطئ في حالات قليلة.
