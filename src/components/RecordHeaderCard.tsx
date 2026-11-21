import { Fragment, useState, type ReactNode } from "react";
import { AuthenticatedImage } from "./AuthenticatedImage";
import ImageLightbox from "./ImageLightbox";
import { useThemeSync } from "../util/misc/useThemeSync";

interface RecordHeaderCardProps {
  /** Image src ("" for none); a click shows it large. */
  imageSrc: string;
  imageAlt: string;
  title: string;
  description?: string;
  /** Shown as "Label: value" under the title. */
  facts: { label: string; value: ReactNode }[];
  /** Buttons on the right (above the comments). */
  actions?: ReactNode;
  comments?: string;
  className?: string;
}

/** The card at the top of a BOM or work-order page: image, title, facts, actions and comments. */
export default function RecordHeaderCard({ imageSrc, imageAlt, title, description, facts, actions, comments, className = "" }: RecordHeaderCardProps) {
  const { isLight } = useThemeSync();
  const [enlargedImageSrc, setEnlargedImageSrc] = useState<string | null>(null);

  const containerBg = isLight ? "bg-white border-zinc-200 text-zinc-900" : "bg-zinc-900 border-zinc-800 text-zinc-100";
  const imageBg = isLight ? "bg-zinc-100 border-zinc-200" : "bg-zinc-950 border-zinc-800";
  const textHeading = isLight ? "text-zinc-900" : "text-white";
  const textMuted = isLight ? "text-zinc-500" : "text-zinc-400";
  const textValue = isLight ? "text-zinc-800" : "text-zinc-200";
  const dividerBorder = isLight ? "border-zinc-200" : "border-zinc-800";

  return (
    <div className={`${containerBg} border rounded-2xl p-6 shadow-xl flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between transition-colors duration-200 ${className}`}>
      <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center w-full lg:w-auto">
        <div
          onClick={() => setEnlargedImageSrc(imageSrc || "FAILED")}
          className={`w-28 h-28 shrink-0 ${imageBg} border rounded-xl overflow-hidden flex items-center justify-center shadow-inner cursor-pointer hover:opacity-80 transition-opacity`}
          title="Click to enlarge image"
        >
          {imageSrc ? (
            <AuthenticatedImage src={imageSrc} alt={imageAlt} className="w-full h-full object-cover" />
          ) : (
            <span className={`${textMuted} text-xs font-mono`}>NO IMAGE</span>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className={`text-2xl font-bold tracking-tight ${textHeading}`}>{title}</h1>
            {description && <p className={`text-sm ${textMuted} italic`}>{description}</p>}
          </div>

          <div className={`flex items-center gap-4 text-xs ${textMuted} flex-wrap`}>
            {facts.map((fact, i) => (
              <Fragment key={fact.label}>
                {i > 0 && <span>•</span>}
                <p>
                  {fact.label}:{" "}
                  <span className={`${textValue} font-medium`}>{fact.value}</span>
                </p>
              </Fragment>
            ))}
          </div>
        </div>
      </div>

      <div className={`flex flex-col items-start lg:items-end gap-3 self-stretch lg:self-auto shrink-0 border-t lg:border-t-0 ${dividerBorder} pt-4 lg:pt-0`}>
        {actions}
        {comments && <p className={`text-xs ${textMuted} italic max-w-xs text-left lg:text-right`}>{comments}</p>}
      </div>

      <ImageLightbox src={enlargedImageSrc} onClose={() => setEnlargedImageSrc(null)} />
    </div>
  );
}
