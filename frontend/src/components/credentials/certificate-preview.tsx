"use client";

import { useState } from "react";
import { ExternalLink, FileWarning } from "lucide-react";
import { IPFS_GATEWAY } from "@/lib/config";

/**
 * Inline preview of a certificate, served as a PNG by
 * /api/verify/[credentialId]/preview and rendered on demand from Postgres.
 *
 * It deliberately does *not* embed the file pinned to IPFS. That file is the
 * authoritative artifact and is AES-GCM encrypted, so there is nothing a
 * browser could render, and serving it would hand a stranger ciphertext. The
 * image here is a reduced public representation — notably it carries no award
 * grade. See docs/encrypted-certificates.md.
 *
 * An image rather than the previous <iframe> of a PDF also fixes two things
 * that were never really working: mobile browsers that force a download
 * instead of rendering a PDF inline, and og:image for the LinkedIn share on
 * /c/[credentialId], which cannot point at a PDF.
 */
export function CertificatePreview({
  credentialId,
  cid,
}: {
  credentialId: string;
  /** When given, offers the raw pinned artifact as a secondary link. */
  cid?: string;
}) {
  const [failed, setFailed] = useState(false);
  const previewUrl = `/api/verify/${encodeURIComponent(credentialId)}/preview`;

  return (
    <div className="flex flex-col gap-2">
      <div className="aspect-[1.414/1] w-full overflow-hidden rounded-lg border bg-muted">
        {failed ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <FileWarning className="size-6" />
            Couldn&apos;t render a preview for this credential.
          </div>
        ) : (
          // Plain <img>, not next/image: the route already returns a sized PNG
          // with its own cache headers and ETag, so putting the optimizer in
          // front of it would re-encode an image that is already final.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={`Certificate ${credentialId}`}
            className="size-full object-contain"
            onError={() => setFailed(true)}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <a
          href={previewUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Open full size <ExternalLink className="size-3.5" />
        </a>
        {cid && (
          <a
            href={`${IPFS_GATEWAY}/ipfs/${cid}`}
            target="_blank"
            rel="noreferrer"
            title="The artifact whose fingerprint is anchored on-chain."
            className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            Source document on IPFS <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}
