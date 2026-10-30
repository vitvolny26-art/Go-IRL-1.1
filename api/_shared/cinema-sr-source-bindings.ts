/** Kino000(SR): server-owned bindings corroborated by #51710 and live registry 2026-10-30.
 * These selectors do not enable a source or authorize a catalog write/publication.
 */
export type SrSourceBinding = {
  sr_source_id: string;
  registry_row_id: string;
  registry_source_id: string;
  venue_id: string;
  registry_source_url: string;
};
export const srOlomoucSourceBindings: readonly Readonly<SrSourceBinding>[] = Object.freeze([
  Object.freeze({ sr_source_id: "cs_olomouc_premiere", registry_row_id: "5e7151bf-4b34-4d9f-9d94-d9c04187a66c", registry_source_id: "premiere_cinemas_cz", venue_id: "03ce6924-f552-48bc-bfeb-75970ddaafe4", registry_source_url: "https://olomouc.premierecinemas.cz/" }),
  Object.freeze({ sr_source_id: "cs_olomouc_cinestar", registry_row_id: "9ef5b312-c33d-40ee-b1b3-da02ede1bfa4", registry_source_id: "cinestar_cz", venue_id: "813ab215-5b87-493e-9f07-8e2a14b4ec7b", registry_source_url: "https://cinestar.cz/cz/olomouc/" }),
  Object.freeze({ sr_source_id: "cs_olomouc_cinemax", registry_row_id: "9fd0e69e-e124-4da2-b998-d36fa0805c8a", registry_source_id: "cinemax_cz", venue_id: "fb0d735e-0402-47f4-b542-bd091bb79595", registry_source_url: "https://www.cine-max.cz/filmy/program" }),
  Object.freeze({ sr_source_id: "cs_olomouc_metropol", registry_row_id: "4e44d287-dd51-40fd-9f04-d1125f2aa859", registry_source_id: "kinometropol_cz", venue_id: "c69faa27-d952-4f09-9e85-8f738996e7f7", registry_source_url: "https://www.kinometropol.cz/kompletni-program" }),
]);

/** Only exact reviewed aliases; no title, host, substring or city-name inference. */
export function selectSrSourceBindings(required: readonly string[]): readonly Readonly<SrSourceBinding>[] {
  return required.map(id => {
    const binding = srOlomoucSourceBindings.find(row => row.sr_source_id === id);
    if (!binding) throw Error(`cinema_sr_registry_source_binding_missing:${id}`);
    return binding;
  });
}
