/**
 * @file auto-type-table.tsx
 * @description Props table sourced from the registry TypeScript, filtered to
 * each component's OWN props (see `@/lib/type-table-data` for the extraction
 * core, shared with the markdown pipeline). Types render as plain monospace,
 * avoiding the shiki dual-theme dark-contrast issue. Async server component.
 */
import { TypeTable } from 'fumadocs-ui/components/type-table';
import { getOwnPropDocs, type TypeTableRef } from '@/lib/type-table-data';

export { hasOwnProps } from '@/lib/type-table-data';

/**
 * Auto-generated props table sourced from the registry TypeScript, scoped in a
 * `.lm-type-table` wrapper (see `src/app/global.css` for the row-alignment rule).
 * Inherited native-element attributes are omitted so the table shows only the
 * component's own props; renders nothing when there are none.
 */
export async function AutoTypeTable({ path: sourcePath, name }: TypeTableRef) {
  const docs = await getOwnPropDocs({ path: sourcePath, name });
  if (docs.length === 0) return null;

  return (
    <div className="lm-type-table">
      {docs.map((doc) => {
        const type = Object.fromEntries(
          doc.entries.map((e) => [
            e.name,
            {
              type: e.type,
              typeDescription: e.fullType,
              description: e.description,
              default: e.default,
              required: e.required,
              deprecated: e.deprecated,
            },
          ]),
        );
        // Caption each table with its type (Props suffix dropped) so a page with
        // several subcomponent tables reads clearly instead of as repeated blocks.
        const label = doc.name.replace(/Props$/, '');
        return (
          <div key={doc.name}>
            <p className="mt-6 mb-2 font-mono text-sm font-semibold text-foreground first:mt-0">
              {label}
            </p>
            <TypeTable type={type} />
          </div>
        );
      })}
    </div>
  );
}
