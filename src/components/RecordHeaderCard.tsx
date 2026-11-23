import { Fragment, useState, type ReactNode } from "react";
import { AuthenticatedImage } from "./AuthenticatedImage";
import ImageLightbox from "./ImageLightbox";
import { useThemeClasses } from "../util/misc/useThemeClasses";

interface RecordHeaderCardProps {
  /** Image src ("" for none); a click shows it large. */
  imageSrc: string;
  imageAlt: string;
  title: string;
  description?: string;
  /** Shown as "Label: value" under the title. */
  facts: { label: string; value: ReactNode }[];
  /** In the middle of the card, right of the title and facts (e.g. totals). */
  middle?: ReactNode;
  /** Buttons on the right (above the comments). */
  actions?: ReactNode;
  comments?: string;
  className?: string;
}

/** The card at the top of a BOM or work-order page: image, title, facts, actions and comments. */
export default function RecordHeaderCard({ imageSrc, imageAlt, title, description, facts, middle, actions, comments, className = "" }: RecordHeaderCardProps) {
  const theme = useThemeClasses();
  const [enlargedImageSrc, setEnlargedImageSrc] = useState<string | null>(null);


  return (
    <div className={`${theme.cardWithText} border rounded-2xl p-4 sm:p-6 shadow-xl flex flex-col lg:flex-row gap-4 sm:gap-6 items-start lg:items-center justify-between transition-colors duration-200 ${className}`}>
      <div className="flex flex-row gap-4 sm:gap-6 items-start sm:items-center w-full lg:w-auto min-w-0">
        <div
          onClick={() => setEnlargedImageSrc(imageSrc || "FAILED")}
          className={`w-20 h-20 sm:w-28 sm:h-28 shrink-0 ${theme.imageBox} border rounded-xl overflow-hidden flex items-center justify-center shadow-inner cursor-pointer hover:opacity-80 transition-opacity`}
          title="Click to enlarge image"
        >
          {imageSrc ? (
            <AuthenticatedImage src={imageSrc} alt={imageAlt} className="w-full h-full object-cover" />
          ) : (
            <span className={`${theme.textMuted} text-xs font-mono`}>NO IMAGE</span>
          )}
        </div>

        <div className="space-y-2 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className={`text-xl sm:text-2xl font-bold tracking-tight break-words ${theme.textHeading}`}>{title}</h1>
            {description && <p className={`text-sm ${theme.textMuted} italic`}>{description}</p>}
          </div>

          <div className={`flex items-center gap-x-5 gap-y-1 text-xs ${theme.textMuted} flex-wrap`}>
            {facts.map((fact) => (
              <Fragment key={fact.label}>
                <p>
                  {fact.label}:{" "}
                  <span className={`${theme.textValue} font-medium`}>{fact.value}</span>
                </p>
              </Fragment>
            ))}
          </div>
        </div>
      </div>

      {middle && <div className="w-full lg:w-auto lg:flex-1 flex lg:justify-center">{middle}</div>}

      <div className={`flex flex-col items-start lg:items-end gap-3 self-stretch lg:self-auto shrink-0 border-t lg:border-t-0 ${theme.border} pt-4 lg:pt-0`}>
        {actions}
        {comments && <p className={`text-xs ${theme.textMuted} italic max-w-xs text-left lg:text-right`}>{comments}</p>}
      </div>

      <ImageLightbox src={enlargedImageSrc} onClose={() => setEnlargedImageSrc(null)} />
    </div>
  );
}
