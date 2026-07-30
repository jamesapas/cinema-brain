"use client";

import { usePathname, useSearchParams } from "next/navigation";
import NProgress from "nprogress";
import { Suspense, useEffect, useRef } from "react";

NProgress.configure({
  showSpinner: false,
  trickleSpeed: 200,
  minimum: 0.1,
});

function NavigationProgressHandler() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeUrlRef = useRef<string | null>(null);

  // Complete the progress bar whenever pathname or query string changes
  useEffect(() => {
    NProgress.done();
    activeUrlRef.current = null;
  }, [pathname, searchParams]);

  // Intercept click on <a> links to start progress bar instantly (0ms) on click
  useEffect(() => {
    const handleAnchorClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a");

      if (!anchor) return;

      const targetUrl = anchor.href;
      const targetPath = anchor.getAttribute("href");

      if (
        targetUrl &&
        targetPath &&
        !targetPath.startsWith("#") &&
        !targetPath.startsWith("javascript:") &&
        anchor.target !== "_blank" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        !event.altKey
      ) {
        const currentUrl = window.location.href;
        if (targetUrl !== currentUrl) {
          activeUrlRef.current = window.location.href;
          NProgress.start();
        }
      }
    };

    document.addEventListener("click", handleAnchorClick, { capture: true });
    return () => {
      document.removeEventListener("click", handleAnchorClick, { capture: true });
    };
  }, []);

  return null;
}

export function NavigationProgressBar() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressHandler />
    </Suspense>
  );
}
