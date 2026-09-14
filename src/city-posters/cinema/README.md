# City Posters — Cinema

Target ownership after AFISHI002:

- `/city-posters` owns the Cinema UI.
- City Posters Home stays the four-category launcher; Cinema content renders inside Catalog after selecting Cinema (and as the first implemented provider under All).
- `CinemaPostersCatalog.tsx` is the React surface used by City Posters Catalog and uses the existing QueryClientProvider.
- `cinemaRepository.ts` reads a narrow public Supabase RPC; it does not open base cinema tables to `anon`.
- `cinemaModel.ts` contains deterministic client-side time/search/grouping/action-URL rules.
- One movie is one City Posters card; screenings from multiple cinemas are grouped inside that card.
- The legacy global `src/cinema/cinema-entry.ts` side-effect must be removed from `index.html` when this slice is integrated.
- Cinema ingestion remains independent; this slice is read/UI only and does not add cinema sources.
