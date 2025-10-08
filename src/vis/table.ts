import { createBuilderLayout } from "./layoutBuilderFactory";

export const meta = { name: "table" };

export default createBuilderLayout({ previewMode: "after-finish", kind: "table" });
