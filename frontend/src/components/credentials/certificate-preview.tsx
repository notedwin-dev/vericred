"use client";

import { useState } from "react";
import { ExternalLink, FileWarning } from "lucide-react";
import { IPFS_GATEWAY } from "@/lib/config";

/**
 * Inline preview of the certificate PDF pinned to IPFS. Browsers with a
 * built-in PDF viewer (Chrome, Firefox, Edge, most of Safari) render it
 * directly in the iframe — no PDF.js or extra dependency needed. Some
 * mobile browsers force a download instead of rendering inline, so this
 * always keeps an "Open in new tab" fallback visible underneath, and
 * shows a friendlier message if the iframe fails to load at all (e.g. a
 * gateway timeout).
 */
export function CertificatePreview({ cid }: { cid: string }) {
  const [failed, setFailed] = useState(false);
  const url = `${IPFS_GATEWAY}/ipfs/${cid}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="aspect-[1.414/1] w-full overflow-hidden rounded-lg border bg-muted">
        {failed ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <FileWarning className="size-6" />
            Couldn&apos;t load a preview. The document is still on IPFS — open it directly below.
          </div>
        ) : (
          <iframe
            src={`${url}#toolbar=0&navpanes=0`}
            title="Certificate document preview"
            className="size-full"
            onError={() => setFailed(true)}
          />
        )}
      </div>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        View source document on IPFS <ExternalLink className="size-3.5" />
      </a>
    </div>
  );
}
