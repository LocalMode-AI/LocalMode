/**
 * @file json-ld.tsx
 * @description Renders a schema.org JSON-LD `<script>`. The data is trusted,
 * app-built static JSON (never user input), so inlining is safe.
 */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
