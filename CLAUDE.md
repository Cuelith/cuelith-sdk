# cuelith-sdk

Protocollo, tipi, SDK, componenti UI e strumenti per i moduli di Cuelith.

**Fonte di verità**: il documento di progetto nel repo `cuelith-docs` (Parte V, specifica tecnica). Leggere le parti I–II per capire il prodotto, poi seguire la Parte V alla lettera per le regole "Deciso"; le "Proposta" si cambiano solo dopo conferma del fondatore.

## Regole di questo repo

- `@cuelith/protocol` è l'unico contratto tra motore, postazioni e moduli. Ogni metodo, tipo o evento si dichiara qui una volta sola (`src/methods.ts`, `src/show.ts`, ...). Una modifica al protocollo aggiorna insieme: tipi qui, motore e postazione in `cuelith-core`, documentazione in `cuelith-docs`, numero di versione (`PROTOCOL_VERSION`, SemVer).
- `@cuelith/sdk` gira nel processo dei moduli (Node, con i permessi di Node attivi): niente dipendenze oltre a `@cuelith/protocol`, stdout riservato al protocollo (console va nel log del motore).
- Nessun testo per l'utente nel codice: solo chiavi di traduzione (`protocol.*`, `core.*`). Le lingue sono moduli (famiglia `locale`).
- Dopo ogni modifica agli schemi: `pnpm build && pnpm -C packages/protocol schema` e committare `schema/` (la CI fallisce se non sono aggiornati).
- Prima di ogni commit: `pnpm check` (typecheck, lint, test) verde.
- Lavoro su `dev`; `main` riceve solo release taggate (SemVer).

## Comandi

```bash
pnpm install
pnpm build
pnpm check
```
