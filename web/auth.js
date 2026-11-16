// Sign-in and data layer for the public web app.
// Gives the app the same window.claude.use("db" | "user" | "downloads") API it
// has as a claude.ai artifact, backed by Firebase Auth and Cloud Firestore.
// Each person's data lives under data/users/<uid>/..., and firestore.rules lets
// only that signed-in person read or write it.
import {initializeApp} from "./vendor/firebase/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  sendPasswordResetEmail, signOut,
} from "./vendor/firebase/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, setDoc, deleteDoc, addDoc, getDoc, onSnapshot,
} from "./vendor/firebase/firebase-firestore.js";
import {firebaseConfig} from "./firebase-config.js";

const T = {
  en: {
    title: "Welcome to Rateb", lead: "Turn irregular income into a monthly salary. Sign in to keep your data safe and private.",
    google: "Continue with Google", or: "or", email: "Email", password: "Password",
    signIn: "Sign in", create: "Create account", toCreate: "New here? Create an account", toSignIn: "Have an account? Sign in",
    forgot: "Forgot password?", resetSent: "We sent a reset link to your email.", needEmail: "Type your email first.",
    notSetUp: "This copy of Rateb isn't connected to Firebase yet. See README.md.", lang: "العربية", wait: "One moment…",
    errors: {
      "auth/invalid-credential": "Wrong email or password.", "auth/wrong-password": "Wrong email or password.",
      "auth/user-not-found": "No account with this email. Create one instead.", "auth/email-already-in-use": "This email already has an account. Sign in instead.",
      "auth/weak-password": "Use at least 6 characters for the password.", "auth/invalid-email": "That email doesn't look right.",
      "auth/too-many-requests": "Too many tries. Wait a minute and try again.", "auth/network-request-failed": "No connection. Check your internet.",
      "auth/popup-closed-by-user": "", "auth/cancelled-popup-request": "",
    },
    failed: "Sign-in didn't work. Try again.",
  },
  ar: {
    title: "أهلًا بك في راتب", lead: "حوّل الدخل غير الثابت إلى راتب شهري. سجّل الدخول لتبقى بياناتك آمنة وخاصة.",
    google: "المتابعة باستخدام Google", or: "أو", email: "البريد الإلكتروني", password: "كلمة المرور",
    signIn: "تسجيل الدخول", create: "إنشاء حساب", toCreate: "جديد هنا؟ أنشئ حسابًا", toSignIn: "لديك حساب؟ سجّل الدخول",
    forgot: "نسيت كلمة المرور؟", resetSent: "أرسلنا رابط إعادة التعيين إلى بريدك.", needEmail: "اكتب بريدك أولًا.",
    notSetUp: "هذه النسخة من راتب غير مربوطة بـ Firebase بعد. راجع README.md.", lang: "English", wait: "لحظة…",
    errors: {
      "auth/invalid-credential": "البريد أو كلمة المرور غير صحيحة.", "auth/wrong-password": "البريد أو كلمة المرور غير صحيحة.",
      "auth/user-not-found": "لا يوجد حساب بهذا البريد. أنشئ حسابًا.", "auth/email-already-in-use": "هذا البريد لديه حساب. سجّل الدخول.",
      "auth/weak-password": "استخدم 6 أحرف على الأقل لكلمة المرور.", "auth/invalid-email": "البريد غير صحيح.",
      "auth/too-many-requests": "محاولات كثيرة. انتظر دقيقة ثم حاول.", "auth/network-request-failed": "لا يوجد اتصال. تحقق من الإنترنت.",
      "auth/popup-closed-by-user": "", "auth/cancelled-popup-request": "",
    },
    failed: "لم ينجح تسجيل الدخول. حاول مرة أخرى.",
  },
};
let lang = "en";
try { const l = localStorage.getItem("rateb-lang"); lang = l === "ar" || l === "en" ? l : (navigator.language || "").startsWith("ar") ? "ar" : "en"; } catch (e) {}
const t = k => T[lang][k];

/* ---------- sign-in screen ---------- */
const css = `
#auth{position:fixed;inset:0;z-index:20;background:var(--bg);overflow:auto;display:flex;justify-content:center;padding:max(24px,env(safe-area-inset-top)) 16px 24px}
#auth .wrap{width:100%;max-width:420px;display:grid;gap:14px;align-content:start}
#auth .top{display:flex;justify-content:space-between;align-items:center}
#auth h1{font-family:var(--f-num);font-size:28px;margin:6px 0 0}
#auth form{display:grid;gap:12px}
#auth .or{text-align:center;color:var(--muted);font-size:14px}
#auth .msg{min-height:20px;font-size:14px;color:var(--bad)}
#auth .msg.ok{color:var(--good)}
#auth .link{background:none;border:0;color:var(--accent);font:inherit;font-size:14px;cursor:pointer;padding:4px 0;text-align:start}
#auth .g{display:flex;align-items:center;justify-content:center;gap:10px}
`;
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === "text") e.textContent = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
  kids.flat().forEach(k => k != null && e.append(k));
  return e;
}
// message holds a key into T (ok) or an auth error code, so it re-translates on language switch
let mode = "signIn", box = null, busy = false, message = null, messageOk = false;
const msgText = () => !message ? "" : messageOk || message === "needEmail" ? t(message) : (T[lang].errors[message] || t("failed"));
function field(name, label, type, auto) {
  return h("div", {class: "f"}, h("label", {for: "a-" + name, text: label}), h("input", {id: "a-" + name, name, type, autocomplete: auto, required: "", dir: "ltr"}));
}
function showAuth() {
  document.documentElement.lang = lang; document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  if (!document.getElementById("auth-css")) document.head.append(h("style", {id: "auth-css"}, css));
  const keep = box && {email: box.querySelector("#a-email")?.value || "", password: box.querySelector("#a-password")?.value || ""};
  box?.remove();
  const langBtn = h("button", {class: "chip", type: "button", text: t("lang"), onclick: () => { lang = lang === "en" ? "ar" : "en"; try { localStorage.setItem("rateb-lang", lang); } catch (e) {} showAuth(); }});
  const form = h("form", {novalidate: ""}, field("email", t("email"), "email", "email"), field("password", t("password"), "password", mode === "create" ? "new-password" : "current-password"),
    h("button", {class: "btn", type: "submit", text: busy ? t("wait") : t(mode)}));
  form.onsubmit = ev => { ev.preventDefault(); emailSubmit(form); };
  const google = h("button", {class: "btn ghost g", type: "button", onclick: googleSignIn}, gIcon(), h("span", {text: t("google")}));
  const switchBtn = h("button", {class: "link", type: "button", text: mode === "create" ? t("toSignIn") : t("toCreate"), onclick: () => { mode = mode === "create" ? "signIn" : "create"; message = null; showAuth(); }});
  const forgot = h("button", {class: "link", type: "button", text: t("forgot"), onclick: () => resetPassword(form)});
  box = h("div", {id: "auth", role: "dialog", "aria-modal": "true", "aria-label": t("title")},
    h("div", {class: "wrap"},
      h("div", {class: "top"}, h("div", {class: "brand", text: lang === "ar" ? "راتب" : "Rateb"}), langBtn),
      h("section", {class: "card"}, h("h1", {text: t("title")}), h("p", {class: "hint", text: t("lead")})),
      h("section", {class: "card"}, firebaseConfig && firebaseConfig.apiKey
        ? h("div", {style: "display:grid;gap:12px"}, google, h("div", {class: "or", text: t("or")}), form, h("div", {class: "msg" + (messageOk ? " ok" : ""), role: "status", text: msgText()}), switchBtn, mode === "signIn" ? forgot : null)
        : h("p", {class: "hint", text: t("notSetUp")}))));
  document.body.append(box);
  if (keep) { box.querySelector("#a-email") && (box.querySelector("#a-email").value = keep.email); box.querySelector("#a-password") && (box.querySelector("#a-password").value = keep.password); }
  if (busy) box.querySelectorAll("button,input").forEach(b => b.disabled = true);
}
function gIcon() {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 48 48"); s.setAttribute("width", "20"); s.setAttribute("height", "20"); s.setAttribute("aria-hidden", "true");
  s.innerHTML = '<path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>';
  return s;
}
function say(err, ok) {
  if (ok) { message = err; messageOk = true; }
  else { const code = (err && err.code) || "failed"; if (T.en.errors[code] === "") { busy = false; showAuth(); return; } message = code; messageOk = false; }
  busy = false; showAuth();
}
async function run(fn) { if (busy) return; busy = true; message = null; showAuth(); try { await fn(); } catch (e) { say(e); } }
function creds(form) { return [form.elements.email.value.trim(), form.elements.password.value]; }
function emailSubmit(form) {
  const [email, pw] = creds(form);
  run(() => mode === "create" ? createUserWithEmailAndPassword(auth, email, pw) : signInWithEmailAndPassword(auth, email, pw));
}
function googleSignIn() {
  const provider = new GoogleAuthProvider();
  run(async () => {
    try { await signInWithPopup(auth, provider); }
    catch (e) { if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment")) await signInWithRedirect(auth, provider); else throw e; }
  });
}
async function resetPassword(form) {
  const email = form.elements.email.value.trim();
  if (!email) { message = "needEmail"; messageOk = false; showAuth(); return; }
  try { await sendPasswordResetEmail(auth, email); say("resetSent", true); } catch (e) { say(e); }
}

/* ---------- the window.claude API on Firestore ---------- */
function makeApi(fs, user) {
  const snapDoc = s => ({id: s.id, exists: s.exists(), data: () => s.data()});
  const mkDoc = path => ({
    id: path.split("/").pop(), path,
    collection: name => mkColl(path + "/" + name),
    get: async () => snapDoc(await getDoc(doc(fs, path))),
    set: data => setDoc(doc(fs, path), data),
    delete: () => deleteDoc(doc(fs, path)),
    onSnapshot: (fn, err) => onSnapshot(doc(fs, path), s => fn(snapDoc(s)), err),
  });
  const mkColl = path => ({
    path,
    doc: id => mkDoc(id ? path + "/" + id : doc(collection(fs, path)).path),
    add: async data => mkDoc((await addDoc(collection(fs, path), data)).path),
    onSnapshot: (fn, err) => onSnapshot(collection(fs, path), s => fn({docs: s.docs.map(snapDoc), size: s.size, empty: s.empty}), err),
  });
  const db = {doc: mkDoc, collection: mkColl};
  const people = {id: async () => user.uid, me: async () => ({id: user.uid}), isOwner: () => true, canEdit: () => true, can: () => true};
  const downloads = {
    save: async ({filename, data}) => {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const url = URL.createObjectURL(blob);
      const a = h("a", {href: url, download: filename});
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      return {status: "saved"};
    },
  };
  const caps = {db, user: people, downloads};
  return {use: async name => caps[name] || null};
}

/* ---------- start ---------- */
let auth = null;
if (!firebaseConfig || !firebaseConfig.apiKey) {
  showAuth();
} else {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  const fs = initializeFirestore(app, {ignoreUndefinedProperties: true, localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})});
  getRedirectResult(auth).catch(e => say(e));
  let started = null;
  onAuthStateChanged(auth, user => {
    if (user) {
      if (started && started !== user.uid) { location.reload(); return; }
      started = user.uid; busy = false; box?.remove(); box = null;
      window.ratebAuth = {email: () => user.email || "", signOut: async () => { await signOut(auth); location.reload(); }};
      window.__ratebResolve(makeApi(fs, user));
    } else if (started) {
      location.reload();
    } else {
      showAuth();
    }
  });
}
