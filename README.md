# Rateb · راتب

Rateb is for people who drive for apps like Uber, Careem, Jeeny or Bolt in their free time. It turns that irregular driving income into a steady monthly salary. Other income, like a stipend, fits in too.

- Everything you earn this month is locked as **next month's pay**.
- On the 1st you pay yourself the salary you chose. Anything above it goes to savings.
- Bills come out of the salary first, and what's left is yours to spend. Whatever is left at month end goes to savings too.
- If next month's pay comes up short, Rateb warns you and offers to cover the gap from savings. It never touches your savings on its own.

The app works in Arabic and English, can be installed on a phone's home screen, and works offline.

## How it's built

| Path | What it is |
|---|---|
| `src/app.html` | The whole app (UI and money rules). It's the single source, and it also runs as a claude.ai artifact. |
| `tools/build_web.py` | Wraps `src/app.html` into `web/index.html` for the public site. |
| `web/auth.js` | Sign-in (email or Google) and the data layer on Firebase Auth and Cloud Firestore. |
| `web/firebase-config.js` | Your Firebase project's web config. |
| `web/sw.js`, `web/manifest.webmanifest`, `web/icons/` | Installable app and offline support. |
| `web/vendor/` | Local copies of Firebase JS SDK 10.12.2 and SheetJS 0.18.5, used for spreadsheet export. |
| `firestore.rules` | Security rules. Each person can only read and write `data/users/<their uid>/…`. |
| `.github/workflows/pages.yml` | Builds and publishes `web/` to GitHub Pages on every push to `main`. |

## One-time setup

### 1. Firebase

1. At [console.firebase.google.com](https://console.firebase.google.com), choose **Add project**. Analytics isn't needed.
2. Go to **Build → Authentication → Get started**. Enable **Email/Password** and **Google**.
3. Go to **Build → Firestore Database → Create database** and pick **production mode**.
4. Go to **Firestore Database → Rules**. Paste in the contents of `firestore.rules` and click **Publish**.
5. Go to **Project settings → Your apps → Web (`</>`)** and register an app. Copy the `firebaseConfig` object into `web/firebase-config.js`:
   ```js
   export const firebaseConfig = { apiKey: "…", authDomain: "…", projectId: "…", appId: "…" };
   ```
   These values aren't secret. Access is protected by the rules from step 4.
6. Go to **Authentication → Settings → Authorized domains** and add your site's domain, for example `yourname.github.io`.

### 2. GitHub Pages

Go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**. After that, every push to `main` publishes the app at `https://<user>.github.io/<repo>/`.

## Run locally

```sh
python3 tools/build_web.py
cd web && python3 -m http.server 8080
```

Then open http://localhost:8080. `localhost` is an authorized domain in Firebase by default.

## Data layout

```
data/users/<uid>/settings                 salary, start date, language, vehicle and budget settings
data/users/<uid>/app/lists/<id>           income lists (work lists with platforms, or simple lists)
data/users/<uid>/app/income/<id>          amounts logged to a simple list
data/users/<uid>/app/shifts/<id>          work days (platforms, jobs, odometer, fuel cost)
data/users/<uid>/app/fuel/<id>            fill-ups
data/users/<uid>/app/expenses/<id>        spending
data/users/<uid>/app/bills/<id>           bills: first due date, repeat every N months, number of payments
data/users/<uid>/app/odo/<id>             odometer readings
data/users/<uid>/app/paydays/<YYYY-MM>    per-month actions: cover from savings, advance, bills paid, payday seen
```

People can download a backup (.json) and restore it from **Settings → Your data**. They can also export a spreadsheet (.xlsx).
