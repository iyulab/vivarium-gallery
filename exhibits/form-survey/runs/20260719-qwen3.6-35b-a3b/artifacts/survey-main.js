export default async function mount(root, api) {
  const questions = [
    { id: "q1", label: "제품에 대한 만족도는 어떠신가요?", type: "scale", required: true },
    { id: "q3", label: "연락처 이메일", type: "email", required: true },
    { id: "q4", label: "지인들에게 추천할 의향이 있으신가요?", type: "nps", required: true },
  ];
  root.innerHTML = "";
  const form = document.createElement("form");
  form.style.cssText = "font-family:system-ui,sans-serif;color:#1d2129;max-width:640px;margin:0 auto;padding:24px;display:flex;flex-direction:column;gap:16px";
  const title = document.createElement("h1");
  title.style.cssText = "font-size:22px;margin:0";
  title.textContent = "제품 피드백 설문";
  form.append(title);
  for (const q of questions) {
    const card = document.createElement("section");
    card.style.cssText = "font-family: system-ui, sans-serif; color: #1d2129; border: 1px solid #c8cdd6; border-radius: 10px; padding: 16px; margin-bottom: 16px;";
    const label = document.createElement("label");
    label.style.cssText = "display:block;font-size:15px;font-weight:600;margin-bottom:8px";
    label.textContent = q.label + " *";
    label.htmlFor = q.id;
    card.append(label);
    if (q.type === "scale" || q.type === "nps") {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;flex-wrap:wrap;gap:8px";
      const start = q.type === "nps" ? 0 : 1;
      const end = q.type === "nps" ? 10 : 5;
      for (let v = start; v <= end; v++) {
        const opt = document.createElement("label");
        opt.style.cssText = "display:flex;align-items:center;gap:4px;font-size:14px";
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = q.id;
        radio.value = String(v);
        radio.id = `${q.id}-${v}`;
        radio.required = true;
        opt.htmlFor = radio.id;
        opt.append(radio, document.createTextNode(String(v)));
        row.append(opt);
      }
      card.append(row);
    } else if (q.type === "email") {
      const input = document.createElement("input");
      input.type = "email";
      input.id = q.id;
      input.name = q.id;
      input.placeholder = "name@example.com";
      input.required = true;
      input.style.cssText = "width:100%;border:1px solid #c8cdd6;border-radius:6px;padding:8px;font-family:inherit;font-size:14px";
      card.append(input);
    } else {
      const input = document.createElement("textarea");
      input.id = q.id;
      input.name = q.id;
      input.rows = 3;
      input.required = true;
      input.style.cssText = "width:100%;border:1px solid #c8cdd6;border-radius:6px;padding:8px;font-family:inherit;font-size:14px";
      card.append(input);
    }
    form.append(card);
  }
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.style.cssText = "align-self:flex-start;font-size:15px;padding:10px 24px;border-radius:8px;border:0;background:#2a5bd7;color:#fff;cursor:pointer";
  submit.textContent = "제출하기";
  const status = document.createElement("p");
  status.style.cssText = "font-size:14px;color:#3c7a3c;margin:0";
  form.append(submit, status);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.checkValidity()) return;
    const answers = Object.fromEntries(new FormData(form).entries());
    const result = await api.invoke("survey.submit", { answers });
    status.textContent = result.accepted ? "감사합니다. 피드백이 기록되었습니다." : "제출에 실패했습니다.";
  });
  root.append(form);
}