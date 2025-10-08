import type { Page } from "../router";

const DEFAULT_LAYOUT = "vanilla";

type LayoutModule = {
  default: Page;
  meta?: { name?: string };
};

type RegisteredLayout = {
  name: string;
  render: Page;
};

const modules = import.meta.glob<LayoutModule>("../vis/*.ts", { eager: true });
const registry = new Map<string, RegisteredLayout>();

for (const [path, mod] of Object.entries(modules)) {
  const fileName = path.split("/").pop() ?? "";
  const inferredName = fileName.replace(/\.[^.]+$/, "");
  const declaredName = mod.meta?.name ?? inferredName;
  if (!mod.default || !declaredName) continue;

  const layout: RegisteredLayout = { name: declaredName, render: mod.default };
  const aliases = new Set<string>([
    declaredName.toLowerCase(),
    inferredName.toLowerCase(),
  ]);
  if (mod.meta?.name) aliases.add(mod.meta.name.toLowerCase());

  for (const alias of aliases) {
    if (alias) registry.set(alias, layout);
  }
}

const uniqueNames = Array.from(new Set(Array.from(registry.values()).map(l => l.name.toLowerCase())));

const LayoutBuilder: Page = (root, ctx) => {
  const requestedKey = (ctx.query.get("layout") || DEFAULT_LAYOUT).toLowerCase();
  const fallbackLayout = registry.get(DEFAULT_LAYOUT) ?? Array.from(registry.values())[0];

  if (!fallbackLayout) {
    root.innerHTML = `
      <section class="card">
        <h1 class="h1">No Layouts Registered</h1>
        <p>Add a layout file under <code>src/vis</code> to continue.</p>
      </section>
    `;
    return;
  }

  const resolved = registry.get(requestedKey) ?? fallbackLayout;
  const resolvedKey = resolved.name.toLowerCase();
  const matched = registry.has(requestedKey);

  const mount = document.createElement("div");
  mount.className = "layout-host";

  root.replaceChildren();

  if (!matched) {
    const available = uniqueNames.map(name => `<code>${name}</code>`).join(", ");
    const notice = document.createElement("section");
    notice.className = "card";
    notice.style.marginBottom = "12px";
    notice.innerHTML = `
      <h1 class="h1" style="font-size:1.1rem">Unknown Layout</h1>
      <p>Request <code>${requestedKey}</code> not found. Showing <code>${resolvedKey}</code>.</p>
      <p>Available layouts: ${available || "none"}.</p>
    `;
    root.appendChild(notice);
  }

  root.dataset.layout = resolvedKey;
  root.appendChild(mount);

  return resolved.render(mount, ctx);
};

export default LayoutBuilder;
