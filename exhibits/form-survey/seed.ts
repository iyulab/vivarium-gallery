/**
 * form-survey 시드 아티팩트 — exhibit.ts 와 scripted.ts 의 단일 출처.
 *
 * 질문 목록은 아티팩트 소유 (widget-list 교훈): 질문의 수·순서·필수 여부는
 * 아티팩트 편집으로 바뀌고, capability(`survey.submit`)는 제출 mock 만
 * 담당한다. Plain-JS contract: default-export `mount(root, api)`.
 */

export const SEED_CONTENT = `export default async function mount(root, api) {
  // Question list is OWNED BY THE ARTIFACT — add/remove/reorder/relabel here.
  const questions = [
    { id: "q1", label: "How satisfied are you with the product?", type: "scale", required: true },
    { id: "q2", label: "What should we improve first?", type: "text", required: false },
  ];
  root.innerHTML = "";
  const form = document.createElement("form");
  form.style.cssText = "font-family:system-ui,sans-serif;color:#1d2129;max-width:640px;margin:0 auto;padding:24px;display:flex;flex-direction:column;gap:16px";
  const title = document.createElement("h1");
  title.style.cssText = "font-size:22px;margin:0";
  title.textContent = "Product Feedback Survey";
  form.append(title);
  for (const q of questions) {
    const card = document.createElement("section");
    card.style.cssText = "border:1px solid #dde1e8;border-radius:10px;padding:16px";
    const label = document.createElement("label");
    label.style.cssText = "display:block;font-size:15px;font-weight:600;margin-bottom:8px";
    label.textContent = q.required ? q.label + " *" : q.label;
    label.htmlFor = q.id;
    card.append(label);
    if (q.type === "scale") {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:8px";
      for (let v = 1; v <= 5; v++) {
        const opt = document.createElement("label");
        opt.style.cssText = "display:flex;align-items:center;gap:4px;font-size:14px";
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = q.id;
        radio.value = String(v);
        opt.append(radio, document.createTextNode(String(v)));
        row.append(opt);
      }
      card.append(row);
    } else {
      const input = document.createElement("textarea");
      input.id = q.id;
      input.name = q.id;
      input.rows = 3;
      input.style.cssText = "width:100%;border:1px solid #c8cdd6;border-radius:6px;padding:8px;font-family:inherit;font-size:14px";
      card.append(input);
    }
    form.append(card);
  }
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.style.cssText = "align-self:flex-start;font-size:15px;padding:10px 24px;border-radius:8px;border:0;background:#2a5bd7;color:#fff;cursor:pointer";
  submit.textContent = "Submit";
  const status = document.createElement("p");
  status.style.cssText = "font-size:14px;color:#3c7a3c;margin:0";
  form.append(submit, status);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const answers = Object.fromEntries(new FormData(form).entries());
    const result = await api.invoke("survey.submit", { answers });
    status.textContent = result.accepted ? "Thanks — your feedback was recorded." : "Submission failed.";
  });
  root.append(form);
}`;
