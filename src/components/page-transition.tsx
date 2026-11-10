import { ViewTransition, type ReactNode } from "react";

/**
 * Wraps a page's content so navigating between pages blurs the old one out and lifts the
 * new one in (see ::view-transition-* in globals.css). It goes in each page.tsx, not the
 * layout: layouts persist across navigations, so enter and exit never fire there.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      {children}
    </ViewTransition>
  );
}
