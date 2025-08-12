import type { Page } from "../router";

const Home: Page = (root, { navigate }) => {
  root.innerHTML = `
    <section class="card">
      <h1 class="h1">Decision Maker V1</h1>
      <p>This tool helps people make decisions when there are many options, many factors to consider, and they all matter to different extents for every individual. One example might be how to choose which apartment is best for you from several options, but this can apply to almost any tough decision.</p>
      <p>There are three main stages to build your layout.</p>
      <p>1. You specify your different options</p>
      <p>2. You determine what factors to consider and which are the most important to you.</p>
      <p>3. Use the built layout to guide your decision.</p>
      <button id="go" style="padding:.5rem .8rem;border-radius:.5rem;border:none;background:var(--accent);color:white">Open Builder</button>
    </section>`;
  root.querySelector<HTMLButtonElement>("#go")!.onclick = () => navigate("/builder");
};

export default Home;
