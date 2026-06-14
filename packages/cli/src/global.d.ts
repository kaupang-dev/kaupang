// Ambient declaration so the CLI's typecheck tolerates @kaupang/studio's `*.html`
// import (its source is reached via tsconfig `paths`). The CLI imports no HTML itself.
declare module "*.html" {
  const content: string;
  export default content;
}
