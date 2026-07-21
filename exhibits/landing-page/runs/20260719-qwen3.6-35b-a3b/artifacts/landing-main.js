export default async function mount(root, api) {
  const content = await api.invoke("landing.content", {});
  // Section list is OWNED BY THE ARTIFACT — order and presence are edited
  // here; the capability only supplies copy/data for each section kind.
  const sections = ["hero", "faq", "features", "cta"];
  root.innerHTML = "";
  const page = document.createElement("div");
  page.style.cssText = "font-family:system-ui,sans-serif;color:#f4f6f8;background:#16181d";
  const builders = {
    hero() {
      const s = document.createElement("section");
      s.style.cssText = "padding:64px 24px;text-align:center;background:#1a1d24";
      const h = document.createElement("h1");
      h.style.cssText = "font-size:34px;margin:0 0 8px";
      h.textContent = content.name;
      const p = document.createElement("p");
      p.style.cssText = "font-size:17px;color:#a1a1aa;margin:0";
      p.textContent = content.tagline;
      s.append(h, p);
      return s;
    },
    features() {
      const s = document.createElement("section");
      s.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;padding:40px 24px;max-width:960px;margin:0 auto";
      for (const f of content.features) {
        const card = document.createElement("article");
        card.style.cssText = "border:1px solid #2d3340;border-radius:10px;padding:16px";
        const h = document.createElement("h3");
        h.style.cssText = "margin:0 0 6px;font-size:16px";
        h.textContent = f.title;
        const p = document.createElement("p");
        p.style.cssText = "margin:0;font-size:14px;color:#a1a1aa";
        p.textContent = f.body;
        card.append(h, p);
        s.append(card);
      }
      return s;
    },
    faq() {
      const s = document.createElement("section");
      s.style.cssText = "padding:40px 24px;max-width:960px;margin:0 auto;background:#1a1d24;font-family:system-ui,sans-serif";
      const items = [
        { q: "How much does it cost?", a: "Our plan starts at $29/month with no hidden fees." },
        { q: "Can I import existing data?", a: "Yes, we support CSV and JSON imports out of the box." },
        { q: "Can I cancel anytime?", a: "Absolutely. You can cancel your subscription at any time from your dashboard." }
      ];
      for (const item of items) {
        const div = document.createElement("div");
        div.style.cssText = "background:#16181d;border-radius:8px;padding:16px;margin-bottom:16px;border:1px solid #2d3340";
        const q = document.createElement("div");
        q.style.cssText = "font-weight:600;margin:0 0 8px;color:#f4f6f8";
        const a = document.createElement("div");
        a.style.cssText = "margin:0;color:#a1a1aa";
        a.textContent = item.a;
        div.append(q, a);
        s.append(div);
      }
      return s;
    },
    cta() {
      const s = document.createElement("section");
      s.style.cssText = "padding:48px 24px;text-align:center";
      const b = document.createElement("button");
      b.style.cssText = "font-size:16px;padding:12px 28px;border-radius:8px;border:0;background:#2a5bd7;color:#fff;cursor:pointer";
      b.textContent = "Get Started Today";
      s.append(b);
      return s;
    },
  };
  for (const kind of sections) page.append(builders[kind]());
  root.append(page);
}