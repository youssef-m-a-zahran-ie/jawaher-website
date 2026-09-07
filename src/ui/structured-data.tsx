/**
 * Renders a JSON-LD <script> tag from a server-constructed object (see
 * src/lib/structured-data.ts) — the standard, documented pattern for
 * structured data in Next.js. `<` is escaped so a value can never
 * accidentally close the script tag early; every caller passes
 * static/derived-from-our-own-routes data, never raw user input.
 */
export function JsonLd({ data }: { data: object }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
