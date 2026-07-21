export default async function mount(root, api) {
  // Question list is OWNED BY THE ARTIFACT — add/remove/reorder/relabel here.
  const questions = [
    { id: "q1", label: "제품에 얼마나 만족하시나요?", type: "scale", required: true },
    { id: "q3", label: "연락처 이메일", type: "email", required: true },
    { id: "q4", label: "저희를 추천할 가능성이 얼마나 되나요?", type: "nps", required: true },
  ];
  root.innerHTML = "";
  const form = document.createElement("form");
  form.style.cssText = "font-family:system-ui,sans-serif;color:#1d2129;max-width:640px;margin:0 auto;padding:24px;display:flex;flex-direction:column;gap:16px";
  const title = document.createElement("h1");
  title.style.cssText = "font-size:22px;margin:0";
  title.textContent = "제품 피드백 설문조사";
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
    } else if (q.type === "nps") {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";
      for (let v = 0; v <= 10; v++) {
        const opt = document.createElement("label");
        opt.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:4px;font-size:14px;color:#2a5bd7";
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = q.id;
        radio.value = String(v);
        radio.style.accentColor = "#2a5bd7";
        opt.append(radio, document.createTextNode(String(v)));
        row.append(opt);
      }
      card.append(row);
    } else if (q.type === "email") {
      const input = document.createElement("input");
      input.type = "email";
      input.id = q.id;
      input.name = q.id;
      input.style.cssText = "width:100%;border:1px solid #c8cdd6;border-radius:6px;padding:8px;font-family:inherit;font-size:14px";
      card.append(input);
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
  submit.textContent = "제출";
  const status = document.createElement("p");
  status.style.cssText = "font-size:14px;color:#3c7a3c;margin:0";
  form.append(submit, status);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const answers = Object.fromEntries(new FormData(form).entries());
    const result = await api.invoke("survey.submit", { answers });
    status.textContent = result.accepted ? "감사합니다 — 피드백이 기록되었습니다." : "제출에 실패했습니다.";
  });
  root.append(form);
}
