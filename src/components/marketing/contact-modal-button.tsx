"use client";

import { useState } from "react";

const CONTACT_EMAIL = "awsolim@gmail.com";

const ink = "#26323A";
const inkSoft = "#52616A";
const line = "#DCE4E1";
const green = "#17624F";
const white = "#FFFFFF";

/**
 * Opens a modal with the contact email instead of firing a mailto: link directly --
 * mailto links do nothing useful on a machine with no default mail client configured,
 * which is common enough on desktop that "show the address, let them decide" is more
 * reliable than assuming a mail app will open.
 */
export function ContactModalButton({
  className,
  style,
  headingClassName,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  headingClassName?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail in some contexts -- the email is still shown to copy by hand.
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} style={style}>
        {children}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-[#122420]/60 px-5 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-modal-title"
            className="w-full max-w-sm rounded-[24px] p-6 text-center shadow-[0_24px_60px_rgba(18,36,32,0.28)]"
            style={{ backgroundColor: white }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="contact-modal-title" className={`${headingClassName ?? ""} text-[20px]`} style={{ color: ink }}>
              Get in touch
            </h2>
            <p className="mt-2 text-sm leading-6" style={{ color: inkSoft }}>
              Email us directly and we&rsquo;ll get back to you.
            </p>

            <div className="mt-5 flex items-center justify-between gap-3 rounded-full border px-4 py-3" style={{ borderColor: line }}>
              <span className="truncate text-sm font-semibold" style={{ color: ink }}>
                {CONTACT_EMAIL}
              </span>
              <button
                type="button"
                onClick={() => void copyEmail()}
                className="shrink-0 rounded-full px-3 py-1.5 text-xs font-bold text-white"
                style={{ backgroundColor: green }}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>

            <a href={`mailto:${CONTACT_EMAIL}`} className="mt-4 inline-block text-sm font-semibold" style={{ color: green }}>
              Open in email app
            </a>

            <button type="button" onClick={() => setOpen(false)} className="mt-5 block w-full text-sm font-semibold" style={{ color: "#8A8A8E" }}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
