"use client";

import { X, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Message } from "@/types";
import { useTranslations } from "next-intl";
import NextImage from "next/image";

interface ReplyQuoteProps {
  /** Sender label of the quoted message: "You" for our own messages,
   *  contact name for customer-sent messages. Caller resolves this — the
   *  quote component doesn't see the parent Message. */
  authorLabel: string;
  /** Compact text preview. Falls back to a placeholder for media types. */
  preview: string;
  /** URL of the referenced media, used to show a thumbnail for images. */
  mediaUrl?: string | null;
  /** Content type of the referenced message (image, video, audio, …). */
  contentType?: string;
  /** Called when the user clicks the quote to jump to the original message. */
  onJump?: () => void;
  /** Present → renders the composer-chip variant with an X button. Absent →
   *  renders the embedded-in-bubble variant. */
  onDismiss?: () => void;
  /** True when embedded inside an outbound (primary-filled) bubble, so the
   *  quote must read against the primary surface rather than the neutral
   *  foreground — otherwise it goes low-contrast in light mode. */
  onPrimary?: boolean;
}

export function ReplyQuote({
  authorLabel,
  preview,
  mediaUrl,
  contentType,
  onJump,
  onDismiss,
  onPrimary = false,
}: ReplyQuoteProps) {
  const t = useTranslations("Inbox.replyQuote");
  const isChip = !!onDismiss;
  const isImage = contentType === "image" && !!mediaUrl;

  return (
    <div
      role={onJump ? "button" : undefined}
      tabIndex={onJump ? 0 : undefined}
      onClick={onJump}
      onKeyDown={(e) => e.key === "Enter" && onJump?.()}
      className={cn(
        "flex items-start gap-2 border-l-2 px-2 py-1",
        onPrimary ? "border-primary-foreground/50" : "border-primary",
        isChip
          ? "rounded-md bg-muted/80"
          : onPrimary
            ? "mb-1.5 rounded-md bg-primary-foreground/15"
            : "mb-1.5 rounded-md bg-background/20",
        onJump && "cursor-pointer transition-opacity hover:opacity-80",
      )}
    >
      {/* Image thumbnail for image replies */}
      {isImage && (
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded">
          <NextImage
            src={mediaUrl!}
            alt=""
            fill
            className="object-cover"
            sizes="40px"
            unoptimized
          />
        </div>
      )}
      {/* Placeholder icon for non-image media (no thumbnail) */}
      {!isImage && contentType && contentType !== "text" && !mediaUrl && (
        <div className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded",
          onPrimary ? "bg-primary-foreground/10" : "bg-muted",
        )}>
          <ImageIcon className={cn("h-4 w-4", onPrimary ? "text-primary-foreground/60" : "text-muted-foreground")} />
        </div>
      )}

      <div className="min-w-0 flex-1 overflow-hidden">
        <div
          className={cn(
            "truncate text-[11px] font-medium",
            onPrimary ? "text-primary-foreground" : "text-primary",
          )}
        >
          {authorLabel}
        </div>
        {/* Wrap the preview instead of truncating to a single line.
         *  `truncate` (white-space: nowrap) forced the quote onto one
         *  impossibly-wide line and — because the parent flex chain
         *  lacked `min-w-0` at every step — pushed the entire inbox
         *  layout wider, shoving the contact sidebar off-screen.
         *  `break-words` also wraps long URLs that have no whitespace
         *  to break on. Issue #165. */}
        <div className="whitespace-pre-wrap break-words text-xs text-foreground/80">
          {preview}
        </div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          aria-label={t("cancelReply")}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Build the preview info shown inside a reply quote. */
export function buildReplyPreview(
  message: Message,
  t: ReturnType<typeof useTranslations>,
): { preview: string; mediaUrl: string | null; contentType: string } {
  const mediaUrl = message.media_url ?? null;
  const contentType = message.content_type;

  let preview: string;
  if (message.content_text) {
    preview = message.content_text;
  } else {
    switch (contentType) {
      case "image":    preview = t("photo");    break;
      case "video":    preview = t("video");    break;
      case "audio":    preview = t("audio");    break;
      case "document": preview = t("document"); break;
      case "location": preview = t("location"); break;
      case "template": preview = t("template"); break;
      default:         preview = t("message");  break;
    }
  }

  return { preview, mediaUrl, contentType };
}
