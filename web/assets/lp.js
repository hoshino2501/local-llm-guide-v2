import { GUIDES } from "/assets/guides.js";

const ul = document.getElementById("cards");
for (const g of GUIDES) {
  const li = document.createElement("li");
  li.className = "card";
  const verb = Object.assign(document.createElement("span"), { className: "verb", textContent: g.verb });
  const h3 = Object.assign(document.createElement("h3"), { textContent: g.name });
  const p = Object.assign(document.createElement("p"), { textContent: g.desc });
  const a = Object.assign(document.createElement("a"), {
    className: "btn", href: `/chat/?guide=${g.id}`, textContent: `${g.verb}ガイドに相談する`,
  });
  li.append(verb, h3, p, a);
  ul.append(li);
}
