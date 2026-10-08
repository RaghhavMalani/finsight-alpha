import type { PublicationLicense } from "./contracts";

export function SourceCredit({ licence }: { licence: PublicationLicense }) {
  return (
    <div className="text-xs leading-5 text-muted-foreground break-words">
      <p>
        {licence.attribution ?? licence.dataset_key} · Publication licence: {licence.status}
      </p>
      <p className="flex flex-wrap gap-x-4">
        {licence.source_urls?.map((url, i) => (
          <a key={url} href={url} target="_blank" rel="noreferrer" className="underline">
            Source {i + 1}
          </a>
        ))}
        {licence.terms_url && (
          <a href={licence.terms_url} target="_blank" rel="noreferrer" className="underline">
            Publication basis
          </a>
        )}
      </p>
    </div>
  );
}
