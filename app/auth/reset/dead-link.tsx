"use client";

import { Icon } from "@iconify/react";
import Link from "next/link";

import { ForgotPasswordForm } from "@/app/components/forgot-password-form";

/**
 * Recovery links are single-use and short-lived, so this is a normal thing to
 * see rather than a failure worth an alarm. It doesn't say which of the two
 * happened, because the answer changes nothing about what to do next.
 *
 * The way out is the same form that got them here, right here — not a button
 * home that springs the sign-in panel open behind them. Someone whose link died
 * has already made one round trip through their inbox for nothing; the second
 * attempt starts where they're standing.
 *
 * Its own file, and a client one, because the page it sits on is a Server
 * Component and the arrow below is an Iconify glyph — every icon in this app is.
 */
export function DeadLink() {
  return (
    <div className="flex flex-col items-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-bone">This link has expired</h1>
        <p className="mt-1.5 text-sm text-bone-soft">
          Reset links work once, and not long after they&rsquo;re sent. Ask for a
          fresh one and it&rsquo;ll be in your inbox in a moment.
        </p>
      </div>

      <div className="mt-6 w-full">
        <ForgotPasswordForm />
      </div>

      <Link
        href="/"
        className="group mt-5 inline-flex items-center gap-1.5 text-sm text-bone-soft transition-colors hover:text-bone"
      >
        <Icon
          icon="lucide:arrow-left"
          width={15}
          height={15}
          aria-hidden
          className="transition-transform group-hover:-translate-x-0.5"
        />
        <span className="decoration-bone-dim underline-offset-4 group-hover:underline">
          Back to Kino
        </span>
      </Link>
    </div>
  );
}
