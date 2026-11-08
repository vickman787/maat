import type { ReactNode } from "react";
import { ShellChrome } from "./ShellChrome";
import type { ShellUser, ShellWorkspace } from "./shell-types";
export type { ShellUser, ShellWorkspace } from "./shell-types";

export function AppShell({
  workspace,
  user,
  children,
}: {
  workspace: ShellWorkspace;
  user: ShellUser;
  children: ReactNode;
}) {
  return (
    <ShellChrome workspace={workspace} user={user}>
      {children}
    </ShellChrome>
  );
}

