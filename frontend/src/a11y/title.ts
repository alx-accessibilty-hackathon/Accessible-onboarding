// R1: the page title follows the current step, then the host page's own title comes back.
let hostTitle: string | null = null;
let enabled = true;

export function rememberHostTitle(manageTitle = true): void {
  enabled = manageTitle;
  if (hostTitle === null) hostTitle = document.title;
}

export function setStepTitle(text: string): void {
  if (enabled && hostTitle !== null) document.title = `${text} – ${hostTitle}`;
}

export function restoreHostTitle(): void {
  // With manage-title="false" we never changed the title: leave the page's own title alone
  // (it may have changed meanwhile, e.g. the staff page naming the open form).
  if (hostTitle !== null && enabled) document.title = hostTitle;
  hostTitle = null;
}
