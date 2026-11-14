// R1: the page title follows the current step, then the host page's own title comes back.
// TODO (FA-3): call setStepTitle on each new step and restoreHostTitle when the flow ends.
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
  if (hostTitle !== null) document.title = hostTitle;
  hostTitle = null;
}
