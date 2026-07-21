/**
 * landing-page 시드 아티팩트 — exhibit.ts(결선)와 scripted.ts(결정적
 * 변형 파생)가 공유한다. dashboard/scripted.ts 처럼 본문을 중복하지 않고
 * 단일 출처에서 파생하기 위한 분리.
 *
 * Plain-JS generated-code contract: default-export `mount(root, api)`.
 * 섹션 목록은 아티팩트 소유 (widget-list 교훈 일반화).
 */

export const SEED_CONTENT = `export default async function mount(root, api) {
  const content = await api.invoke("landing.content", {});
  // Section list is OWNED BY THE ARTIFACT — order and presence are edited
  // here; the capability only supplies copy/data for each section kind.
  const sections = ["hero", "features", "cta"];
  root.innerHTML = "";
  const page = document.createElement("div");
  page.style.cssText = "font-family:system-ui,sans-serif;color:#16181d;background:#fff";
  const builders = {
    hero() {
      const s = document.createElement("section");
      s.style.cssText = "padding:64px 24px;text-align:center;background:#f4f6fb";
      const h = document.createElement("h1");
      h.style.cssText = "font-size:34px;margin:0 0 8px";
      h.textContent = content.name;
      const p = document.createElement("p");
      p.style.cssText = "font-size:17px;color:#4c5464;margin:0";
      p.textContent = content.tagline;
      s.append(h, p);
      return s;
    },
    features() {
      const s = document.createElement("section");
      s.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;padding:40px 24px;max-width:960px;margin:0 auto";
      for (const f of content.features) {
        const card = document.createElement("article");
        card.style.cssText = "border:1px solid #e3e6ec;border-radius:10px;padding:16px";
        const h = document.createElement("h3");
        h.style.cssText = "margin:0 0 6px;font-size:16px";
        h.textContent = f.title;
        const p = document.createElement("p");
        p.style.cssText = "margin:0;font-size:14px;color:#4c5464";
        p.textContent = f.body;
        card.append(h, p);
        s.append(card);
      }
      return s;
    },
    cta() {
      const s = document.createElement("section");
      s.style.cssText = "padding:48px 24px;text-align:center";
      const b = document.createElement("button");
      b.style.cssText = "font-size:16px;padding:12px 28px;border-radius:8px;border:0;background:#2a5bd7;color:#fff;cursor:pointer";
      b.textContent = content.cta;
      s.append(b);
      return s;
    },
  };
  for (const kind of sections) page.append(builders[kind]());
  root.append(page);
}`;
