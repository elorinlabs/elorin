import { formatNumber } from "../../../i18n";
import { t as tr, useUiLanguage as useLocale } from "../../../i18n";
import type { ImageModel } from "./image-model";
export interface ImagePixel {
  x: number;
  y: number;
  hex: string;
  rgba: number[];
}
export function ImageInspector({
  model,
  pixel,
}: {
  model: ImageModel;
  pixel?: ImagePixel;
}) {
  useLocale();
  const m = model.metadata;
  return (
    <div className="image-inspector" aria-label={tr("Image inspection")}>
      <p className="image-eyebrow">{tr("IMAGE")}</p>
      <dl>
        <dt>{tr("Format")}</dt>
        <dd>{m.format.toUpperCase()}</dd>
        {m.width && m.height && (
          <>
            <dt>
              {m.derivedGrid ? tr("Coded tile dimensions") : tr("Source dimensions")}
            </dt>
            <dd>
              {formatNumber(m.width)} × {formatNumber(m.height)}
            </dd>
            <dt>{tr("Source pixels")}</dt>
            <dd>{((m.width * m.height) / 1e6).toFixed(2)} MP</dd>
          </>
        )}
        {model.width > 0 && (
          <>
            <dt>{tr("Displayed dimensions")}</dt>
            <dd>
              {model.width} × {model.height}
            </dd>
          </>
        )}
        <dt>{tr("Orientation")}</dt>
        <dd>{m.orientation}</dd>
        <dt>{tr("Decoder")}</dt>
        <dd>{model.decoderName}</dd>
        {m.bitDepth && (
          <>
            <dt>{tr("Bit depth")}</dt>
            <dd>{m.bitDepth}</dd>
          </>
        )}
        {m.alpha !== undefined && (
          <>
            <dt>{tr("Alpha channel")}</dt>
            <dd>{m.alpha ? tr("Yes") : tr("No")}</dd>
          </>
        )}
        <dt>{tr("Color profile")}</dt>
        <dd>{m.colorProfile ?? tr("Unknown / not declared")}</dd>
        {m.colorSpace && (
          <>
            <dt>{tr("Color space")}</dt>
            <dd>{m.colorSpace}</dd>
          </>
        )}
        {m.frames && (
          <>
            <dt>{tr("Frames")}</dt>
            <dd>{m.frames}</dd>
          </>
        )}
        {m.loop !== undefined && (
          <>
            <dt>{tr("Repetitions")}</dt>
            <dd>{m.loop === Infinity ? tr("Infinite") : m.loop}</dd>
          </>
        )}
        {m.pages && (
          <>
            <dt>{tr("Pages")}</dt>
            <dd>{m.pages}</dd>
          </>
        )}
        {m.viewBox && (
          <>
            <dt>{tr("View box")}</dt>
            <dd>{m.viewBox}</dd>
          </>
        )}
        {m.elements && (
          <>
            <dt>{tr("SVG elements")}</dt>
            <dd>{m.elements}</dd>
            <dt>{tr("Paths / text")}</dt>
            <dd>
              {m.paths} / {m.textNodes}
            </dd>
          </>
        )}
        {Object.entries(m.photo).map(([key, value]) => (
          <div key={key}>
            <dt>{tr(key)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {m.variants && (
        <details>
          <summary>{tr("ICO variants (")}{m.variants.length})</summary>
          {m.variants.map((variant, index) => (
            <p key={index}>
              {variant.width} × {variant.height}
            </p>
          ))}
        </details>
      )}
      {m.gps && (
        <details>
          <summary>{tr("Location metadata")}</summary>
          <p>{tr("Latitude:")}{' '}{m.gps.latitude ?? tr("Unavailable")}</p>
          <p>{tr("Longitude:")}{' '}{m.gps.longitude ?? tr("Unavailable")}</p>
          {m.gps.altitude !== undefined && <p>{tr("Altitude:")}{' '}{m.gps.altitude}</p>}
        </details>
      )}
      {pixel && (
        <section>
          <h3>
            {tr("Pixel (")}{pixel.x}, {pixel.y})
          </h3>
          <p>
            {pixel.hex} {' '}{tr("· rgba(")}{pixel.rgba.join(", ")})
          </p>
          <p>
            {tr("Display sRGB sample")}{model.reduced ? tr("from the reduced preview") : ""}{tr("; source profile values are not sampled. Coordinates follow the oriented image.")}</p>
          <button
            onClick={() =>
              void navigator.clipboard.writeText(pixel.hex).catch(() => {})
            }
          >
            {tr("Copy HEX")}</button>
          <button
            onClick={() =>
              void navigator.clipboard
                .writeText(`rgb(${pixel.rgba.slice(0, 3).join(", ")})`)
                .catch(() => {})
            }
          >
            {tr("Copy RGB")}</button>
        </section>
      )}
      {model.error && <p role="alert">{model.error}</p>}
      {model.warnings.map((warning, index) => (
        <p key={index}>{warning}</p>
      ))}
    </div>
  );
}
